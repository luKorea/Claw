-- 会话
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  thinking_enabled INTEGER NOT NULL DEFAULT 0,
  thinking_budget INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations(updated_at DESC);

-- 消息
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking TEXT,
  tool_calls TEXT,
  tool_results TEXT,
  model TEXT,
  usage TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at ASC);

-- 系统提示词预设
CREATE TABLE IF NOT EXISTS prompt_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- MCP 服务器
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- API Key 状态元数据
-- 只保存是否已配置和脱敏预览,不保存明文 Key。
CREATE TABLE IF NOT EXISTS api_key_metadata (
  provider TEXT PRIMARY KEY,
  configured INTEGER NOT NULL DEFAULT 0,
  preview TEXT,
  metadata_known INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- API Key 本机配置
-- 按用户选择,本版本以 SQLite 配置文件为主源,避免运行时反复读取系统 Keychain。
-- api_key 仅存本机 app_data_dir/claw.db,不得写入前端 localStorage / 日志 / 文档。
CREATE TABLE IF NOT EXISTS api_keys (
  provider TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  storage TEXT NOT NULL DEFAULT 'plain',
  preview TEXT,
  updated_at INTEGER NOT NULL
);

-- 自定义 Provider 配置
CREATE TABLE IF NOT EXISTS custom_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model_ids TEXT NOT NULL,
  selected_model_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  supports_thinking INTEGER NOT NULL DEFAULT 0,
  supports_tools INTEGER NOT NULL DEFAULT 0,
  stream_mode TEXT NOT NULL DEFAULT 'auto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
