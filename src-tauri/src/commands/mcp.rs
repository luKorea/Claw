use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use uuid::Uuid;

use crate::db;
use crate::error::{AppError, AppResult};

const CONNECTION_TEST_TIMEOUT: Duration = Duration::from_secs(5);
const TOOL_CALL_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_TOOL_RESULT_CHARS: usize = 20_000;
const MCP_TRANSPORT_LOCAL_COMMAND: &str = "local-command";

static MCP_RUNTIME: OnceLock<Mutex<McpRuntimeState>> = OnceLock::new();

#[derive(Debug, Default)]
struct McpRuntimeState {
    discovered_tools: HashMap<String, Vec<McpTool>>,
}

fn runtime_state() -> &'static Mutex<McpRuntimeState> {
    MCP_RUNTIME.get_or_init(|| Mutex::new(McpRuntimeState::default()))
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum McpTransport {
    LocalCommand,
}

fn transport_to_db(transport: McpTransport) -> &'static str {
    match transport {
        McpTransport::LocalCommand => MCP_TRANSPORT_LOCAL_COMMAND,
    }
}

fn transport_from_db(raw: &str) -> AppResult<McpTransport> {
    match raw {
        MCP_TRANSPORT_LOCAL_COMMAND => Ok(McpTransport::LocalCommand),
        _ => Err(AppError::InvalidInput(format!(
            "MCP MVP 暂不支持该 transport: {raw}"
        ))),
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInput {
    #[serde(default)]
    id: Option<String>,
    name: String,
    transport: McpTransport,
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    working_directory: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
    #[serde(default = "default_enabled")]
    enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerUpdateInput {
    id: String,
    name: String,
    transport: McpTransport,
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    working_directory: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
    enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpServerConfigBlob {
    command: String,
    args: Vec<String>,
    working_directory: Option<String>,
    env: HashMap<String, String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpStatusPhase {
    NotTested,
    Ready,
    Failed,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpErrorCategory {
    StartupFailed,
    InitializationFailed,
    DiscoveryFailed,
    Timeout,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpToolErrorCategory {
    UnknownTool,
    ServerDisabled,
    ServerDeleted,
    InvocationFailed,
    Timeout,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    server_id: String,
    phase: McpStatusPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    server_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    server_version: Option<String>,
    supports_tools: bool,
    tool_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_checked_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_category: Option<McpErrorCategory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    server_id: String,
    server_name: String,
    original_name: String,
    runtime_name: String,
    description: String,
    input_schema: Value,
    enabled: bool,
    discovered_at: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    id: String,
    name: String,
    transport: McpTransport,
    command: String,
    args: Vec<String>,
    working_directory: Option<String>,
    env_keys: Vec<String>,
    enabled: bool,
    status: McpServerStatus,
    tools: Vec<McpTool>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolCallInput {
    runtime_name: String,
    #[serde(default)]
    arguments: Value,
    tool_use_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpToolCallResult {
    tool_use_id: String,
    content: String,
    is_error: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_category: Option<McpToolErrorCategory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
}

#[derive(Clone, Debug)]
struct StoredMcpServer {
    id: String,
    name: String,
    transport: McpTransport,
    command: String,
    args: Vec<String>,
    working_directory: Option<String>,
    env: HashMap<String, String>,
    enabled: bool,
    status: McpServerStatus,
    tools: Vec<McpTool>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Clone, Debug)]
struct McpDiscoveryOutcome {
    server_name: Option<String>,
    server_version: Option<String>,
    supports_tools: bool,
    tools: Vec<McpTool>,
}

fn default_enabled() -> bool {
    true
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn make_mcp_server_id() -> String {
    format!("mcp_{}", Uuid::new_v4().simple())
}

fn is_mcp_server_id(id: &str) -> bool {
    let Some(suffix) = id.strip_prefix("mcp_") else {
        return false;
    };
    !suffix.is_empty()
        && suffix
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn normalize_args(args: Vec<String>) -> Vec<String> {
    args.into_iter()
        .map(|arg| arg.trim().to_string())
        .filter(|arg| !arg.is_empty())
        .collect()
}

fn normalize_working_directory(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn normalize_env(env: HashMap<String, String>) -> HashMap<String, String> {
    env.into_iter()
        .filter_map(|(key, value)| {
            let key = key.trim().to_string();
            if key.is_empty() {
                None
            } else {
                Some((key, value))
            }
        })
        .collect()
}

fn status_not_tested(server_id: &str) -> McpServerStatus {
    McpServerStatus {
        server_id: server_id.to_string(),
        phase: McpStatusPhase::NotTested,
        server_name: None,
        server_version: None,
        supports_tools: false,
        tool_count: 0,
        last_checked_at: None,
        error_category: None,
        error_message: None,
    }
}

fn config_from_input(input: McpServerInput) -> StoredMcpServer {
    let id = input.id.unwrap_or_else(make_mcp_server_id);
    let timestamp = now_ms();
    StoredMcpServer {
        status: status_not_tested(&id),
        id,
        name: input.name.trim().to_string(),
        transport: input.transport,
        command: input.command.trim().to_string(),
        args: normalize_args(input.args),
        working_directory: normalize_working_directory(input.working_directory),
        env: normalize_env(input.env),
        enabled: input.enabled,
        tools: Vec::new(),
        created_at: timestamp,
        updated_at: timestamp,
    }
}

fn merge_update_env(
    incoming: HashMap<String, String>,
    current: &HashMap<String, String>,
) -> HashMap<String, String> {
    normalize_env(incoming)
        .into_iter()
        .map(|(key, value)| {
            if value.trim().is_empty() {
                match current.get(&key) {
                    Some(existing) => (key, existing.clone()),
                    None => (key, value),
                }
            } else {
                (key, value)
            }
        })
        .collect()
}

fn config_from_update_input(
    input: McpServerUpdateInput,
    current: &StoredMcpServer,
) -> StoredMcpServer {
    let timestamp = now_ms();
    StoredMcpServer {
        status: status_not_tested(&input.id),
        id: input.id,
        name: input.name.trim().to_string(),
        transport: input.transport,
        command: input.command.trim().to_string(),
        args: normalize_args(input.args),
        working_directory: normalize_working_directory(input.working_directory),
        env: merge_update_env(input.env, &current.env),
        enabled: input.enabled,
        tools: Vec::new(),
        created_at: current.created_at,
        updated_at: timestamp,
    }
}

fn validate_server(config: &StoredMcpServer) -> AppResult<()> {
    if !is_mcp_server_id(&config.id) {
        return Err(AppError::InvalidInput("MCP Server ID 无效".to_string()));
    }
    if config.name.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "MCP Server 名称不能为空".to_string(),
        ));
    }
    if config.command.trim().is_empty() {
        return Err(AppError::InvalidInput("MCP 启动命令不能为空".to_string()));
    }
    if config.transport != McpTransport::LocalCommand {
        return Err(AppError::InvalidInput(
            "MCP MVP 仅支持本地命令 transport".to_string(),
        ));
    }
    Ok(())
}

fn config_blob(config: &StoredMcpServer) -> McpServerConfigBlob {
    McpServerConfigBlob {
        command: config.command.clone(),
        args: config.args.clone(),
        working_directory: config.working_directory.clone(),
        env: config.env.clone(),
    }
}

fn response_from_stored(config: StoredMcpServer) -> McpServerConfig {
    let mut env_keys = config.env.keys().cloned().collect::<Vec<_>>();
    env_keys.sort();
    McpServerConfig {
        id: config.id,
        name: config.name,
        transport: config.transport,
        command: config.command,
        args: config.args,
        working_directory: config.working_directory,
        env_keys,
        enabled: config.enabled,
        status: config.status,
        tools: config.tools,
        created_at: config.created_at,
        updated_at: config.updated_at,
    }
}

fn mcp_server_from_row(
    row: (
        String,
        String,
        String,
        String,
        i64,
        i64,
        i64,
        Option<String>,
        Option<String>,
    ),
) -> AppResult<StoredMcpServer> {
    let (id, name, transport, config, enabled, created_at, updated_at, status, tools) = row;
    let blob: McpServerConfigBlob = serde_json::from_str(&config)?;
    let status = status
        .map(|value| serde_json::from_str(&value))
        .transpose()?
        .unwrap_or_else(|| status_not_tested(&id));
    let tools = tools
        .map(|value| serde_json::from_str(&value))
        .transpose()?
        .unwrap_or_default();
    Ok(StoredMcpServer {
        id,
        name,
        transport: transport_from_db(&transport)?,
        command: blob.command,
        args: blob.args,
        working_directory: blob.working_directory,
        env: blob.env,
        enabled: enabled != 0,
        status,
        tools,
        created_at,
        updated_at,
    })
}

async fn get_mcp_server_from_pool(
    pool: &SqlitePool,
    id: &str,
) -> AppResult<Option<StoredMcpServer>> {
    if !is_mcp_server_id(id) {
        return Err(AppError::InvalidInput("MCP Server ID 无效".to_string()));
    }
    let row = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            i64,
            i64,
            i64,
            Option<String>,
            Option<String>,
        ),
    >(
        "SELECT id, name, transport, config, enabled, created_at, updated_at, last_status, tools
         FROM mcp_servers
         WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    row.map(mcp_server_from_row).transpose()
}

async fn list_stored_mcp_servers_from_pool(pool: &SqlitePool) -> AppResult<Vec<StoredMcpServer>> {
    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            i64,
            i64,
            i64,
            Option<String>,
            Option<String>,
        ),
    >(
        "SELECT id, name, transport, config, enabled, created_at, updated_at, last_status, tools
         FROM mcp_servers
         ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(mcp_server_from_row).collect()
}

async fn list_mcp_servers_from_pool(pool: &SqlitePool) -> AppResult<Vec<McpServerConfig>> {
    let servers = list_stored_mcp_servers_from_pool(pool)
        .await?
        .into_iter()
        .map(response_from_stored)
        .collect::<Vec<_>>();
    Ok(servers)
}

async fn list_mcp_tools_from_pool(
    pool: &SqlitePool,
    server_id: Option<&str>,
) -> AppResult<Vec<McpTool>> {
    if let Some(id) = server_id {
        if !is_mcp_server_id(id) {
            return Err(AppError::InvalidInput("MCP Server ID 无效".to_string()));
        }
    }

    let mut tools = list_stored_mcp_servers_from_pool(pool)
        .await?
        .into_iter()
        .filter(|server| server.enabled && server.status.phase == McpStatusPhase::Ready)
        .filter(|server| match server_id {
            Some(id) => server.id == id,
            None => true,
        })
        .flat_map(|server| {
            server
                .tools
                .into_iter()
                .filter(|tool| tool.enabled)
                .map(|mut tool| {
                    tool.enabled = true;
                    tool
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    tools.sort_by(|a, b| {
        a.server_name
            .cmp(&b.server_name)
            .then_with(|| a.original_name.cmp(&b.original_name))
    });
    Ok(tools)
}

async fn upsert_mcp_server(pool: &SqlitePool, config: &StoredMcpServer) -> AppResult<()> {
    validate_server(config)?;
    sqlx::query(
        "INSERT INTO mcp_servers
          (id, name, transport, config, enabled, created_at, updated_at, last_status, tools)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          transport = excluded.transport,
          config = excluded.config,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at,
          last_status = excluded.last_status,
          tools = excluded.tools",
    )
    .bind(&config.id)
    .bind(&config.name)
    .bind(transport_to_db(config.transport))
    .bind(serde_json::to_string(&config_blob(config))?)
    .bind(if config.enabled { 1_i64 } else { 0_i64 })
    .bind(config.created_at)
    .bind(config.updated_at)
    .bind(serde_json::to_string(&config.status)?)
    .bind(serde_json::to_string(&config.tools)?)
    .execute(pool)
    .await?;
    Ok(())
}

async fn update_status_and_tools(
    pool: &SqlitePool,
    server_id: &str,
    status: &McpServerStatus,
    tools: &[McpTool],
) -> AppResult<()> {
    sqlx::query(
        "UPDATE mcp_servers
         SET last_status = ?2, tools = ?3, updated_at = ?4
         WHERE id = ?1",
    )
    .bind(server_id)
    .bind(serde_json::to_string(status)?)
    .bind(serde_json::to_string(tools)?)
    .bind(now_ms())
    .execute(pool)
    .await?;
    Ok(())
}

fn sync_runtime_tools(server_id: &str, status: &McpServerStatus, tools: Vec<McpTool>) {
    if let Ok(mut state) = runtime_state().lock() {
        if status.phase == McpStatusPhase::Ready {
            state.discovered_tools.insert(server_id.to_string(), tools);
        } else {
            state.discovered_tools.remove(server_id);
        }
    }
}

async fn delete_mcp_server_from_pool(pool: &SqlitePool, id: &str) -> AppResult<()> {
    if !is_mcp_server_id(id) {
        return Err(AppError::InvalidInput("MCP Server ID 无效".to_string()));
    }
    let result = sqlx::query("DELETE FROM mcp_servers WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("MCP Server 不存在".to_string()));
    }
    if let Ok(mut state) = runtime_state().lock() {
        state.discovered_tools.remove(id);
    }
    Ok(())
}

async fn set_mcp_server_enabled_in_pool(
    pool: &SqlitePool,
    id: &str,
    enabled: bool,
) -> AppResult<McpServerConfig> {
    let mut server = get_mcp_server_from_pool(pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("MCP Server 不存在".to_string()))?;
    server.enabled = enabled;
    server.updated_at = now_ms();
    for tool in &mut server.tools {
        tool.enabled = enabled;
    }
    upsert_mcp_server(pool, &server).await?;
    if enabled && server.status.phase == McpStatusPhase::Ready {
        sync_runtime_tools(&server.id, &server.status, server.tools.clone());
    } else if let Ok(mut state) = runtime_state().lock() {
        state.discovered_tools.remove(&server.id);
    }
    Ok(response_from_stored(server))
}

async fn refresh_mcp_server_tools_in_pool(
    pool: &SqlitePool,
    id: &str,
) -> AppResult<McpServerStatus> {
    let server = get_mcp_server_from_pool(pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("MCP Server 不存在".to_string()))?;
    let (status, tools) = test_mcp_server_inner(&server).await;
    update_status_and_tools(pool, &server.id, &status, &tools).await?;
    sync_runtime_tools(&server.id, &status, tools);
    Ok(status)
}

fn sanitize_runtime_part(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut previous_underscore = false;
    for ch in raw.chars() {
        let next = if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            ch
        } else {
            '_'
        };
        if next == '_' && previous_underscore {
            continue;
        }
        previous_underscore = next == '_';
        out.push(next);
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() {
        "tool".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn make_mcp_runtime_tool_name(server_id: &str, original_name: &str) -> String {
    format!(
        "mcp__{}__{}",
        sanitize_runtime_part(server_id),
        sanitize_runtime_part(original_name)
    )
}

fn tool_from_value(tool: &Value, server: &StoredMcpServer, discovered_at: i64) -> Option<McpTool> {
    let original_name = tool.get("name").and_then(Value::as_str)?.to_string();
    let input_schema = tool
        .get("inputSchema")
        .cloned()
        .or_else(|| tool.get("input_schema").cloned())
        .unwrap_or_else(|| json!({ "type": "object" }));

    Some(McpTool {
        server_id: server.id.clone(),
        server_name: server.name.clone(),
        runtime_name: make_mcp_runtime_tool_name(&server.id, &original_name),
        description: tool
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        input_schema,
        original_name,
        enabled: server.enabled,
        discovered_at,
    })
}

fn is_sensitive_key(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();
    [
        "KEY",
        "TOKEN",
        "SECRET",
        "PASSWORD",
        "PASS",
        "COOKIE",
        "AUTH",
        "CREDENTIAL",
    ]
    .iter()
    .any(|needle| upper.contains(needle))
}

pub fn redact_mcp_diagnostic(message: &str, env: &HashMap<String, String>) -> String {
    let mut redacted = message.to_string();
    for (key, value) in env {
        if value.trim().is_empty() {
            continue;
        }
        if is_sensitive_key(key) || value.len() >= 8 {
            redacted = redacted.replace(value, "[secret]");
        }
    }
    redacted.chars().take(600).collect()
}

fn failed_status(
    server: &StoredMcpServer,
    category: McpErrorCategory,
    message: impl Into<String>,
) -> McpServerStatus {
    McpServerStatus {
        server_id: server.id.clone(),
        phase: McpStatusPhase::Failed,
        server_name: None,
        server_version: None,
        supports_tools: false,
        tool_count: 0,
        last_checked_at: Some(now_ms()),
        error_category: Some(category),
        error_message: Some(redact_mcp_diagnostic(&message.into(), &server.env)),
    }
}

fn ready_status(server: &StoredMcpServer, outcome: &McpDiscoveryOutcome) -> McpServerStatus {
    McpServerStatus {
        server_id: server.id.clone(),
        phase: McpStatusPhase::Ready,
        server_name: outcome.server_name.clone(),
        server_version: outcome.server_version.clone(),
        supports_tools: outcome.supports_tools,
        tool_count: outcome.tools.len(),
        last_checked_at: Some(now_ms()),
        error_category: None,
        error_message: None,
    }
}

async fn write_json_rpc(
    stdin: &mut tokio::process::ChildStdin,
    message: &Value,
) -> Result<(), String> {
    let mut line = serde_json::to_vec(message).map_err(|err| err.to_string())?;
    line.push(b'\n');
    stdin
        .write_all(&line)
        .await
        .map_err(|err| format!("MCP stdio write failed. {err}"))
}

async fn read_json_rpc_response(
    lines: &mut Lines<BufReader<ChildStdout>>,
    expected_id: i64,
) -> Result<Value, String> {
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|err| format!("MCP stdio read failed. {err}"))?
    {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let message: Value = serde_json::from_str(trimmed)
            .map_err(|err| format!("MCP returned invalid JSON-RPC. {err}"))?;
        if message.get("id").and_then(Value::as_i64) != Some(expected_id) {
            continue;
        }
        if let Some(error) = message.get("error") {
            return Err(format!("MCP JSON-RPC error: {error}"));
        }
        return Ok(message.get("result").cloned().unwrap_or(Value::Null));
    }
    Err("MCP server closed stdout before responding.".to_string())
}

fn protocol_supports_tools(initialize_result: &Value) -> bool {
    initialize_result
        .pointer("/capabilities/tools")
        .map(|value| !value.is_null())
        .unwrap_or(false)
}

fn server_info(initialize_result: &Value) -> (Option<String>, Option<String>) {
    let info = initialize_result
        .get("serverInfo")
        .or_else(|| initialize_result.get("server_info"));
    let name = info
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let version = info
        .and_then(|value| value.get("version"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    (name, version)
}

async fn open_local_command_connection(
    server: &StoredMcpServer,
) -> Result<
    (
        Child,
        ChildStdin,
        Lines<BufReader<ChildStdout>>,
        serde_json::Value,
    ),
    String,
> {
    let mut command = Command::new(&server.command);
    command.args(&server.args);
    if let Some(working_directory) = &server.working_directory {
        command.current_dir(working_directory);
    }
    for (key, value) in &server.env {
        command.env(key, value);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| {
            format!("Command could not be started. Check the executable path and arguments. {err}")
        })?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "MCP child stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "MCP child stdout is unavailable.".to_string())?;
    let mut lines = BufReader::new(stdout).lines();

    write_json_rpc(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {
                    "name": "claw-client",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }
        }),
    )
    .await?;
    let initialize_result = read_json_rpc_response(&mut lines, 1)
        .await
        .map_err(|err| {
            format!(
                "MCP initialization failed. Check whether the command starts an MCP stdio server. {err}"
            )
        })?;

    write_json_rpc(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }),
    )
    .await?;

    Ok((child, stdin, lines, initialize_result))
}

async fn close_local_command_connection(mut child: Child, mut stdin: ChildStdin) {
    let _ = stdin.shutdown().await;
    let _ = child.kill().await;
    let _ = child.wait().await;
}

async fn discover_local_command_tools(
    server: &StoredMcpServer,
) -> Result<McpDiscoveryOutcome, String> {
    let (child, mut stdin, mut lines, initialize_result) =
        open_local_command_connection(server).await?;

    let supports_tools = protocol_supports_tools(&initialize_result);
    let discovered_at = now_ms();
    let tools = if supports_tools {
        write_json_rpc(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {}
            }),
        )
        .await?;
        let list_result = read_json_rpc_response(&mut lines, 2)
            .await
            .map_err(|err| format!("MCP tool discovery failed. {err}"))?;
        list_result
            .get("tools")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|tool| tool_from_value(tool, server, discovered_at))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    close_local_command_connection(child, stdin).await;
    let (server_name, server_version) = server_info(&initialize_result);

    Ok(McpDiscoveryOutcome {
        server_name,
        server_version,
        supports_tools,
        tools,
    })
}

async fn call_local_command_tool(
    server: &StoredMcpServer,
    original_name: &str,
    arguments: &Value,
) -> Result<Value, String> {
    let (child, mut stdin, mut lines, initialize_result) =
        open_local_command_connection(server).await?;
    if !protocol_supports_tools(&initialize_result) {
        close_local_command_connection(child, stdin).await;
        return Err("MCP server does not report tools capability.".to_string());
    }

    write_json_rpc(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": original_name,
                "arguments": arguments
            }
        }),
    )
    .await?;
    let result = read_json_rpc_response(&mut lines, 2)
        .await
        .map_err(|err| format!("MCP tool invocation failed. {err}"));
    close_local_command_connection(child, stdin).await;
    result
}

fn bounded_tool_result(content: String) -> String {
    let mut chars = content.chars();
    let bounded = chars
        .by_ref()
        .take(MAX_TOOL_RESULT_CHARS)
        .collect::<String>();
    if chars.next().is_some() {
        format!("{bounded}\n\n...(truncated)")
    } else {
        bounded
    }
}

fn normalize_mcp_tool_content(result: &Value) -> (String, &'static str) {
    let mut text_parts = Vec::new();
    if let Some(items) = result.get("content").and_then(Value::as_array) {
        for item in items {
            match item.get("type").and_then(Value::as_str) {
                Some("text") => {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        text_parts.push(text.to_string());
                    }
                }
                Some(kind) => text_parts.push(format!("[Unsupported MCP content type: {kind}]")),
                None => text_parts
                    .push(serde_json::to_string_pretty(item).unwrap_or_else(|_| item.to_string())),
            }
        }
    }
    if !text_parts.is_empty() {
        return (text_parts.join("\n"), "Returned text content");
    }

    let structured = result
        .get("structuredContent")
        .or_else(|| result.get("structured_content"));
    if let Some(value) = structured {
        return (
            serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()),
            "Returned structured content",
        );
    }

    (
        serde_json::to_string_pretty(result).unwrap_or_else(|_| result.to_string()),
        "Returned MCP result",
    )
}

fn normalize_mcp_tool_call_result(input: &McpToolCallInput, result: &Value) -> McpToolCallResult {
    let is_error = result
        .get("isError")
        .or_else(|| result.get("is_error"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let (content, summary) = normalize_mcp_tool_content(result);
    McpToolCallResult {
        tool_use_id: input.tool_use_id.clone(),
        content: bounded_tool_result(content),
        is_error,
        error_category: if is_error {
            Some(McpToolErrorCategory::InvocationFailed)
        } else {
            None
        },
        summary: Some(if is_error {
            "MCP tool returned error".to_string()
        } else {
            summary.to_string()
        }),
    }
}

fn mcp_tool_call_error(
    tool_use_id: &str,
    category: McpToolErrorCategory,
    summary: impl Into<String>,
    content: impl Into<String>,
) -> McpToolCallResult {
    McpToolCallResult {
        tool_use_id: tool_use_id.to_string(),
        content: bounded_tool_result(content.into()),
        is_error: true,
        error_category: Some(category),
        summary: Some(summary.into()),
    }
}

fn server_id_from_runtime_tool_name(runtime_name: &str) -> Option<&str> {
    runtime_name
        .strip_prefix("mcp__")
        .and_then(|rest| rest.split_once("__"))
        .map(|(server_id, _)| server_id)
}

fn resolve_tool_call_target(
    input: &McpToolCallInput,
    servers: Vec<StoredMcpServer>,
) -> Result<(StoredMcpServer, McpTool), McpToolCallResult> {
    for server in &servers {
        let maybe_tool = server
            .tools
            .iter()
            .find(|tool| tool.runtime_name == input.runtime_name)
            .cloned();
        let Some(tool) = maybe_tool else {
            continue;
        };
        if !server.enabled {
            return Err(mcp_tool_call_error(
                &input.tool_use_id,
                McpToolErrorCategory::ServerDisabled,
                "Server disabled",
                "MCP tool failed: server disabled",
            ));
        }
        if server.status.phase != McpStatusPhase::Ready {
            return Err(mcp_tool_call_error(
                &input.tool_use_id,
                McpToolErrorCategory::InvocationFailed,
                "Server not ready",
                "MCP tool failed: server has not completed tool discovery",
            ));
        }
        if !tool.enabled {
            return Err(mcp_tool_call_error(
                &input.tool_use_id,
                McpToolErrorCategory::ServerDisabled,
                "Tool disabled",
                "MCP tool failed: tool is not enabled",
            ));
        }
        return Ok((server.clone(), tool));
    }

    if let Some(server_id) = server_id_from_runtime_tool_name(&input.runtime_name) {
        if !servers.iter().any(|server| server.id == server_id) {
            return Err(mcp_tool_call_error(
                &input.tool_use_id,
                McpToolErrorCategory::ServerDeleted,
                "Server deleted",
                "MCP tool failed: server deleted",
            ));
        }
    }

    Err(mcp_tool_call_error(
        &input.tool_use_id,
        McpToolErrorCategory::UnknownTool,
        "Unknown MCP tool",
        format!(
            "MCP tool failed: unknown runtime tool {}",
            input.runtime_name
        ),
    ))
}

async fn test_mcp_server_inner(server: &StoredMcpServer) -> (McpServerStatus, Vec<McpTool>) {
    let result = tokio::time::timeout(
        CONNECTION_TEST_TIMEOUT,
        discover_local_command_tools(server),
    )
    .await;
    match result {
        Ok(Ok(outcome)) => {
            let status = ready_status(server, &outcome);
            (status, outcome.tools)
        }
        Ok(Err(message)) => {
            let category = if message.contains("started") {
                McpErrorCategory::StartupFailed
            } else if message.contains("discovery") {
                McpErrorCategory::DiscoveryFailed
            } else {
                McpErrorCategory::InitializationFailed
            };
            (failed_status(server, category, message), Vec::new())
        }
        Err(_) => (
            failed_status(
                server,
                McpErrorCategory::Timeout,
                "MCP connection test timed out. Check whether the server starts and responds on stdio.",
            ),
            Vec::new(),
        ),
    }
}

#[tauri::command]
pub async fn list_mcp_servers() -> AppResult<Vec<McpServerConfig>> {
    let pool = db::pool()?;
    list_mcp_servers_from_pool(&pool).await
}

#[tauri::command]
pub async fn create_mcp_server(input: McpServerInput) -> AppResult<McpServerConfig> {
    let pool = db::pool()?;
    let config = config_from_input(input);
    upsert_mcp_server(&pool, &config).await?;
    Ok(response_from_stored(config))
}

#[tauri::command]
pub async fn update_mcp_server(input: McpServerUpdateInput) -> AppResult<McpServerConfig> {
    let pool = db::pool()?;
    let current = get_mcp_server_from_pool(&pool, &input.id)
        .await?
        .ok_or_else(|| AppError::NotFound("MCP Server 不存在".to_string()))?;
    let config = config_from_update_input(input, &current);
    upsert_mcp_server(&pool, &config).await?;
    Ok(response_from_stored(config))
}

#[tauri::command]
pub async fn test_mcp_server(id: String) -> AppResult<McpServerStatus> {
    let pool = db::pool()?;
    refresh_mcp_server_tools_in_pool(&pool, &id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_mcp_tools(server_id: Option<String>) -> AppResult<Vec<McpTool>> {
    let pool = db::pool()?;
    list_mcp_tools_from_pool(&pool, server_id.as_deref()).await
}

#[tauri::command]
pub async fn call_mcp_tool(input: McpToolCallInput) -> AppResult<McpToolCallResult> {
    let pool = db::pool()?;
    let servers = list_stored_mcp_servers_from_pool(&pool).await?;
    let (server, tool) = match resolve_tool_call_target(&input, servers) {
        Ok(target) => target,
        Err(result) => return Ok(result),
    };

    let call = tokio::time::timeout(
        TOOL_CALL_TIMEOUT,
        call_local_command_tool(&server, &tool.original_name, &input.arguments),
    )
    .await;

    match call {
        Ok(Ok(result)) => Ok(normalize_mcp_tool_call_result(&input, &result)),
        Ok(Err(message)) => Ok(mcp_tool_call_error(
            &input.tool_use_id,
            McpToolErrorCategory::InvocationFailed,
            "MCP tool invocation failed",
            redact_mcp_diagnostic(&message, &server.env),
        )),
        Err(_) => Ok(mcp_tool_call_error(
            &input.tool_use_id,
            McpToolErrorCategory::Timeout,
            "MCP tool timed out",
            "MCP tool failed: invocation timed out",
        )),
    }
}

#[tauri::command]
pub async fn delete_mcp_server(id: String) -> AppResult<()> {
    let pool = db::pool()?;
    delete_mcp_server_from_pool(&pool, &id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_mcp_server_enabled(id: String, enabled: bool) -> AppResult<McpServerConfig> {
    let pool = db::pool()?;
    set_mcp_server_enabled_in_pool(&pool, &id, enabled).await
}

#[tauri::command]
pub async fn refresh_mcp_server_tools(id: String) -> AppResult<McpServerStatus> {
    let pool = db::pool()?;
    refresh_mcp_server_tools_in_pool(&pool, &id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE mcp_servers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              transport TEXT NOT NULL,
              config TEXT NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 1,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              last_status TEXT,
              tools TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    fn valid_input() -> McpServerInput {
        McpServerInput {
            id: Some("mcp_test".to_string()),
            name: "Filesystem".to_string(),
            transport: McpTransport::LocalCommand,
            command: "node".to_string(),
            args: vec!["server.js".to_string()],
            working_directory: Some(" /tmp ".to_string()),
            env: HashMap::from([("API_TOKEN".to_string(), "super-secret-token".to_string())]),
            enabled: true,
        }
    }

    #[tokio::test]
    async fn create_list_update_mcp_server_round_trip() {
        let pool = test_pool().await;
        let config = config_from_input(valid_input());

        upsert_mcp_server(&pool, &config).await.unwrap();
        let listed = list_mcp_servers_from_pool(&pool).await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "mcp_test");
        assert_eq!(listed[0].name, "Filesystem");
        assert_eq!(listed[0].args, vec!["server.js"]);
        assert_eq!(listed[0].working_directory.as_deref(), Some("/tmp"));
        assert_eq!(listed[0].env_keys, vec!["API_TOKEN"]);
        assert_eq!(listed[0].status.phase, McpStatusPhase::NotTested);

        let updated = config_from_update_input(
            McpServerUpdateInput {
                id: "mcp_test".to_string(),
                name: "Updated".to_string(),
                transport: McpTransport::LocalCommand,
                command: "npx".to_string(),
                args: vec![" -y ".to_string(), "server".to_string()],
                working_directory: None,
                env: HashMap::new(),
                enabled: false,
            },
            &config,
        );
        upsert_mcp_server(&pool, &updated).await.unwrap();

        let saved = get_mcp_server_from_pool(&pool, "mcp_test")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(saved.name, "Updated");
        assert_eq!(saved.command, "npx");
        assert_eq!(saved.args, vec!["-y", "server"]);
        assert!(!saved.enabled);
        assert_eq!(saved.status.phase, McpStatusPhase::NotTested);
    }

    #[test]
    fn update_env_preserves_overwrites_and_removes_keys() {
        let current = config_from_input(McpServerInput {
            env: HashMap::from([
                ("API_TOKEN".to_string(), "old-secret".to_string()),
                ("DEBUG".to_string(), "true".to_string()),
            ]),
            ..valid_input()
        });

        let updated = config_from_update_input(
            McpServerUpdateInput {
                id: current.id.clone(),
                name: current.name.clone(),
                transport: current.transport,
                command: current.command.clone(),
                args: current.args.clone(),
                working_directory: current.working_directory.clone(),
                env: HashMap::from([
                    ("API_TOKEN".to_string(), "".to_string()),
                    ("NEW_TOKEN".to_string(), "new-secret".to_string()),
                ]),
                enabled: current.enabled,
            },
            &current,
        );

        assert_eq!(
            updated.env.get("API_TOKEN").map(String::as_str),
            Some("old-secret")
        );
        assert_eq!(
            updated.env.get("NEW_TOKEN").map(String::as_str),
            Some("new-secret")
        );
        assert!(!updated.env.contains_key("DEBUG"));
    }

    #[test]
    fn validate_rejects_remote_transport_and_empty_fields() {
        let mut config = config_from_input(valid_input());
        config.name.clear();
        assert!(validate_server(&config).is_err());

        let mut config = config_from_input(valid_input());
        config.command.clear();
        assert!(validate_server(&config).is_err());
    }

    #[test]
    fn redacts_sensitive_env_values_from_diagnostics() {
        let env = HashMap::from([
            ("API_TOKEN".to_string(), "secret-123456789".to_string()),
            ("NORMAL".to_string(), "visible".to_string()),
        ]);
        let redacted =
            redact_mcp_diagnostic("failed with secret-123456789 and visible details", &env);
        assert!(!redacted.contains("secret-123456789"));
        assert!(redacted.contains("[secret]"));
        assert!(redacted.contains("visible details"));
    }

    #[test]
    fn creates_collision_safe_runtime_tool_name() {
        assert_eq!(
            make_mcp_runtime_tool_name("mcp_abc", "read file"),
            "mcp__mcp_abc__read_file"
        );
    }

    #[tokio::test]
    async fn connection_test_maps_invalid_command_to_failed_status() {
        let mut server = config_from_input(valid_input());
        server.command = "definitely-not-a-real-mcp-command-12345".to_string();

        let (status, tools) = test_mcp_server_inner(&server).await;

        assert_eq!(status.phase, McpStatusPhase::Failed);
        assert_eq!(status.error_category, Some(McpErrorCategory::StartupFailed));
        assert_eq!(status.tool_count, 0);
        assert!(tools.is_empty());
    }

    fn sample_tool(server: &StoredMcpServer, original_name: &str) -> McpTool {
        McpTool {
            server_id: server.id.clone(),
            server_name: server.name.clone(),
            original_name: original_name.to_string(),
            runtime_name: make_mcp_runtime_tool_name(&server.id, original_name),
            description: "Sample tool".to_string(),
            input_schema: json!({ "type": "object" }),
            enabled: server.enabled,
            discovered_at: 1,
        }
    }

    fn mark_ready(server: &mut StoredMcpServer) {
        server.status = McpServerStatus {
            server_id: server.id.clone(),
            phase: McpStatusPhase::Ready,
            server_name: Some(server.name.clone()),
            server_version: Some("1.0.0".to_string()),
            supports_tools: true,
            tool_count: server.tools.len(),
            last_checked_at: Some(1),
            error_category: None,
            error_message: None,
        };
    }

    #[tokio::test]
    async fn list_mcp_tools_filters_disabled_and_not_ready_servers() {
        let pool = test_pool().await;

        let mut enabled = config_from_input(valid_input());
        enabled.id = "mcp_enabled".to_string();
        enabled.tools = vec![sample_tool(&enabled, "read_file")];
        mark_ready(&mut enabled);
        upsert_mcp_server(&pool, &enabled).await.unwrap();

        let mut disabled = config_from_input(valid_input());
        disabled.id = "mcp_disabled".to_string();
        disabled.enabled = false;
        disabled.tools = vec![sample_tool(&disabled, "secret_tool")];
        mark_ready(&mut disabled);
        upsert_mcp_server(&pool, &disabled).await.unwrap();

        let mut not_ready = config_from_input(valid_input());
        not_ready.id = "mcp_not_ready".to_string();
        not_ready.tools = vec![sample_tool(&not_ready, "stale_tool")];
        upsert_mcp_server(&pool, &not_ready).await.unwrap();

        let tools = list_mcp_tools_from_pool(&pool, None).await.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].runtime_name, "mcp__mcp_enabled__read_file");

        let disabled_tools = list_mcp_tools_from_pool(&pool, Some("mcp_disabled"))
            .await
            .unwrap();
        assert!(disabled_tools.is_empty());
    }

    #[test]
    fn normalizes_mcp_tool_call_success_and_error_results() {
        let input = McpToolCallInput {
            runtime_name: "mcp__mcp_enabled__ping".to_string(),
            arguments: json!({ "name": "claw" }),
            tool_use_id: "toolu_1".to_string(),
        };

        let success = normalize_mcp_tool_call_result(
            &input,
            &json!({
                "content": [{ "type": "text", "text": "pong" }],
                "isError": false
            }),
        );
        assert_eq!(success.tool_use_id, "toolu_1");
        assert_eq!(success.content, "pong");
        assert!(!success.is_error);

        let structured = normalize_mcp_tool_call_result(
            &input,
            &json!({
                "structuredContent": { "ok": true, "count": 2 }
            }),
        );
        assert!(structured.content.contains("\"ok\": true"));
        assert!(!structured.is_error);

        let error = normalize_mcp_tool_call_result(
            &input,
            &json!({
                "content": [{ "type": "text", "text": "tool failed" }],
                "isError": true
            }),
        );
        assert!(error.is_error);
        assert_eq!(error.summary.as_deref(), Some("MCP tool returned error"));
    }

    #[tokio::test]
    async fn delete_mcp_server_removes_config_and_runtime_tools() {
        let pool = test_pool().await;
        let mut server = config_from_input(valid_input());
        server.id = "mcp_delete".to_string();
        server.tools = vec![sample_tool(&server, "read_file")];
        mark_ready(&mut server);
        upsert_mcp_server(&pool, &server).await.unwrap();
        runtime_state()
            .lock()
            .unwrap()
            .discovered_tools
            .insert(server.id.clone(), server.tools.clone());

        delete_mcp_server_from_pool(&pool, &server.id)
            .await
            .unwrap();

        assert!(get_mcp_server_from_pool(&pool, &server.id)
            .await
            .unwrap()
            .is_none());
        assert!(!runtime_state()
            .lock()
            .unwrap()
            .discovered_tools
            .contains_key(&server.id));
    }

    #[tokio::test]
    async fn set_mcp_server_enabled_preserves_config_and_filters_tools() {
        let pool = test_pool().await;
        let mut server = config_from_input(valid_input());
        server.id = "mcp_toggle".to_string();
        server.tools = vec![sample_tool(&server, "read_file")];
        mark_ready(&mut server);
        upsert_mcp_server(&pool, &server).await.unwrap();

        let disabled = set_mcp_server_enabled_in_pool(&pool, &server.id, false)
            .await
            .unwrap();
        assert!(!disabled.enabled);
        assert_eq!(disabled.env_keys, vec!["API_TOKEN"]);
        assert!(disabled.tools.iter().all(|tool| !tool.enabled));
        assert!(list_mcp_tools_from_pool(&pool, None)
            .await
            .unwrap()
            .is_empty());

        let enabled = set_mcp_server_enabled_in_pool(&pool, &server.id, true)
            .await
            .unwrap();
        assert!(enabled.enabled);
        assert!(enabled.tools.iter().all(|tool| tool.enabled));
        assert_eq!(
            list_mcp_tools_from_pool(&pool, None).await.unwrap().len(),
            1
        );
    }

    #[test]
    fn tool_call_timeout_result_has_structured_category() {
        let result = mcp_tool_call_error(
            "toolu_timeout",
            McpToolErrorCategory::Timeout,
            "MCP tool timed out",
            "MCP tool failed: invocation timed out",
        );

        assert!(result.is_error);
        assert_eq!(result.error_category, Some(McpToolErrorCategory::Timeout));
        assert_eq!(result.summary.as_deref(), Some("MCP tool timed out"));
    }

    #[test]
    fn tool_call_diagnostic_redacts_env_secret_values() {
        let env = HashMap::from([("API_TOKEN".to_string(), "very-secret-token".to_string())]);
        let content =
            redact_mcp_diagnostic("stderr: very-secret-token failed while invoking tool", &env);
        let result = mcp_tool_call_error(
            "toolu_secret",
            McpToolErrorCategory::InvocationFailed,
            "MCP tool invocation failed",
            content,
        );

        assert!(!result.content.contains("very-secret-token"));
        assert!(result.content.contains("[secret]"));
        assert_eq!(
            result.error_category,
            Some(McpToolErrorCategory::InvocationFailed)
        );
    }
}
