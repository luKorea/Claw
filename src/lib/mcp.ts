import { invoke } from '@tauri-apps/api/core';

import type {
  McpServer,
  McpServerInput,
  McpServerStatus,
  McpServerUpdateInput,
  McpTool,
  McpToolCallInput,
  McpToolCallResult,
} from '@/types/mcp';

/** 从本机 SQLite 配置读取所有 MCP Server。 */
export async function listMcpServers(): Promise<McpServer[]> {
  return invoke<McpServer[]>('list_mcp_servers');
}

/** 创建本地命令启动的 MCP Server 配置。 */
export async function createMcpServer(input: McpServerInput): Promise<McpServer> {
  return invoke<McpServer>('create_mcp_server', { input });
}

/** 更新 MCP Server 配置，更新后状态会回到未测试。 */
export async function updateMcpServer(
  input: McpServerUpdateInput,
): Promise<McpServer> {
  return invoke<McpServer>('update_mcp_server', { input });
}

/** 运行 MCP Server 连接测试并刷新工具发现状态。 */
export async function testMcpServer(id: string): Promise<McpServerStatus> {
  return invoke<McpServerStatus>('test_mcp_server', { id });
}

/** 读取当前可用于聊天的新 MCP tool 列表，默认只返回启用且已发现成功的工具。 */
export async function listMcpTools(serverId?: string): Promise<McpTool[]> {
  if (serverId) {
    return invoke<McpTool[]>('list_mcp_tools', { serverId });
  }
  return invoke<McpTool[]>('list_mcp_tools');
}

/** 调用一个 MCP runtime tool，并返回可直接放入聊天 tool_result 的标准结果。 */
export async function callMcpTool(
  input: McpToolCallInput,
): Promise<McpToolCallResult> {
  return invoke<McpToolCallResult>('call_mcp_tool', { input });
}

/** 删除一个 MCP Server 配置，并清理后端运行态缓存。 */
export async function deleteMcpServer(id: string): Promise<void> {
  await invoke('delete_mcp_server', { id });
}

/** 只切换 MCP Server 启用状态，不重写 command/env 配置。 */
export async function setMcpServerEnabled(
  id: string,
  enabled: boolean,
): Promise<McpServer> {
  return invoke<McpServer>('set_mcp_server_enabled', { id, enabled });
}

/** 重新连接 MCP Server 并刷新工具发现结果。 */
export async function refreshMcpServerTools(id: string): Promise<McpServerStatus> {
  return invoke<McpServerStatus>('refresh_mcp_server_tools', { id });
}
