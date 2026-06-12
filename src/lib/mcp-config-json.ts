import type { McpServer, McpServerInput } from '@/types/mcp';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key.trim(), typeof item === 'string' ? item : String(item)] as const)
      .filter(([key]) => key.length > 0),
  );
}

function normalizeTransport(value: unknown): 'local-command' {
  const transport = optionalString(value);
  if (!transport || transport === 'local-command' || transport === 'stdio') {
    return 'local-command';
  }
  throw new Error(`当前仅支持本地命令 MCP Server，不支持 transport: ${transport}`);
}

function parseOneServer(name: string, value: unknown): McpServerInput {
  if (!isRecord(value)) {
    throw new Error(`MCP Server「${name}」配置必须是 JSON object`);
  }
  const command = optionalString(value.command);
  if (!command) {
    throw new Error(`MCP Server「${name}」缺少 command`);
  }
  const disabled = value.disabled === true;
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : !disabled;

  return {
    name: optionalString(value.name) ?? name,
    transport: normalizeTransport(value.transport),
    command,
    args: stringArray(value.args),
    workingDirectory: optionalString(value.workingDirectory) ?? optionalString(value.cwd),
    env: stringRecord(value.env),
    enabled,
  };
}

function parseServerEntries(root: unknown): [string, unknown][] {
  if (isRecord(root) && isRecord(root.mcpServers)) {
    return Object.entries(root.mcpServers);
  }
  if (isRecord(root) && Array.isArray(root.servers)) {
    return root.servers.map((server, index) => [`MCP Server ${index + 1}`, server]);
  }
  if (Array.isArray(root)) {
    return root.map((server, index) => [`MCP Server ${index + 1}`, server]);
  }
  if (isRecord(root) && root.command) {
    return [[optionalString(root.name) ?? 'MCP Server', root]];
  }
  throw new Error('请输入 mcpServers、servers 数组或单个 MCP Server JSON 配置');
}

/**
 * 解析通用 MCP JSON 配置。
 * 支持 Claude Desktop 风格 `{ "mcpServers": { ... } }`、servers 数组和单个 server object。
 */
export function parseMcpConfigJson(text: string): McpServerInput[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('请先粘贴 MCP JSON 配置');

  let root: unknown;
  try {
    root = JSON.parse(trimmed) as unknown;
  } catch (err) {
    throw new Error(`MCP JSON 解析失败：${err instanceof Error ? err.message : String(err)}`);
  }

  const servers = parseServerEntries(root).map(([name, value]) => parseOneServer(name, value));
  if (servers.length === 0) throw new Error('MCP JSON 中没有可导入的 server');
  return servers;
}

function uniqueKey(base: string, used: Set<string>): string {
  const fallback = base.trim() || 'MCP Server';
  let candidate = fallback;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${fallback}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/** 导出当前 MCP Server 为通用 JSON；env 只导出 key，值留空以避免泄露密钥。 */
export function stringifyMcpConfigJson(servers: readonly McpServer[]): string {
  const used = new Set<string>();
  const mcpServers: Record<string, JsonRecord> = {};

  for (const server of servers) {
    const item: JsonRecord = {
      command: server.command,
      args: server.args,
    };
    if (server.workingDirectory) item.workingDirectory = server.workingDirectory;
    if (server.envKeys.length > 0) {
      item.env = Object.fromEntries(server.envKeys.map((key) => [key, '']));
    }
    if (!server.enabled) item.disabled = true;
    mcpServers[uniqueKey(server.name, used)] = item;
  }

  return JSON.stringify({ mcpServers }, null, 2);
}
