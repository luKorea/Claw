use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::Deserialize;
use serde_json::Value;
use tauri::ipc::Channel;

use crate::commands::minimax::{
    find_sse_separator, parse_minimax_sse_block, MiniMaxParseState, MiniMaxStreamEvent,
    MiniMaxUsage,
};
use crate::error::{AppError, AppResult};

static CANCELLED_STREAMS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderStreamInput {
    request_id: String,
    protocol: CustomProviderProtocol,
    base_url: String,
    api_key: String,
    body: Value,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CustomProviderProtocol {
    OpenAiCompatible,
    AnthropicCompatible,
}

fn cancel_registry() -> &'static Mutex<HashSet<String>> {
    CANCELLED_STREAMS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn with_cancel_registry<T>(f: impl FnOnce(&mut HashSet<String>) -> T) -> AppResult<T> {
    let mut guard = cancel_registry()
        .lock()
        .map_err(|_| AppError::Other("Custom provider cancel registry poisoned".to_string()))?;
    Ok(f(&mut guard))
}

pub fn register_custom_stream(request_id: &str) -> AppResult<()> {
    with_cancel_registry(|set| {
        set.remove(request_id);
    })
}

pub fn mark_custom_stream_cancelled(request_id: &str) -> AppResult<()> {
    with_cancel_registry(|set| {
        set.insert(request_id.to_string());
    })
}

pub fn clear_custom_stream(request_id: &str) -> AppResult<()> {
    with_cancel_registry(|set| {
        set.remove(request_id);
    })
}

pub fn is_custom_stream_cancelled(request_id: &str) -> AppResult<bool> {
    with_cancel_registry(|set| set.contains(request_id))
}

pub fn validate_custom_base_url(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(trimmed)
        .map_err(|e| AppError::InvalidInput(format!("自定义 Base URL 无效: {e}")))?;
    let host = parsed.host_str().unwrap_or_default();
    let is_local_http =
        parsed.scheme() == "http" && matches!(host, "localhost" | "127.0.0.1" | "::1");
    if parsed.scheme() != "https" && !is_local_http {
        return Err(AppError::InvalidInput(
            "自定义 Base URL 必须使用 https，或本地 localhost http".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

fn ensure_streaming_body(body: &Value) -> AppResult<Value> {
    let mut body = body.clone();
    let Some(obj) = body.as_object_mut() else {
        return Err(AppError::InvalidInput(
            "Custom provider request body must be an object".to_string(),
        ));
    };
    obj.insert("stream".to_string(), Value::Bool(true));
    Ok(body)
}

fn endpoint(protocol: CustomProviderProtocol, base_url: &str) -> String {
    match protocol {
        CustomProviderProtocol::OpenAiCompatible => {
            format!("{}/chat/completions", base_url.trim_end_matches('/'))
        }
        CustomProviderProtocol::AnthropicCompatible => {
            format!("{}/v1/messages", base_url.trim_end_matches('/'))
        }
    }
}

fn sanitize_error(message: &str, api_key: &str) -> String {
    if api_key.is_empty() {
        return message.to_string();
    }
    message.replace(api_key, "[secret]")
}

fn send_event(
    on_event: &Channel<MiniMaxStreamEvent>,
    event: MiniMaxStreamEvent,
) -> AppResult<()> {
    on_event
        .send(event)
        .map_err(|e| AppError::Other(format!("Custom provider channel send failed: {e}")))
}

fn data_payload(block: &str) -> Option<String> {
    let data = block
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>()
        .join("\n");
    if data.is_empty() || data == "[DONE]" {
        return None;
    }
    Some(data)
}

#[derive(Default)]
struct OaiParseState {
    tool_acc: HashMap<i64, OaiToolAcc>,
}

#[derive(Default)]
struct OaiToolAcc {
    id: Option<String>,
    name: Option<String>,
    args: String,
    started: bool,
}

fn flush_oai_tools(state: &mut OaiParseState) -> Vec<MiniMaxStreamEvent> {
    let mut events = Vec::new();
    for (_, acc) in state.tool_acc.drain() {
        let Some(id) = acc.id else {
            continue;
        };
        let input = if acc.args.is_empty() {
            Value::Object(serde_json::Map::new())
        } else {
            serde_json::from_str::<Value>(&acc.args)
                .unwrap_or_else(|_| serde_json::json!({ "__raw": acc.args }))
        };
        events.push(MiniMaxStreamEvent::ToolUseEnd { id, input });
    }
    events
}

fn parse_oai_sse_block(state: &mut OaiParseState, block: &str) -> Vec<MiniMaxStreamEvent> {
    let Some(data) = data_payload(block) else {
        if block.lines().any(|line| line.trim() == "data: [DONE]") {
            return flush_oai_tools(state);
        }
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&data) else {
        return Vec::new();
    };
    let mut events = Vec::new();

    if let Some(usage) = value.get("usage") {
        events.push(MiniMaxStreamEvent::Usage {
            usage: MiniMaxUsage {
                input_tokens: usage
                    .get("prompt_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                output_tokens: usage
                    .get("completion_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                cache_read_input_tokens: usage
                    .get("cache_read_input_tokens")
                    .and_then(Value::as_u64),
                cache_creation_input_tokens: None,
            },
        });
    }

    let Some(choices) = value.get("choices").and_then(Value::as_array) else {
        return events;
    };
    for choice in choices {
        let delta = choice.get("delta").unwrap_or(&Value::Null);
        if let Some(text) = delta.get("content").and_then(Value::as_str) {
            if !text.is_empty() {
                events.push(MiniMaxStreamEvent::TextDelta {
                    text: text.to_string(),
                });
            }
        }
        if let Some(thinking) = delta.get("reasoning_content").and_then(Value::as_str) {
            if !thinking.is_empty() {
                events.push(MiniMaxStreamEvent::ThinkingDelta {
                    thinking: thinking.to_string(),
                });
            }
        }
        if let Some(tool_calls) = delta.get("tool_calls").and_then(Value::as_array) {
            for tool_call in tool_calls {
                let Some(index) = tool_call.get("index").and_then(Value::as_i64) else {
                    continue;
                };
                let acc = state.tool_acc.entry(index).or_default();
                let function = tool_call.get("function").unwrap_or(&Value::Null);
                let id = tool_call.get("id").and_then(Value::as_str);
                let name = function.get("name").and_then(Value::as_str);
                if acc.id.is_none() {
                    acc.id = id.map(ToOwned::to_owned);
                }
                if acc.name.is_none() {
                    acc.name = name.map(ToOwned::to_owned);
                }
                if let (Some(id), Some(name)) = (&acc.id, &acc.name) {
                    if !acc.started {
                        acc.started = true;
                        events.push(MiniMaxStreamEvent::ToolUseStart {
                            id: id.clone(),
                            name: name.clone(),
                        });
                    }
                }
                if let Some(args) = function.get("arguments").and_then(Value::as_str) {
                    acc.args.push_str(args);
                    if let Some(id) = &acc.id {
                        events.push(MiniMaxStreamEvent::ToolUseDelta {
                            id: id.clone(),
                            input_delta: args.to_string(),
                        });
                    }
                }
            }
        }
        if let Some(stop_reason) = choice.get("finish_reason").and_then(Value::as_str) {
            events.extend(flush_oai_tools(state));
            events.push(MiniMaxStreamEvent::Done {
                stop_reason: Some(stop_reason.to_string()),
            });
        }
    }

    events
}

async fn stream_custom_inner(
    input: &CustomProviderStreamInput,
    on_event: &Channel<MiniMaxStreamEvent>,
) -> AppResult<()> {
    if input.request_id.trim().is_empty() {
        return Err(AppError::InvalidInput("requestId 不能为空".to_string()));
    }
    if input.api_key.trim().is_empty() {
        return Err(AppError::InvalidInput("自定义模型 API Key 不能为空".to_string()));
    }

    let base_url = validate_custom_base_url(&input.base_url)?;
    let body = ensure_streaming_body(&input.body)?;
    let url = endpoint(input.protocol, &base_url);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Other(format!("Custom provider client build failed: {e}")))?;

    let mut request = client.post(url).json(&body);
    request = match input.protocol {
        CustomProviderProtocol::OpenAiCompatible => {
            request.bearer_auth(input.api_key.trim())
        }
        CustomProviderProtocol::AnthropicCompatible => request
            .header("x-api-key", input.api_key.trim())
            .header("anthropic-version", "2023-06-01"),
    };

    let response = request
        .send()
        .await
        .map_err(|e| AppError::Other(format!("Custom provider request failed: {e}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Other(format!(
            "Custom provider HTTP {status}: {}",
            body.chars().take(500).collect::<String>()
        )));
    }

    let mut response = response;
    let mut buffer = String::new();
    let mut anthropic_state = MiniMaxParseState::default();
    let mut oai_state = OaiParseState::default();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| AppError::Other(format!("Custom provider stream read failed: {e}")))?
    {
        if is_custom_stream_cancelled(&input.request_id)? {
            return Ok(());
        }
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some((sep, sep_len)) = find_sse_separator(&buffer) {
            let block = buffer[..sep].to_string();
            buffer = buffer[sep + sep_len..].to_string();
            let events = match input.protocol {
                CustomProviderProtocol::OpenAiCompatible => {
                    parse_oai_sse_block(&mut oai_state, &block)
                }
                CustomProviderProtocol::AnthropicCompatible => {
                    parse_minimax_sse_block(&mut anthropic_state, &block)
                }
            };
            for event in events {
                send_event(on_event, event)?;
            }
        }
    }

    if !buffer.trim().is_empty() {
        let events = match input.protocol {
            CustomProviderProtocol::OpenAiCompatible => {
                parse_oai_sse_block(&mut oai_state, &buffer)
            }
            CustomProviderProtocol::AnthropicCompatible => {
                parse_minimax_sse_block(&mut anthropic_state, &buffer)
            }
        };
        for event in events {
            send_event(on_event, event)?;
        }
    }

    send_event(on_event, MiniMaxStreamEvent::Done { stop_reason: None })?;
    Ok(())
}

#[tauri::command]
pub async fn stream_custom_provider(
    input: CustomProviderStreamInput,
    on_event: Channel<MiniMaxStreamEvent>,
) -> AppResult<()> {
    register_custom_stream(&input.request_id)?;
    let result = stream_custom_inner(&input, &on_event).await;
    let _ = clear_custom_stream(&input.request_id);

    if let Err(err) = result {
        let message = sanitize_error(&err.to_string(), &input.api_key);
        send_event(&on_event, MiniMaxStreamEvent::Error { message })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_custom_provider_stream(request_id: String) -> AppResult<()> {
    mark_custom_stream_cancelled(&request_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_custom_base_url_accepts_https_and_local_http() {
        assert_eq!(
            validate_custom_base_url("https://example.com/v1/").unwrap(),
            "https://example.com/v1"
        );
        assert!(validate_custom_base_url("http://localhost:11434/v1").is_ok());
        assert!(validate_custom_base_url("http://127.0.0.1:11434/v1").is_ok());
    }

    #[test]
    fn validate_custom_base_url_rejects_remote_http() {
        let err = validate_custom_base_url("http://example.com/v1").unwrap_err();
        assert!(err.to_string().contains("https"));
    }

    #[test]
    fn parses_openai_text_usage_and_done() {
        let mut state = OaiParseState::default();
        let events = parse_oai_sse_block(
            &mut state,
            r#"data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}"#,
        );
        assert_eq!(
            events,
            vec![
                MiniMaxStreamEvent::Usage {
                    usage: MiniMaxUsage {
                        input_tokens: 3,
                        output_tokens: 1,
                        cache_read_input_tokens: None,
                        cache_creation_input_tokens: None,
                    }
                },
                MiniMaxStreamEvent::TextDelta {
                    text: "OK".to_string(),
                },
                MiniMaxStreamEvent::Done {
                    stop_reason: Some("stop".to_string()),
                },
            ]
        );
    }

    #[test]
    fn parses_openai_tool_calls() {
        let mut state = OaiParseState::default();
        let events = parse_oai_sse_block(
            &mut state,
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\"path\":\"/tmp/a\"}"}}]},"finish_reason":"tool_calls"}]}"#,
        );
        assert_eq!(
            events,
            vec![
                MiniMaxStreamEvent::ToolUseStart {
                    id: "call_1".to_string(),
                    name: "read_file".to_string(),
                },
                MiniMaxStreamEvent::ToolUseDelta {
                    id: "call_1".to_string(),
                    input_delta: r#"{"path":"/tmp/a"}"#.to_string(),
                },
                MiniMaxStreamEvent::ToolUseEnd {
                    id: "call_1".to_string(),
                    input: serde_json::json!({ "path": "/tmp/a" }),
                },
                MiniMaxStreamEvent::Done {
                    stop_reason: Some("tool_calls".to_string()),
                },
            ]
        );
    }

    #[test]
    fn custom_cancel_registry_tracks_state() {
        let request_id = "custom-cancel-registry";
        clear_custom_stream(request_id).unwrap();
        register_custom_stream(request_id).unwrap();
        assert!(!is_custom_stream_cancelled(request_id).unwrap());
        mark_custom_stream_cancelled(request_id).unwrap();
        assert!(is_custom_stream_cancelled(request_id).unwrap());
        clear_custom_stream(request_id).unwrap();
        assert!(!is_custom_stream_cancelled(request_id).unwrap());
    }
}
