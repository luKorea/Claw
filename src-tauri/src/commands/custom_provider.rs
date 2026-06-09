use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::ipc::Channel;
use uuid::Uuid;

use crate::commands::minimax::{
    find_sse_separator, parse_minimax_sse_block, MiniMaxParseState, MiniMaxStreamEvent,
    MiniMaxUsage,
};
use crate::db;
use crate::error::{AppError, AppResult};

static CANCELLED_STREAMS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
const CUSTOM_PROVIDER_USER_AGENT: &str = "claw-client/0.1";
const AUTO_VISIBLE_OUTPUT_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderStreamInput {
    request_id: String,
    protocol: CustomProviderProtocol,
    stream_mode: CustomProviderStreamMode,
    #[serde(default)]
    fallback_protocol: Option<CustomProviderProtocol>,
    base_url: String,
    api_key: String,
    body: Value,
    #[serde(default)]
    fallback_body: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderModelsInput {
    protocol: CustomProviderProtocol,
    base_url: String,
    api_key: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CustomProviderProtocol {
    OpenAiCompatible,
    AnthropicCompatible,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CustomProviderStreamMode {
    #[default]
    Auto,
    Stream,
    NonStream,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderConfigInput {
    #[serde(default)]
    id: Option<String>,
    name: String,
    protocol: CustomProviderProtocol,
    base_url: String,
    model_ids: Vec<String>,
    selected_model_id: String,
    supports_thinking: bool,
    supports_tools: bool,
    #[serde(default)]
    stream_mode: CustomProviderStreamMode,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderConfigPatch {
    name: Option<String>,
    protocol: Option<CustomProviderProtocol>,
    base_url: Option<String>,
    model_ids: Option<Vec<String>>,
    selected_model_id: Option<String>,
    enabled: Option<bool>,
    supports_thinking: Option<bool>,
    supports_tools: Option<bool>,
    stream_mode: Option<CustomProviderStreamMode>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderConfig {
    id: String,
    name: String,
    protocol: CustomProviderProtocol,
    base_url: String,
    model_ids: Vec<String>,
    selected_model_id: String,
    enabled: bool,
    supports_thinking: bool,
    supports_tools: bool,
    stream_mode: CustomProviderStreamMode,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderChatTestInput {
    protocol: CustomProviderProtocol,
    stream_mode: CustomProviderStreamMode,
    base_url: String,
    api_key: String,
    model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderChatTestResult {
    endpoint: String,
    protocol: CustomProviderProtocol,
    stream_mode: CustomProviderStreamMode,
    has_text: bool,
    has_thinking: bool,
    preview: Option<String>,
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

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn make_custom_provider_id() -> String {
    format!("custom:{}", Uuid::new_v4())
}

fn is_custom_provider_id(id: &str) -> bool {
    let Some(suffix) = id.strip_prefix("custom:") else {
        return false;
    };
    !suffix.is_empty()
        && suffix
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn protocol_to_db(protocol: CustomProviderProtocol) -> &'static str {
    match protocol {
        CustomProviderProtocol::OpenAiCompatible => "openai-compatible",
        CustomProviderProtocol::AnthropicCompatible => "anthropic-compatible",
    }
}

fn protocol_from_db(raw: &str) -> AppResult<CustomProviderProtocol> {
    match raw {
        "openai-compatible" => Ok(CustomProviderProtocol::OpenAiCompatible),
        "anthropic-compatible" => Ok(CustomProviderProtocol::AnthropicCompatible),
        _ => Err(AppError::InvalidInput(format!(
            "未知自定义 Provider 协议: {raw}"
        ))),
    }
}

fn stream_mode_to_db(mode: CustomProviderStreamMode) -> &'static str {
    match mode {
        CustomProviderStreamMode::Auto => "auto",
        CustomProviderStreamMode::Stream => "stream",
        CustomProviderStreamMode::NonStream => "non-stream",
    }
}

fn stream_mode_from_db(raw: &str) -> AppResult<CustomProviderStreamMode> {
    match raw {
        "auto" => Ok(CustomProviderStreamMode::Auto),
        "stream" => Ok(CustomProviderStreamMode::Stream),
        "non-stream" => Ok(CustomProviderStreamMode::NonStream),
        _ => Err(AppError::InvalidInput(format!(
            "未知自定义 Provider 流模式: {raw}"
        ))),
    }
}

fn normalize_model_ids(ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for id in ids {
        let id = id.trim();
        if id.is_empty() || !seen.insert(id.to_string()) {
            continue;
        }
        out.push(id.to_string());
    }
    out
}

fn validate_custom_provider_config(config: &CustomProviderConfig) -> AppResult<()> {
    if !is_custom_provider_id(&config.id) {
        return Err(AppError::InvalidInput(
            "自定义 Provider ID 无效".to_string(),
        ));
    }
    if config.name.trim().is_empty() {
        return Err(AppError::InvalidInput("模型名称不能为空".to_string()));
    }
    if config.model_ids.is_empty() {
        return Err(AppError::InvalidInput("至少需要一个 Model ID".to_string()));
    }
    if config.selected_model_id.trim().is_empty() {
        return Err(AppError::InvalidInput("默认 Model ID 不能为空".to_string()));
    }
    if !config.model_ids.contains(&config.selected_model_id) {
        return Err(AppError::InvalidInput(
            "默认 Model ID 必须在模型列表中".to_string(),
        ));
    }
    validate_custom_base_url(&config.base_url)?;
    Ok(())
}

fn config_from_input(input: CustomProviderConfigInput) -> CustomProviderConfig {
    let model_ids = normalize_model_ids(input.model_ids);
    let selected_model_id = input.selected_model_id.trim().to_string();
    let selected_model_id = if !selected_model_id.is_empty() {
        selected_model_id
    } else {
        model_ids.first().cloned().unwrap_or_default()
    };
    let timestamp = now_ms();
    CustomProviderConfig {
        id: input.id.unwrap_or_else(make_custom_provider_id),
        name: input.name.trim().to_string(),
        protocol: input.protocol,
        base_url: input.base_url.trim().trim_end_matches('/').to_string(),
        model_ids,
        selected_model_id,
        enabled: true,
        supports_thinking: input.supports_thinking,
        supports_tools: input.supports_tools,
        stream_mode: input.stream_mode,
        created_at: timestamp,
        updated_at: timestamp,
    }
}

fn apply_config_patch(
    current: CustomProviderConfig,
    patch: CustomProviderConfigPatch,
) -> CustomProviderConfig {
    let model_ids = patch
        .model_ids
        .map(normalize_model_ids)
        .unwrap_or(current.model_ids);
    let selected_model_id = patch
        .selected_model_id
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| current.selected_model_id.clone());
    let selected_model_id = if selected_model_id.is_empty() {
        model_ids.first().cloned().unwrap_or_default()
    } else {
        selected_model_id
    };

    CustomProviderConfig {
        id: current.id,
        name: patch
            .name
            .map(|value| value.trim().to_string())
            .unwrap_or(current.name),
        protocol: patch.protocol.unwrap_or(current.protocol),
        base_url: patch
            .base_url
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .unwrap_or(current.base_url),
        model_ids,
        selected_model_id,
        enabled: patch.enabled.unwrap_or(current.enabled),
        supports_thinking: patch.supports_thinking.unwrap_or(current.supports_thinking),
        supports_tools: patch.supports_tools.unwrap_or(current.supports_tools),
        stream_mode: patch.stream_mode.unwrap_or(current.stream_mode),
        created_at: current.created_at,
        updated_at: now_ms(),
    }
}

async fn upsert_custom_provider(pool: &SqlitePool, config: &CustomProviderConfig) -> AppResult<()> {
    validate_custom_provider_config(config)?;
    let model_ids = serde_json::to_string(&config.model_ids)?;
    sqlx::query(
        "INSERT INTO custom_providers
          (id, name, protocol, base_url, model_ids, selected_model_id, enabled,
           supports_thinking, supports_tools, stream_mode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          protocol = excluded.protocol,
          base_url = excluded.base_url,
          model_ids = excluded.model_ids,
          selected_model_id = excluded.selected_model_id,
          enabled = excluded.enabled,
          supports_thinking = excluded.supports_thinking,
          supports_tools = excluded.supports_tools,
          stream_mode = excluded.stream_mode,
          updated_at = excluded.updated_at",
    )
    .bind(&config.id)
    .bind(&config.name)
    .bind(protocol_to_db(config.protocol))
    .bind(&config.base_url)
    .bind(model_ids)
    .bind(&config.selected_model_id)
    .bind(if config.enabled { 1_i64 } else { 0_i64 })
    .bind(if config.supports_thinking {
        1_i64
    } else {
        0_i64
    })
    .bind(if config.supports_tools { 1_i64 } else { 0_i64 })
    .bind(stream_mode_to_db(config.stream_mode))
    .bind(config.created_at)
    .bind(config.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

fn custom_provider_from_row(
    row: (
        String,
        String,
        String,
        String,
        String,
        String,
        i64,
        i64,
        i64,
        String,
        i64,
        i64,
    ),
) -> AppResult<CustomProviderConfig> {
    let (
        id,
        name,
        protocol,
        base_url,
        model_ids,
        selected_model_id,
        enabled,
        supports_thinking,
        supports_tools,
        stream_mode,
        created_at,
        updated_at,
    ) = row;
    Ok(CustomProviderConfig {
        id,
        name,
        protocol: protocol_from_db(&protocol)?,
        base_url,
        model_ids: serde_json::from_str(&model_ids)?,
        selected_model_id,
        enabled: enabled != 0,
        supports_thinking: supports_thinking != 0,
        supports_tools: supports_tools != 0,
        stream_mode: stream_mode_from_db(&stream_mode)?,
        created_at,
        updated_at,
    })
}

async fn get_custom_provider_from_pool(
    pool: &SqlitePool,
    id: &str,
) -> AppResult<Option<CustomProviderConfig>> {
    if !is_custom_provider_id(id) {
        return Err(AppError::InvalidInput(
            "自定义 Provider ID 无效".to_string(),
        ));
    }
    let row = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            String,
            String,
            i64,
            i64,
            i64,
            String,
            i64,
            i64,
        ),
    >(
        "SELECT id, name, protocol, base_url, model_ids, selected_model_id, enabled,
                supports_thinking, supports_tools, stream_mode, created_at, updated_at
         FROM custom_providers
         WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    match row {
        Some(row) => Ok(Some(custom_provider_from_row(row)?)),
        None => Ok(None),
    }
}

async fn list_custom_providers_from_pool(
    pool: &SqlitePool,
) -> AppResult<Vec<CustomProviderConfig>> {
    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            String,
            String,
            i64,
            i64,
            i64,
            String,
            i64,
            i64,
        ),
    >(
        "SELECT id, name, protocol, base_url, model_ids, selected_model_id, enabled,
                supports_thinking, supports_tools, stream_mode, created_at, updated_at
         FROM custom_providers
         ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(custom_provider_from_row(row)?);
    }
    Ok(out)
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

fn chat_endpoint(protocol: CustomProviderProtocol, base_url: &str) -> String {
    match protocol {
        CustomProviderProtocol::OpenAiCompatible => openai_chat_endpoint(base_url),
        CustomProviderProtocol::AnthropicCompatible => anthropic_chat_endpoint(base_url),
    }
}

fn alternate_protocol(protocol: CustomProviderProtocol) -> CustomProviderProtocol {
    match protocol {
        CustomProviderProtocol::OpenAiCompatible => CustomProviderProtocol::AnthropicCompatible,
        CustomProviderProtocol::AnthropicCompatible => CustomProviderProtocol::OpenAiCompatible,
    }
}

fn openai_chat_endpoint(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/chat/completions") {
        return base.to_string();
    }
    if lower.ends_with("/models") {
        let prefix = &base[..base.len() - "/models".len()];
        return format!("{prefix}/chat/completions");
    }
    if base_url_has_empty_path(base_url) {
        return format!("{base}/v1/chat/completions");
    }
    format!("{base}/chat/completions")
}

fn anthropic_chat_endpoint(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/messages") {
        return base.to_string();
    }
    if lower.ends_with("/models") {
        let prefix = &base[..base.len() - "/models".len()];
        return format!("{prefix}/messages");
    }
    if lower.ends_with("/v1") {
        return format!("{base}/messages");
    }
    format!("{base}/v1/messages")
}

fn base_url_has_empty_path(base_url: &str) -> bool {
    reqwest::Url::parse(base_url)
        .ok()
        .map(|url| url.path().trim_matches('/').is_empty())
        .unwrap_or(false)
}

fn models_endpoints(protocol: CustomProviderProtocol, base_url: &str) -> Vec<String> {
    match protocol {
        CustomProviderProtocol::OpenAiCompatible => openai_model_endpoints(base_url),
        CustomProviderProtocol::AnthropicCompatible => anthropic_model_endpoints(base_url),
    }
}

fn openai_model_endpoints(base_url: &str) -> Vec<String> {
    let base = base_url.trim_end_matches('/');
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/models") {
        return vec![base.to_string()];
    }
    if lower.ends_with("/chat/completions") {
        let prefix = &base[..base.len() - "/chat/completions".len()];
        return vec![format!("{prefix}/models")];
    }
    if base_url_has_empty_path(base_url) {
        vec![format!("{base}/v1/models"), format!("{base}/models")]
    } else {
        vec![format!("{base}/models")]
    }
}

fn anthropic_model_endpoints(base_url: &str) -> Vec<String> {
    let base = base_url.trim_end_matches('/');
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/models") {
        return vec![base.to_string()];
    }
    if lower.ends_with("/v1") {
        return vec![format!("{base}/models")];
    }
    if base_url_has_empty_path(base_url) {
        return vec![format!("{base}/v1/models"), format!("{base}/models")];
    }
    vec![format!("{base}/v1/models"), format!("{base}/models")]
}

fn sanitize_error(message: &str, api_key: &str) -> String {
    if api_key.is_empty() {
        return message.to_string();
    }
    message.replace(api_key, "[secret]")
}

fn normalize_openai_api_key(raw: &str) -> String {
    let mut value = raw.trim();
    if let Some(rest) = value
        .strip_prefix("Authorization:")
        .or_else(|| value.strip_prefix("authorization:"))
    {
        value = rest.trim();
    }
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        value = &value[1..value.len() - 1];
    }
    if value.len() >= 7 && value[..7].eq_ignore_ascii_case("bearer ") {
        value = value[7..].trim();
    }
    value.to_string()
}

fn apply_openai_auth_headers(
    request: reqwest::RequestBuilder,
    api_key: &str,
) -> reqwest::RequestBuilder {
    let key = normalize_openai_api_key(api_key);
    request
        .bearer_auth(&key)
        .header("api-key", key.clone())
        .header("x-api-key", key)
        .header("Accept", "application/json")
        .header("User-Agent", CUSTOM_PROVIDER_USER_AGENT)
}

fn apply_anthropic_auth_headers(
    request: reqwest::RequestBuilder,
    api_key: &str,
) -> reqwest::RequestBuilder {
    request
        .header("x-api-key", api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .header("Accept", "application/json")
        .header("User-Agent", CUSTOM_PROVIDER_USER_AGENT)
}

fn apply_custom_model_auth_headers(
    request: reqwest::RequestBuilder,
    api_key: &str,
) -> reqwest::RequestBuilder {
    let key = normalize_openai_api_key(api_key);
    request
        .bearer_auth(&key)
        .header("api-key", key.clone())
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("Accept", "application/json")
        .header("User-Agent", CUSTOM_PROVIDER_USER_AGENT)
}

fn custom_models_http_error(status: reqwest::StatusCode, url: &str, body: &str) -> String {
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return format!(
            "Custom provider models HTTP {status} ({url}): 鉴权失败，请检查 API Key 是否正确传入"
        );
    }
    let body = body.trim();
    if body.is_empty() {
        format!("Custom provider models HTTP {status} ({url})")
    } else {
        format!(
            "Custom provider models HTTP {status} ({url}): {}",
            body.chars().take(240).collect::<String>()
        )
    }
}

pub fn parse_custom_model_ids(value: &Value) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut ids = Vec::new();

    let mut push_id = |id: &str| {
        let trimmed = id.trim();
        if !trimmed.is_empty() && seen.insert(trimmed.to_string()) {
            ids.push(trimmed.to_string());
        }
    };

    let mut collect_array = |items: &[Value]| {
        for item in items {
            if let Some(id) = item.as_str() {
                push_id(id);
                continue;
            }
            if let Some(id) = item.get("id").and_then(Value::as_str) {
                push_id(id);
            }
        }
    };

    if let Some(data) = value.get("data").and_then(Value::as_array) {
        collect_array(data);
    }
    if let Some(models) = value.get("models").and_then(Value::as_array) {
        collect_array(models);
    }
    if let Some(items) = value.as_array() {
        collect_array(items);
    }
    ids
}

fn send_event(on_event: &Channel<MiniMaxStreamEvent>, event: MiniMaxStreamEvent) -> AppResult<()> {
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

#[derive(Default)]
struct CustomResponseOutcome {
    has_text: bool,
    has_thinking: bool,
    has_tool_use: bool,
    stop_reason: Option<String>,
}

impl CustomResponseOutcome {
    fn has_visible_result(&self) -> bool {
        self.has_text || self.has_tool_use
    }
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

fn text_from_content(value: &Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    item.get("text")
                        .and_then(Value::as_str)
                        .or_else(|| item.pointer("/text/value").and_then(Value::as_str))
                })
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

fn parse_openai_non_stream(value: &Value) -> Vec<MiniMaxStreamEvent> {
    let mut events = Vec::new();
    let message = value.pointer("/choices/0/message").unwrap_or(&Value::Null);

    for field in ["reasoning_content", "reasoning", "thinking"] {
        let thinking = message
            .get(field)
            .map(text_from_content)
            .unwrap_or_default();
        if !thinking.is_empty() {
            events.push(MiniMaxStreamEvent::ThinkingDelta { thinking });
            break;
        }
    }

    let text = message
        .get("content")
        .map(text_from_content)
        .unwrap_or_default();
    if !text.is_empty() {
        events.push(MiniMaxStreamEvent::TextDelta { text });
    }

    if let Some(tool_calls) = message.get("tool_calls").and_then(Value::as_array) {
        for (index, tool_call) in tool_calls.iter().enumerate() {
            let id = tool_call
                .get("id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("custom_tool_{index}"));
            let function = tool_call.get("function").unwrap_or(&Value::Null);
            let name = function
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("unknown_tool")
                .to_string();
            let raw = function
                .get("arguments")
                .and_then(Value::as_str)
                .unwrap_or("");
            let input = if raw.is_empty() {
                Value::Object(serde_json::Map::new())
            } else {
                serde_json::from_str::<Value>(raw)
                    .unwrap_or_else(|_| serde_json::json!({ "__raw": raw }))
            };
            events.push(MiniMaxStreamEvent::ToolUseStart {
                id: id.clone(),
                name,
            });
            events.push(MiniMaxStreamEvent::ToolUseEnd { id, input });
        }
    }

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

    events.push(MiniMaxStreamEvent::Done {
        stop_reason: value
            .pointer("/choices/0/finish_reason")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    });
    events
}

fn parse_anthropic_non_stream(value: &Value) -> Vec<MiniMaxStreamEvent> {
    let mut events = Vec::new();
    if let Some(content) = value.get("content").and_then(Value::as_array) {
        for (index, block) in content.iter().enumerate() {
            match block.get("type").and_then(Value::as_str) {
                Some("text") => {
                    let text = block.get("text").map(text_from_content).unwrap_or_default();
                    if !text.is_empty() {
                        events.push(MiniMaxStreamEvent::TextDelta { text });
                    }
                }
                Some("thinking") => {
                    let thinking = block
                        .get("thinking")
                        .map(text_from_content)
                        .unwrap_or_default();
                    if !thinking.is_empty() {
                        events.push(MiniMaxStreamEvent::ThinkingDelta { thinking });
                    }
                }
                Some("tool_use") => {
                    let id = block
                        .get("id")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("custom_tool_{index}"));
                    let name = block
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown_tool")
                        .to_string();
                    let input = block
                        .get("input")
                        .cloned()
                        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
                    events.push(MiniMaxStreamEvent::ToolUseStart {
                        id: id.clone(),
                        name,
                    });
                    events.push(MiniMaxStreamEvent::ToolUseEnd { id, input });
                }
                _ => {}
            }
        }
    }

    if let Some(usage) = value.get("usage") {
        events.push(MiniMaxStreamEvent::Usage {
            usage: MiniMaxUsage {
                input_tokens: usage
                    .get("input_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                output_tokens: usage
                    .get("output_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                cache_read_input_tokens: usage
                    .get("cache_read_input_tokens")
                    .and_then(Value::as_u64),
                cache_creation_input_tokens: usage
                    .get("cache_creation_input_tokens")
                    .and_then(Value::as_u64),
            },
        });
    }

    events.push(MiniMaxStreamEvent::Done {
        stop_reason: value
            .get("stop_reason")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    });
    events
}

fn parse_custom_non_stream_response(
    protocol: CustomProviderProtocol,
    value: &Value,
) -> Vec<MiniMaxStreamEvent> {
    match protocol {
        CustomProviderProtocol::OpenAiCompatible => {
            if value.get("choices").is_some() {
                parse_openai_non_stream(value)
            } else {
                parse_anthropic_non_stream(value)
            }
        }
        CustomProviderProtocol::AnthropicCompatible => parse_anthropic_non_stream(value),
    }
}

fn parse_oai_sse_block(state: &mut OaiParseState, block: &str) -> Vec<MiniMaxStreamEvent> {
    let Some(data) = data_payload(block) else {
        if block.lines().any(|line| line.trim() == "data: [DONE]") {
            let mut events = flush_oai_tools(state);
            events.push(MiniMaxStreamEvent::Done { stop_reason: None });
            return events;
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

fn parse_openai_compatible_sse_block(
    oai_state: &mut OaiParseState,
    anthropic_state: &mut MiniMaxParseState,
    block: &str,
) -> Vec<MiniMaxStreamEvent> {
    if let Some(data) = data_payload(block) {
        if let Ok(value) = serde_json::from_str::<Value>(&data) {
            if value.get("type").and_then(Value::as_str).is_some() {
                return parse_minimax_sse_block(anthropic_state, block);
            }
        }
    }

    let events = parse_oai_sse_block(oai_state, block);
    if events.is_empty() {
        parse_minimax_sse_block(anthropic_state, block)
    } else {
        events
    }
}

fn custom_chat_http_error(status: reqwest::StatusCode, url: &str, body: &str) -> String {
    let detail = body.trim().chars().take(300).collect::<String>();
    if detail.is_empty() {
        format!("Custom provider chat HTTP {status} ({url})")
    } else {
        format!("Custom provider chat HTTP {status} ({url}): {detail}")
    }
}

fn apply_chat_auth_headers(
    protocol: CustomProviderProtocol,
    request: reqwest::RequestBuilder,
    api_key: &str,
) -> reqwest::RequestBuilder {
    match protocol {
        CustomProviderProtocol::OpenAiCompatible => apply_openai_auth_headers(request, api_key),
        CustomProviderProtocol::AnthropicCompatible => {
            apply_anthropic_auth_headers(request, api_key)
        }
    }
}

fn observe_and_send_events(
    on_event: &Channel<MiniMaxStreamEvent>,
    events: Vec<MiniMaxStreamEvent>,
    outcome: &mut CustomResponseOutcome,
    emit_done: bool,
    skip_thinking: bool,
) -> AppResult<bool> {
    for event in events {
        match &event {
            MiniMaxStreamEvent::TextDelta { text } if !text.is_empty() => {
                outcome.has_text = true;
            }
            MiniMaxStreamEvent::ThinkingDelta { thinking } if !thinking.is_empty() => {
                outcome.has_thinking = true;
                if skip_thinking {
                    continue;
                }
            }
            MiniMaxStreamEvent::ToolUseStart { .. } => {
                outcome.has_tool_use = true;
            }
            MiniMaxStreamEvent::Done { stop_reason } => {
                outcome.stop_reason = stop_reason.clone();
                if emit_done {
                    send_event(on_event, event)?;
                }
                return Ok(true);
            }
            _ => {}
        }
        send_event(on_event, event)?;
    }
    Ok(false)
}

fn non_streaming_body(body: &Value) -> AppResult<Value> {
    let mut body = body.clone();
    let Some(obj) = body.as_object_mut() else {
        return Err(AppError::InvalidInput(
            "Custom provider request body must be an object".to_string(),
        ));
    };
    obj.insert("stream".to_string(), Value::Bool(false));
    obj.remove("stream_options");
    Ok(body)
}

async fn stream_custom_request(
    input: &CustomProviderStreamInput,
    on_event: &Channel<MiniMaxStreamEvent>,
    client: &reqwest::Client,
    base_url: &str,
    emit_done: bool,
    enforce_visible_output_timeout: bool,
    outcome: &mut CustomResponseOutcome,
) -> AppResult<()> {
    let body = ensure_streaming_body(&input.body)?;
    let url = chat_endpoint(input.protocol, base_url);
    let request = apply_chat_auth_headers(
        input.protocol,
        client.post(&url).json(&body),
        &input.api_key,
    );

    let response = request
        .send()
        .await
        .map_err(|e| AppError::Other(format!("Custom provider request failed: {e}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Other(custom_chat_http_error(status, &url, &body)));
    }

    let mut response = response;
    let mut buffer = String::new();
    let started_at = Instant::now();
    let mut anthropic_state = MiniMaxParseState::default();
    let mut openai_anthropic_state = MiniMaxParseState::default();
    let mut oai_state = OaiParseState::default();

    loop {
        let chunk_result = if enforce_visible_output_timeout {
            tokio::time::timeout(AUTO_VISIBLE_OUTPUT_TIMEOUT, response.chunk())
                .await
                .map_err(|_| {
                    AppError::Other(
                        "Custom provider stream produced no chunks before fallback timeout"
                            .to_string(),
                    )
                })?
        } else {
            response.chunk().await
        };
        let Some(chunk) = chunk_result
            .map_err(|e| AppError::Other(format!("Custom provider stream read failed: {e}")))?
        else {
            break;
        };
        if is_custom_stream_cancelled(&input.request_id)? {
            return Ok(());
        }
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some((sep, sep_len)) = find_sse_separator(&buffer) {
            let block = buffer[..sep].to_string();
            buffer = buffer[sep + sep_len..].to_string();
            let events = match input.protocol {
                CustomProviderProtocol::OpenAiCompatible => parse_openai_compatible_sse_block(
                    &mut oai_state,
                    &mut openai_anthropic_state,
                    &block,
                ),
                CustomProviderProtocol::AnthropicCompatible => {
                    parse_minimax_sse_block(&mut anthropic_state, &block)
                }
            };
            if observe_and_send_events(on_event, events, outcome, emit_done, false)? {
                return Ok(());
            }
            if enforce_visible_output_timeout
                && !outcome.has_visible_result()
                && started_at.elapsed() >= AUTO_VISIBLE_OUTPUT_TIMEOUT
            {
                return Err(AppError::Other(
                    "Custom provider stream produced no visible output before fallback timeout"
                        .to_string(),
                ));
            }
        }
    }

    if !buffer.trim().is_empty() {
        let events = match input.protocol {
            CustomProviderProtocol::OpenAiCompatible => parse_openai_compatible_sse_block(
                &mut oai_state,
                &mut openai_anthropic_state,
                &buffer,
            ),
            CustomProviderProtocol::AnthropicCompatible => {
                parse_minimax_sse_block(&mut anthropic_state, &buffer)
            }
        };
        if observe_and_send_events(on_event, events, outcome, emit_done, false)? {
            return Ok(());
        }
    }

    if emit_done {
        send_event(on_event, MiniMaxStreamEvent::Done { stop_reason: None })?;
    }
    Ok(())
}

async fn non_stream_custom_request(
    input: &CustomProviderStreamInput,
    on_event: &Channel<MiniMaxStreamEvent>,
    client: &reqwest::Client,
    base_url: &str,
    skip_thinking: bool,
) -> AppResult<CustomResponseOutcome> {
    let body = non_streaming_body(&input.body)?;
    let url = chat_endpoint(input.protocol, base_url);
    let request = apply_chat_auth_headers(
        input.protocol,
        client.post(&url).json(&body),
        &input.api_key,
    );
    let response = request
        .send()
        .await
        .map_err(|e| AppError::Other(format!("Custom provider request failed: {e}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Other(custom_chat_http_error(status, &url, &body)));
    }

    let value = response
        .json::<Value>()
        .await
        .map_err(|e| AppError::Other(format!("Custom provider JSON invalid ({url}): {e}")))?;
    let events = parse_custom_non_stream_response(input.protocol, &value);
    let mut outcome = CustomResponseOutcome::default();
    observe_and_send_events(on_event, events, &mut outcome, true, skip_thinking)?;
    Ok(outcome)
}

async fn auto_custom_request(
    input: &CustomProviderStreamInput,
    on_event: &Channel<MiniMaxStreamEvent>,
    client: &reqwest::Client,
    base_url: &str,
) -> AppResult<()> {
    let mut outcome = CustomResponseOutcome::default();
    let stream_result =
        stream_custom_request(input, on_event, client, base_url, false, true, &mut outcome).await;
    if is_custom_stream_cancelled(&input.request_id)? {
        return Ok(());
    }

    match stream_result {
        Ok(()) if outcome.has_visible_result() => {
            send_event(
                on_event,
                MiniMaxStreamEvent::Done {
                    stop_reason: outcome.stop_reason.clone(),
                },
            )?;
            Ok(())
        }
        Ok(()) => {
            non_stream_custom_request(
                input,
                on_event,
                client,
                base_url,
                outcome.has_thinking,
            )
            .await?;
            Ok(())
        }
        Err(_) if outcome.has_text => {
            send_event(
                on_event,
                MiniMaxStreamEvent::Done {
                    stop_reason: outcome.stop_reason.clone(),
                },
            )?;
            Ok(())
        }
        Err(stream_error) => non_stream_custom_request(
            input,
            on_event,
            client,
            base_url,
            false,
        )
        .await
        .map(|_| ())
        .map_err(|fallback_error| {
            AppError::Other(format!(
                "Custom provider auto mode failed. Stream: {stream_error}; fallback: {fallback_error}"
            ))
        }),
    }
}

fn protocol_fallback_input(input: &CustomProviderStreamInput) -> Option<CustomProviderStreamInput> {
    let protocol = input.fallback_protocol?;
    let body = input.fallback_body.clone()?;
    if protocol == input.protocol || !body.is_object() {
        return None;
    }
    Some(CustomProviderStreamInput {
        request_id: input.request_id.clone(),
        protocol,
        stream_mode: CustomProviderStreamMode::Auto,
        fallback_protocol: None,
        base_url: input.base_url.clone(),
        api_key: input.api_key.clone(),
        body,
        fallback_body: None,
    })
}

async fn stream_custom_inner(
    input: &CustomProviderStreamInput,
    on_event: &Channel<MiniMaxStreamEvent>,
) -> AppResult<()> {
    if input.request_id.trim().is_empty() {
        return Err(AppError::InvalidInput("requestId 不能为空".to_string()));
    }
    if input.api_key.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "自定义模型 API Key 不能为空".to_string(),
        ));
    }

    let base_url = validate_custom_base_url(&input.base_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Other(format!("Custom provider client build failed: {e}")))?;

    match input.stream_mode {
        CustomProviderStreamMode::Stream => {
            let mut outcome = CustomResponseOutcome::default();
            stream_custom_request(
                input,
                on_event,
                &client,
                &base_url,
                true,
                false,
                &mut outcome,
            )
            .await?;
        }
        CustomProviderStreamMode::NonStream => {
            non_stream_custom_request(input, on_event, &client, &base_url, false).await?;
        }
        CustomProviderStreamMode::Auto => {
            let primary_result = auto_custom_request(input, on_event, &client, &base_url).await;
            if primary_result.is_err() && !is_custom_stream_cancelled(&input.request_id)? {
                if let Some(fallback_input) = protocol_fallback_input(input) {
                    let primary_error = primary_result.unwrap_err();
                    auto_custom_request(&fallback_input, on_event, &client, &base_url)
                        .await
                        .map_err(|fallback_error| {
                            AppError::Other(format!(
                                "Custom provider protocol fallback failed. Primary {}: {primary_error}; fallback {}: {fallback_error}",
                                protocol_to_db(input.protocol),
                                protocol_to_db(fallback_input.protocol),
                            ))
                        })?;
                } else {
                    primary_result?;
                }
            }
        }
    }
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
        let endpoint = chat_endpoint(input.protocol, &input.base_url);
        let model = input
            .body
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let detail = format!(
            "{err} [protocol={}, model={model}, endpoint={endpoint}, streamMode={}]",
            protocol_to_db(input.protocol),
            stream_mode_to_db(input.stream_mode),
        );
        let message = sanitize_error(&detail, &input.api_key);
        send_event(&on_event, MiniMaxStreamEvent::Error { message })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_custom_provider_stream(request_id: String) -> AppResult<()> {
    mark_custom_stream_cancelled(&request_id)
}

fn test_chat_body(input: &CustomProviderChatTestInput) -> Value {
    match input.protocol {
        CustomProviderProtocol::OpenAiCompatible => serde_json::json!({
            "model": input.model.trim(),
            "messages": [{ "role": "user", "content": "Reply exactly: OK" }],
            "max_tokens": 32,
            "stream": false
        }),
        CustomProviderProtocol::AnthropicCompatible => serde_json::json!({
            "model": input.model.trim(),
            "messages": [{ "role": "user", "content": "Reply exactly: OK" }],
            "max_tokens": 32,
            "stream": false
        }),
    }
}

async fn test_custom_provider_chat_inner(
    input: &CustomProviderChatTestInput,
) -> AppResult<CustomProviderChatTestResult> {
    if input.api_key.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "自定义模型 API Key 不能为空".to_string(),
        ));
    }
    if input.model.trim().is_empty() {
        return Err(AppError::InvalidInput("Model ID 不能为空".to_string()));
    }

    let primary_result = test_custom_provider_chat_protocol(input, input.protocol).await;
    if primary_result.is_ok() || input.stream_mode != CustomProviderStreamMode::Auto {
        return primary_result;
    }

    let primary_error = primary_result.unwrap_err();
    let fallback_protocol = alternate_protocol(input.protocol);
    test_custom_provider_chat_protocol(input, fallback_protocol)
        .await
        .map_err(|fallback_error| {
            AppError::Other(format!(
                "Custom provider test protocol fallback failed. Primary {}: {primary_error}; fallback {}: {fallback_error}",
                protocol_to_db(input.protocol),
                protocol_to_db(fallback_protocol),
            ))
        })
}

async fn test_custom_provider_chat_protocol(
    input: &CustomProviderChatTestInput,
    protocol: CustomProviderProtocol,
) -> AppResult<CustomProviderChatTestResult> {
    let base_url = validate_custom_base_url(&input.base_url)?;
    let endpoint = chat_endpoint(protocol, &base_url);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| AppError::Other(format!("Custom provider client build failed: {e}")))?;
    let request = apply_chat_auth_headers(
        protocol,
        client.post(&endpoint).json(&test_chat_body(input)),
        &input.api_key,
    );
    let response = request
        .send()
        .await
        .map_err(|e| AppError::Other(format!("Custom provider test request failed: {e}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Other(custom_chat_http_error(
            status, &endpoint, &body,
        )));
    }

    let value = response.json::<Value>().await.map_err(|e| {
        AppError::Other(format!(
            "Custom provider test JSON invalid ({endpoint}): {e}"
        ))
    })?;
    let events = parse_custom_non_stream_response(protocol, &value);
    let mut has_text = false;
    let mut has_thinking = false;
    let mut preview = None;
    for event in events {
        match event {
            MiniMaxStreamEvent::TextDelta { text } if !text.trim().is_empty() => {
                has_text = true;
                if preview.is_none() {
                    preview = Some(text.trim().chars().take(120).collect());
                }
            }
            MiniMaxStreamEvent::ThinkingDelta { thinking } if !thinking.trim().is_empty() => {
                has_thinking = true;
                if preview.is_none() {
                    preview = Some(thinking.trim().chars().take(120).collect());
                }
            }
            _ => {}
        }
    }

    if !has_text && !has_thinking {
        return Err(AppError::Other(format!(
            "Custom provider test returned no text or thinking [protocol={}, model={}, endpoint={}, streamMode={}]",
            protocol_to_db(protocol),
            input.model.trim(),
            endpoint,
            stream_mode_to_db(input.stream_mode),
        )));
    }

    Ok(CustomProviderChatTestResult {
        endpoint,
        protocol,
        stream_mode: input.stream_mode,
        has_text,
        has_thinking,
        preview,
    })
}

#[tauri::command]
pub async fn test_custom_provider_chat(
    input: CustomProviderChatTestInput,
) -> AppResult<CustomProviderChatTestResult> {
    test_custom_provider_chat_inner(&input)
        .await
        .map_err(|err| AppError::Other(sanitize_error(&err.to_string(), &input.api_key)))
}

#[tauri::command]
pub async fn list_custom_providers() -> AppResult<Vec<CustomProviderConfig>> {
    let pool = db::pool()?;
    list_custom_providers_from_pool(&pool).await
}

#[tauri::command]
pub async fn create_custom_provider(
    input: CustomProviderConfigInput,
) -> AppResult<CustomProviderConfig> {
    let pool = db::pool()?;
    let config = config_from_input(input);
    upsert_custom_provider(&pool, &config).await?;
    Ok(config)
}

#[tauri::command]
pub async fn update_custom_provider(
    id: String,
    patch: CustomProviderConfigPatch,
) -> AppResult<CustomProviderConfig> {
    let pool = db::pool()?;
    let current = get_custom_provider_from_pool(&pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("自定义 Provider 不存在".to_string()))?;
    let next = apply_config_patch(current, patch);
    upsert_custom_provider(&pool, &next).await?;
    Ok(next)
}

async fn delete_custom_provider_from_pool(pool: &SqlitePool, id: &str) -> AppResult<()> {
    if !is_custom_provider_id(id) {
        return Err(AppError::InvalidInput(
            "自定义 Provider ID 无效".to_string(),
        ));
    }
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM custom_providers WHERE id = ?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM api_keys WHERE provider = ?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO api_key_metadata
          (provider, configured, preview, metadata_known, updated_at)
         VALUES (?1, 0, NULL, 1, ?2)
         ON CONFLICT(provider) DO UPDATE SET
          configured = 0,
          preview = NULL,
          metadata_known = 1,
          updated_at = excluded.updated_at",
    )
    .bind(id)
    .bind(now_ms())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_custom_provider(id: String) -> AppResult<()> {
    let pool = db::pool()?;
    delete_custom_provider_from_pool(&pool, &id).await
}

async fn list_custom_provider_models_inner(
    input: &CustomProviderModelsInput,
) -> AppResult<Vec<String>> {
    if input.api_key.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "自定义模型 API Key 不能为空".to_string(),
        ));
    }

    let base_url = validate_custom_base_url(&input.base_url)?;
    let urls = models_endpoints(input.protocol, &base_url);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Other(format!("Custom provider client build failed: {e}")))?;

    let mut last_error = None;
    for url in urls {
        let request = apply_custom_model_auth_headers(client.get(&url), &input.api_key);

        let response = match request.send().await {
            Ok(response) => response,
            Err(err) => {
                last_error = Some(format!(
                    "Custom provider models request failed ({url}): {err}"
                ));
                continue;
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            last_error = Some(custom_models_http_error(status, &url, &body));
            continue;
        }

        let value = match response.json::<Value>().await {
            Ok(value) => value,
            Err(err) => {
                last_error = Some(format!(
                    "Custom provider models JSON invalid ({url}): {err}"
                ));
                continue;
            }
        };
        let ids = parse_custom_model_ids(&value);
        if !ids.is_empty() {
            return Ok(ids);
        }
        last_error = Some(format!("未获取到可用模型: {url}"));
    }

    Err(AppError::Other(format!(
        "自定义模型获取失败，请检查 API Key 或 Base URL。{}",
        last_error.unwrap_or_else(|| "代理未返回可用模型".to_string())
    )))
}

#[tauri::command]
pub async fn list_custom_provider_models(
    input: CustomProviderModelsInput,
) -> AppResult<Vec<String>> {
    list_custom_provider_models_inner(&input)
        .await
        .map_err(|err| AppError::Other(sanitize_error(&err.to_string(), &input.api_key)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn fresh_pool() -> (SqlitePool, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let url = format!("sqlite://{}?mode=rwc", db_path.display());
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let init_sql = include_str!("../db/migrations/0001_init.sql");
        sqlx::query(init_sql).execute(&pool).await.unwrap();
        (pool, dir)
    }

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
    fn openai_model_endpoints_root_prefers_v1_then_legacy_models() {
        assert_eq!(
            models_endpoints(
                CustomProviderProtocol::OpenAiCompatible,
                "https://llm.example.com"
            ),
            vec![
                "https://llm.example.com/v1/models".to_string(),
                "https://llm.example.com/models".to_string(),
            ]
        );
    }

    #[test]
    fn openai_model_endpoints_existing_path_uses_path_models() {
        assert_eq!(
            models_endpoints(
                CustomProviderProtocol::OpenAiCompatible,
                "https://llm.example.com/v1"
            ),
            vec!["https://llm.example.com/v1/models".to_string()]
        );
        assert_eq!(
            chat_endpoint(
                CustomProviderProtocol::OpenAiCompatible,
                "https://llm.example.com"
            ),
            "https://llm.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn alternate_protocol_switches_between_supported_compatibility_modes() {
        assert_eq!(
            alternate_protocol(CustomProviderProtocol::AnthropicCompatible),
            CustomProviderProtocol::OpenAiCompatible
        );
        assert_eq!(
            alternate_protocol(CustomProviderProtocol::OpenAiCompatible),
            CustomProviderProtocol::AnthropicCompatible
        );
    }

    #[test]
    fn protocol_fallback_input_uses_alternate_body_without_recursive_fallback() {
        let input = CustomProviderStreamInput {
            request_id: "req-1".to_string(),
            protocol: CustomProviderProtocol::AnthropicCompatible,
            stream_mode: CustomProviderStreamMode::Auto,
            fallback_protocol: Some(CustomProviderProtocol::OpenAiCompatible),
            base_url: "https://llm.example.com".to_string(),
            api_key: "sk-secret".to_string(),
            body: serde_json::json!({
                "model": "qwen3-max",
                "messages": [{"role": "user", "content": "hello"}],
                "stream": true
            }),
            fallback_body: Some(serde_json::json!({
                "model": "qwen3-max",
                "messages": [{"role": "user", "content": "hello"}],
                "stream": true
            })),
        };

        let fallback = protocol_fallback_input(&input).unwrap();

        assert_eq!(fallback.protocol, CustomProviderProtocol::OpenAiCompatible);
        assert_eq!(fallback.stream_mode, CustomProviderStreamMode::Auto);
        assert_eq!(fallback.body["model"], "qwen3-max");
        assert!(fallback.fallback_protocol.is_none());
        assert!(fallback.fallback_body.is_none());
    }

    #[test]
    fn openai_model_endpoints_accepts_direct_models_and_chat_completion_urls() {
        assert_eq!(
            models_endpoints(
                CustomProviderProtocol::OpenAiCompatible,
                "https://llm.example.com/v1/models"
            ),
            vec!["https://llm.example.com/v1/models".to_string()]
        );
        assert_eq!(
            models_endpoints(
                CustomProviderProtocol::OpenAiCompatible,
                "https://llm.example.com/v1/chat/completions"
            ),
            vec!["https://llm.example.com/v1/models".to_string()]
        );
    }

    #[test]
    fn anthropic_model_endpoints_support_gateway_root_and_v1_base_urls() {
        assert_eq!(
            models_endpoints(
                CustomProviderProtocol::AnthropicCompatible,
                "https://llm.example.com"
            ),
            vec![
                "https://llm.example.com/v1/models".to_string(),
                "https://llm.example.com/models".to_string(),
            ]
        );
        assert_eq!(
            models_endpoints(
                CustomProviderProtocol::AnthropicCompatible,
                "https://llm.example.com/v1"
            ),
            vec!["https://llm.example.com/v1/models".to_string()]
        );
    }

    #[test]
    fn chat_endpoint_accepts_root_v1_and_direct_urls() {
        assert_eq!(
            chat_endpoint(
                CustomProviderProtocol::OpenAiCompatible,
                "https://llm.example.com"
            ),
            "https://llm.example.com/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint(
                CustomProviderProtocol::OpenAiCompatible,
                "https://llm.example.com/v1"
            ),
            "https://llm.example.com/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint(
                CustomProviderProtocol::OpenAiCompatible,
                "https://llm.example.com/v1/chat/completions"
            ),
            "https://llm.example.com/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint(
                CustomProviderProtocol::AnthropicCompatible,
                "https://llm.example.com"
            ),
            "https://llm.example.com/v1/messages"
        );
        assert_eq!(
            chat_endpoint(
                CustomProviderProtocol::AnthropicCompatible,
                "https://llm.example.com/v1"
            ),
            "https://llm.example.com/v1/messages"
        );
        assert_eq!(
            chat_endpoint(
                CustomProviderProtocol::AnthropicCompatible,
                "https://llm.example.com/v1/messages"
            ),
            "https://llm.example.com/v1/messages"
        );
    }

    #[test]
    fn normalize_openai_api_key_accepts_raw_bearer_and_quoted_values() {
        assert_eq!(normalize_openai_api_key(" sk-test "), "sk-test");
        assert_eq!(normalize_openai_api_key("Bearer sk-test"), "sk-test");
        assert_eq!(
            normalize_openai_api_key("authorization: Bearer sk-test"),
            "sk-test"
        );
        assert_eq!(normalize_openai_api_key("\"sk-test\""), "sk-test");
    }

    #[test]
    fn apply_openai_auth_headers_sets_bearer_and_gateway_aliases() {
        let request = apply_openai_auth_headers(
            reqwest::Client::new().get("https://example.com/v1/models"),
            "Bearer sk-test",
        )
        .build()
        .unwrap();
        let headers = request.headers();

        assert_eq!(headers.get("authorization").unwrap(), "Bearer sk-test");
        assert_eq!(headers.get("api-key").unwrap(), "sk-test");
        assert_eq!(headers.get("x-api-key").unwrap(), "sk-test");
    }

    #[test]
    fn apply_custom_model_auth_headers_sets_bearer_and_gateway_aliases() {
        let request = apply_custom_model_auth_headers(
            reqwest::Client::new().get("https://example.com/v1/models"),
            "Bearer sk-test",
        )
        .build()
        .unwrap();
        let headers = request.headers();

        assert_eq!(headers.get("authorization").unwrap(), "Bearer sk-test");
        assert_eq!(headers.get("api-key").unwrap(), "sk-test");
        assert_eq!(headers.get("x-api-key").unwrap(), "sk-test");
        assert_eq!(headers.get("anthropic-version").unwrap(), "2023-06-01");
    }

    #[test]
    fn custom_models_http_error_summarizes_unauthorized() {
        let message = custom_models_http_error(
            reqwest::StatusCode::UNAUTHORIZED,
            "https://example.com/v1/models",
            r#"{"error":{"message":"请提供请求API-Key"}}"#,
        );

        assert!(message.contains("401"));
        assert!(message.contains("鉴权失败"));
        assert!(!message.contains("请提供请求API-Key"));
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
    fn openai_compatible_parser_accepts_anthropic_style_gateway_events() {
        let mut oai_state = OaiParseState::default();
        let mut anthropic_state = MiniMaxParseState::default();
        let events = parse_openai_compatible_sse_block(
            &mut oai_state,
            &mut anthropic_state,
            r#"event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"分析"}}"#,
        );

        assert_eq!(
            events,
            vec![MiniMaxStreamEvent::ThinkingDelta {
                thinking: "分析".to_string(),
            }]
        );
    }

    #[test]
    fn openai_parser_turns_done_marker_into_done_event() {
        let mut state = OaiParseState::default();
        let events = parse_oai_sse_block(&mut state, "data: [DONE]");

        assert_eq!(events, vec![MiniMaxStreamEvent::Done { stop_reason: None }]);
    }

    #[test]
    fn parses_openai_non_stream_text_reasoning_usage_and_tool_calls() {
        let events = parse_custom_non_stream_response(
            CustomProviderProtocol::OpenAiCompatible,
            &serde_json::json!({
                "choices": [{
                    "message": {
                        "reasoning_content": "分析",
                        "content": "OK",
                        "tool_calls": [{
                            "id": "call_1",
                            "function": {
                                "name": "read_text_file",
                                "arguments": "{\"path\":\"/tmp/a\"}"
                            }
                        }]
                    },
                    "finish_reason": "stop"
                }],
                "usage": { "prompt_tokens": 3, "completion_tokens": 2 }
            }),
        );

        assert!(events.contains(&MiniMaxStreamEvent::ThinkingDelta {
            thinking: "分析".to_string()
        }));
        assert!(events.contains(&MiniMaxStreamEvent::TextDelta {
            text: "OK".to_string()
        }));
        assert!(events.contains(&MiniMaxStreamEvent::ToolUseStart {
            id: "call_1".to_string(),
            name: "read_text_file".to_string()
        }));
        assert!(matches!(
            events.last(),
            Some(MiniMaxStreamEvent::Done { .. })
        ));
    }

    #[test]
    fn parses_anthropic_like_non_stream_content_blocks() {
        let events = parse_custom_non_stream_response(
            CustomProviderProtocol::OpenAiCompatible,
            &serde_json::json!({
                "content": [
                    { "type": "thinking", "thinking": "分析" },
                    { "type": "text", "text": "OK" }
                ],
                "usage": { "input_tokens": 1, "output_tokens": 2 },
                "stop_reason": "end_turn"
            }),
        );

        assert!(events.contains(&MiniMaxStreamEvent::ThinkingDelta {
            thinking: "分析".to_string()
        }));
        assert!(events.contains(&MiniMaxStreamEvent::TextDelta {
            text: "OK".to_string()
        }));
        assert_eq!(
            events.last(),
            Some(&MiniMaxStreamEvent::Done {
                stop_reason: Some("end_turn".to_string())
            })
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

    #[test]
    fn parses_custom_model_ids_from_common_data_response() {
        let ids = parse_custom_model_ids(&serde_json::json!({
            "data": [
                { "id": "gpt-4o-mini" },
                { "id": " deepseek-chat " },
                { "id": "gpt-4o-mini" },
                { "object": "model" }
            ]
        }));
        assert_eq!(ids, vec!["gpt-4o-mini", "deepseek-chat"]);
    }

    #[test]
    fn parses_custom_model_ids_from_proxy_models_response() {
        let ids = parse_custom_model_ids(&serde_json::json!({
            "models": [
                "model-a",
                { "id": "model-b" },
                " model-a "
            ]
        }));
        assert_eq!(ids, vec!["model-a", "model-b"]);

        let ids = parse_custom_model_ids(&serde_json::json!(["x", { "id": "y" }]));
        assert_eq!(ids, vec!["x", "y"]);
    }

    #[tokio::test]
    async fn custom_provider_crud_roundtrip_uses_sqlite() {
        let (pool, _dir) = fresh_pool().await;
        let config = config_from_input(CustomProviderConfigInput {
            id: Some("custom:test_provider".to_string()),
            name: " 公司网关 ".to_string(),
            protocol: CustomProviderProtocol::OpenAiCompatible,
            base_url: "https://llm.example.com/v1/".to_string(),
            model_ids: vec![" model-a ".to_string(), "model-a".to_string()],
            selected_model_id: "model-a".to_string(),
            supports_thinking: true,
            supports_tools: false,
            stream_mode: CustomProviderStreamMode::Auto,
        });

        upsert_custom_provider(&pool, &config).await.unwrap();
        let listed = list_custom_providers_from_pool(&pool).await.unwrap();

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "custom:test_provider");
        assert_eq!(listed[0].name, "公司网关");
        assert_eq!(listed[0].base_url, "https://llm.example.com/v1");
        assert_eq!(listed[0].model_ids, vec!["model-a"]);
        assert_eq!(listed[0].stream_mode, CustomProviderStreamMode::Auto);
    }

    #[tokio::test]
    async fn custom_provider_update_and_delete_cascades_api_key_config() {
        let (pool, _dir) = fresh_pool().await;
        let config = config_from_input(CustomProviderConfigInput {
            id: Some("custom:test_provider".to_string()),
            name: "网关".to_string(),
            protocol: CustomProviderProtocol::OpenAiCompatible,
            base_url: "https://llm.example.com/v1".to_string(),
            model_ids: vec!["model-a".to_string()],
            selected_model_id: "model-a".to_string(),
            supports_thinking: false,
            supports_tools: false,
            stream_mode: CustomProviderStreamMode::Auto,
        });
        upsert_custom_provider(&pool, &config).await.unwrap();
        sqlx::query(
            "INSERT INTO api_keys (provider, api_key, storage, preview, updated_at)
             VALUES (?1, ?2, 'plain', ?3, ?4)",
        )
        .bind("custom:test_provider")
        .bind("sk-custom")
        .bind("…stom")
        .bind(now_ms())
        .execute(&pool)
        .await
        .unwrap();

        let updated = apply_config_patch(
            config,
            CustomProviderConfigPatch {
                name: Some("新网关".to_string()),
                enabled: Some(false),
                model_ids: Some(vec!["model-b".to_string()]),
                selected_model_id: Some("model-b".to_string()),
                stream_mode: Some(CustomProviderStreamMode::NonStream),
                ..Default::default()
            },
        );
        upsert_custom_provider(&pool, &updated).await.unwrap();
        assert_eq!(
            get_custom_provider_from_pool(&pool, "custom:test_provider")
                .await
                .unwrap()
                .unwrap()
                .name,
            "新网关"
        );

        delete_custom_provider_from_pool(&pool, "custom:test_provider")
            .await
            .unwrap();
        assert!(get_custom_provider_from_pool(&pool, "custom:test_provider")
            .await
            .unwrap()
            .is_none());
        let key =
            sqlx::query_as::<_, (String,)>("SELECT api_key FROM api_keys WHERE provider = ?1")
                .bind("custom:test_provider")
                .fetch_optional(&pool)
                .await
                .unwrap();
        assert!(key.is_none());
    }

    #[test]
    fn sanitize_error_replaces_api_key() {
        let message = "upstream rejected sk-test-secret";
        assert_eq!(
            sanitize_error(message, "sk-test-secret"),
            "upstream rejected [secret]"
        );
    }
}
