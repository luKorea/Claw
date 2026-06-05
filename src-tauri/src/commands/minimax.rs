use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::Channel;

use crate::error::{AppError, AppResult};

pub const MINIMAX_ANTHROPIC_MESSAGES_URL: &str = "https://api.minimax.io/anthropic/v1/messages";

static CANCELLED_STREAMS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniMaxStreamInput {
    request_id: String,
    api_key: String,
    body: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct MiniMaxUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum MiniMaxStreamEvent {
    TextDelta { text: String },
    ThinkingDelta { thinking: String },
    ToolUseStart { id: String, name: String },
    ToolUseDelta { id: String, input_delta: String },
    ToolUseEnd { id: String, input: Value },
    Usage { usage: MiniMaxUsage },
    Done { stop_reason: Option<String> },
    Error { message: String },
}

#[derive(Default)]
pub struct MiniMaxParseState {
    index_to_tool_id: HashMap<i64, String>,
    tool_input_acc: HashMap<String, String>,
    done_seen: bool,
}

fn cancel_registry() -> &'static Mutex<HashSet<String>> {
    CANCELLED_STREAMS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn with_cancel_registry<T>(f: impl FnOnce(&mut HashSet<String>) -> T) -> AppResult<T> {
    let mut guard = cancel_registry()
        .lock()
        .map_err(|_| AppError::Other("MiniMax cancel registry poisoned".to_string()))?;
    Ok(f(&mut guard))
}

pub fn register_minimax_stream(request_id: &str) -> AppResult<()> {
    with_cancel_registry(|set| {
        set.remove(request_id);
    })
}

pub fn mark_minimax_stream_cancelled(request_id: &str) -> AppResult<()> {
    with_cancel_registry(|set| {
        set.insert(request_id.to_string());
    })
}

pub fn clear_minimax_stream(request_id: &str) -> AppResult<()> {
    with_cancel_registry(|set| {
        set.remove(request_id);
    })
}

pub fn is_minimax_stream_cancelled(request_id: &str) -> AppResult<bool> {
    with_cancel_registry(|set| set.contains(request_id))
}

fn send_event(on_event: &Channel<MiniMaxStreamEvent>, event: MiniMaxStreamEvent) -> AppResult<()> {
    on_event
        .send(event)
        .map_err(|e| AppError::Other(format!("MiniMax stream channel send failed: {e}")))
}

fn sanitize_error(message: &str, api_key: &str) -> String {
    if api_key.is_empty() {
        return message.to_string();
    }
    message.replace(api_key, "[secret]")
}

fn ensure_streaming_body(body: &Value) -> AppResult<Value> {
    let mut body = body.clone();
    let Some(obj) = body.as_object_mut() else {
        return Err(AppError::InvalidInput(
            "MiniMax request body must be an object".to_string(),
        ));
    };
    obj.insert("stream".to_string(), Value::Bool(true));
    Ok(body)
}

pub fn find_sse_separator(buffer: &str) -> Option<(usize, usize)> {
    match (buffer.find("\n\n"), buffer.find("\r\n\r\n")) {
        (Some(lf), Some(crlf)) if lf < crlf => Some((lf, 2)),
        (Some(_), Some(crlf)) => Some((crlf, 4)),
        (Some(lf), None) => Some((lf, 2)),
        (None, Some(crlf)) => Some((crlf, 4)),
        (None, None) => None,
    }
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

fn usage_from_value(value: &Value) -> MiniMaxUsage {
    MiniMaxUsage {
        input_tokens: value
            .get("input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: value
            .get("output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_read_input_tokens: value.get("cache_read_input_tokens").and_then(Value::as_u64),
        cache_creation_input_tokens: value
            .get("cache_creation_input_tokens")
            .and_then(Value::as_u64),
    }
}

pub fn parse_minimax_sse_block(
    state: &mut MiniMaxParseState,
    block: &str,
) -> Vec<MiniMaxStreamEvent> {
    let Some(data) = data_payload(block) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&data) else {
        return Vec::new();
    };

    let event_type = value.get("type").and_then(Value::as_str).unwrap_or("");
    match event_type {
        "message_start" => value
            .pointer("/message/usage")
            .map(|usage| {
                vec![MiniMaxStreamEvent::Usage {
                    usage: usage_from_value(usage),
                }]
            })
            .unwrap_or_default(),
        "content_block_start" => parse_content_block_start(state, &value),
        "content_block_delta" => parse_content_block_delta(state, &value),
        "content_block_stop" => parse_content_block_stop(state, &value),
        "message_delta" => parse_message_delta(state, &value),
        "message_stop" => {
            state.done_seen = true;
            vec![MiniMaxStreamEvent::Done { stop_reason: None }]
        }
        "error" => {
            let message = value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("MiniMax stream error")
                .to_string();
            vec![MiniMaxStreamEvent::Error { message }]
        }
        _ => Vec::new(),
    }
}

fn parse_content_block_start(
    state: &mut MiniMaxParseState,
    value: &Value,
) -> Vec<MiniMaxStreamEvent> {
    let block = value.get("content_block").unwrap_or(&Value::Null);
    match block.get("type").and_then(Value::as_str) {
        Some("text") => block
            .get("text")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(|text| {
                vec![MiniMaxStreamEvent::TextDelta {
                    text: text.to_string(),
                }]
            })
            .unwrap_or_default(),
        Some("thinking") => block
            .get("thinking")
            .and_then(Value::as_str)
            .filter(|thinking| !thinking.is_empty())
            .map(|thinking| {
                vec![MiniMaxStreamEvent::ThinkingDelta {
                    thinking: thinking.to_string(),
                }]
            })
            .unwrap_or_default(),
        Some("tool_use") => {
            let Some(id) = block.get("id").and_then(Value::as_str) else {
                return Vec::new();
            };
            let Some(name) = block.get("name").and_then(Value::as_str) else {
                return Vec::new();
            };
            if let Some(index) = value.get("index").and_then(Value::as_i64) {
                state.index_to_tool_id.insert(index, id.to_string());
                state.tool_input_acc.insert(id.to_string(), String::new());
            }
            vec![MiniMaxStreamEvent::ToolUseStart {
                id: id.to_string(),
                name: name.to_string(),
            }]
        }
        _ => Vec::new(),
    }
}

fn parse_content_block_delta(
    state: &mut MiniMaxParseState,
    value: &Value,
) -> Vec<MiniMaxStreamEvent> {
    let delta = value.get("delta").unwrap_or(&Value::Null);
    match delta.get("type").and_then(Value::as_str) {
        Some("text_delta") => delta
            .get("text")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(|text| {
                vec![MiniMaxStreamEvent::TextDelta {
                    text: text.to_string(),
                }]
            })
            .unwrap_or_default(),
        Some("thinking_delta") => delta
            .get("thinking")
            .and_then(Value::as_str)
            .filter(|thinking| !thinking.is_empty())
            .map(|thinking| {
                vec![MiniMaxStreamEvent::ThinkingDelta {
                    thinking: thinking.to_string(),
                }]
            })
            .unwrap_or_default(),
        Some("input_json_delta") => {
            let Some(index) = value.get("index").and_then(Value::as_i64) else {
                return Vec::new();
            };
            let Some(id) = state.index_to_tool_id.get(&index).cloned() else {
                return Vec::new();
            };
            let input_delta = delta
                .get("partial_json")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let acc = state.tool_input_acc.entry(id.clone()).or_default();
            acc.push_str(&input_delta);
            vec![MiniMaxStreamEvent::ToolUseDelta { id, input_delta }]
        }
        _ => Vec::new(),
    }
}

fn parse_content_block_stop(
    state: &mut MiniMaxParseState,
    value: &Value,
) -> Vec<MiniMaxStreamEvent> {
    let Some(index) = value.get("index").and_then(Value::as_i64) else {
        return Vec::new();
    };
    let Some(id) = state.index_to_tool_id.remove(&index) else {
        return Vec::new();
    };
    let raw = state.tool_input_acc.remove(&id).unwrap_or_default();
    let input = if raw.is_empty() {
        Value::Object(serde_json::Map::new())
    } else {
        serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| serde_json::json!({ "__raw": raw }))
    };
    vec![MiniMaxStreamEvent::ToolUseEnd { id, input }]
}

fn parse_message_delta(state: &mut MiniMaxParseState, value: &Value) -> Vec<MiniMaxStreamEvent> {
    let mut events = Vec::new();
    if let Some(usage) = value.get("usage") {
        events.push(MiniMaxStreamEvent::Usage {
            usage: usage_from_value(usage),
        });
    }
    if let Some(stop_reason) = value.pointer("/delta/stop_reason") {
        state.done_seen = true;
        events.push(MiniMaxStreamEvent::Done {
            stop_reason: stop_reason.as_str().map(ToOwned::to_owned),
        });
    }
    events
}

async fn stream_minimax_inner(
    input: &MiniMaxStreamInput,
    on_event: &Channel<MiniMaxStreamEvent>,
) -> AppResult<()> {
    if input.request_id.trim().is_empty() {
        return Err(AppError::InvalidInput("requestId 不能为空".to_string()));
    }
    if input.api_key.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "MiniMax API Key 不能为空".to_string(),
        ));
    }

    let body = ensure_streaming_body(&input.body)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Other(format!("MiniMax reqwest client build failed: {e}")))?;

    let response = client
        .post(MINIMAX_ANTHROPIC_MESSAGES_URL)
        .header("x-api-key", input.api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("MiniMax request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Other(format!(
            "MiniMax HTTP {status}: {}",
            body.chars().take(500).collect::<String>()
        )));
    }

    let mut buffer = String::new();
    let mut state = MiniMaxParseState::default();
    let mut response = response;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| AppError::Other(format!("MiniMax stream read failed: {e}")))?
    {
        if is_minimax_stream_cancelled(&input.request_id)? {
            return Ok(());
        }
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some((sep, sep_len)) = find_sse_separator(&buffer) {
            let block = buffer[..sep].to_string();
            buffer = buffer[sep + sep_len..].to_string();
            for event in parse_minimax_sse_block(&mut state, &block) {
                send_event(on_event, event)?;
            }
        }
    }

    if !buffer.trim().is_empty() {
        for event in parse_minimax_sse_block(&mut state, &buffer) {
            send_event(on_event, event)?;
        }
    }

    if !state.done_seen {
        send_event(on_event, MiniMaxStreamEvent::Done { stop_reason: None })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn stream_minimax_anthropic(
    input: MiniMaxStreamInput,
    on_event: Channel<MiniMaxStreamEvent>,
) -> AppResult<()> {
    register_minimax_stream(&input.request_id)?;
    let result = stream_minimax_inner(&input, &on_event).await;
    let _ = clear_minimax_stream(&input.request_id);

    if let Err(err) = result {
        let message = sanitize_error(&err.to_string(), &input.api_key);
        send_event(&on_event, MiniMaxStreamEvent::Error { message })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_minimax_stream(request_id: String) -> AppResult<()> {
    mark_minimax_stream_cancelled(&request_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_text_delta_events() {
        let mut state = MiniMaxParseState::default();
        let events = parse_minimax_sse_block(
            &mut state,
            r#"data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}"#,
        );
        assert_eq!(
            events,
            vec![MiniMaxStreamEvent::TextDelta {
                text: "OK".to_string()
            }]
        );
    }

    #[test]
    fn parses_thinking_delta_events() {
        let mut state = MiniMaxParseState::default();
        let events = parse_minimax_sse_block(
            &mut state,
            r#"data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}"#,
        );
        assert_eq!(
            events,
            vec![MiniMaxStreamEvent::ThinkingDelta {
                thinking: "hmm".to_string()
            }]
        );
    }

    #[test]
    fn parses_tool_use_start_delta_and_end() {
        let mut state = MiniMaxParseState::default();
        let start = parse_minimax_sse_block(
            &mut state,
            r#"data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_1","name":"read_file"}}"#,
        );
        assert_eq!(
            start,
            vec![MiniMaxStreamEvent::ToolUseStart {
                id: "tool_1".to_string(),
                name: "read_file".to_string()
            }]
        );

        let delta = parse_minimax_sse_block(
            &mut state,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"path\":\"/tmp/a\"}"}}"#,
        );
        assert_eq!(
            delta,
            vec![MiniMaxStreamEvent::ToolUseDelta {
                id: "tool_1".to_string(),
                input_delta: r#"{"path":"/tmp/a"}"#.to_string()
            }]
        );

        let end = parse_minimax_sse_block(
            &mut state,
            r#"data: {"type":"content_block_stop","index":0}"#,
        );
        assert_eq!(
            end,
            vec![MiniMaxStreamEvent::ToolUseEnd {
                id: "tool_1".to_string(),
                input: json!({ "path": "/tmp/a" })
            }]
        );
    }

    #[test]
    fn parses_usage_and_done() {
        let mut state = MiniMaxParseState::default();
        let events = parse_minimax_sse_block(
            &mut state,
            r#"data: {"type":"message_delta","usage":{"input_tokens":3,"output_tokens":4},"delta":{"stop_reason":"end_turn"}}"#,
        );
        assert_eq!(
            events,
            vec![
                MiniMaxStreamEvent::Usage {
                    usage: MiniMaxUsage {
                        input_tokens: 3,
                        output_tokens: 4,
                        cache_read_input_tokens: None,
                        cache_creation_input_tokens: None,
                    }
                },
                MiniMaxStreamEvent::Done {
                    stop_reason: Some("end_turn".to_string())
                }
            ]
        );
        assert!(state.done_seen);
    }

    #[test]
    fn sanitize_error_redacts_api_key() {
        let msg = sanitize_error("bad sk-cp-secret value", "sk-cp-secret");
        assert_eq!(msg, "bad [secret] value");
    }

    #[test]
    fn cancel_registry_tracks_state() {
        let request_id = "test-cancel-registry";
        clear_minimax_stream(request_id).unwrap();
        register_minimax_stream(request_id).unwrap();
        assert!(!is_minimax_stream_cancelled(request_id).unwrap());
        mark_minimax_stream_cancelled(request_id).unwrap();
        assert!(is_minimax_stream_cancelled(request_id).unwrap());
        clear_minimax_stream(request_id).unwrap();
        assert!(!is_minimax_stream_cancelled(request_id).unwrap());
    }
}
