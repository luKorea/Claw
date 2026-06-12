import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import {
  callMcpTool,
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  listMcpTools,
  refreshMcpServerTools,
  setMcpServerEnabled,
  testMcpServer,
  updateMcpServer,
} from '@/lib/mcp';
import type { McpServer, McpServerInput, McpServerStatus, McpTool } from '@/types/mcp';

const mockedInvoke = vi.mocked(invoke);

const input: McpServerInput = {
  name: 'Filesystem',
  transport: 'local-command',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem'],
  workingDirectory: undefined,
  env: { API_TOKEN: 'secret' },
  enabled: true,
};

const status: McpServerStatus = {
  serverId: 'mcp_abc',
  phase: 'ready',
  supportsTools: true,
  toolCount: 1,
  lastCheckedAt: 1,
};

const server: McpServer = {
  id: 'mcp_abc',
  ...input,
  envKeys: ['API_TOKEN'],
  status,
  tools: [],
  createdAt: 1,
  updatedAt: 1,
};

const tool: McpTool = {
  serverId: 'mcp_abc',
  serverName: 'Filesystem',
  originalName: 'read_file',
  runtimeName: 'mcp__mcp_abc__read_file',
  description: 'Read a file',
  inputSchema: { type: 'object' },
  enabled: true,
  discoveredAt: 1,
};

describe('lib/mcp', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('listMcpServers 调用 list_mcp_servers', async () => {
    mockedInvoke.mockResolvedValueOnce([server]);

    await expect(listMcpServers()).resolves.toEqual([server]);
    expect(mockedInvoke).toHaveBeenCalledWith('list_mcp_servers');
  });

  it('createMcpServer 透传 input', async () => {
    mockedInvoke.mockResolvedValueOnce(server);

    await expect(createMcpServer(input)).resolves.toEqual(server);
    expect(mockedInvoke).toHaveBeenCalledWith('create_mcp_server', { input });
  });

  it('updateMcpServer 透传完整 input', async () => {
    mockedInvoke.mockResolvedValueOnce({ ...server, name: 'Files' });
    const updateInput = { id: server.id, ...input, name: 'Files' };

    await expect(updateMcpServer(updateInput)).resolves.toMatchObject({
      name: 'Files',
    });
    expect(mockedInvoke).toHaveBeenCalledWith('update_mcp_server', {
      input: updateInput,
    });
  });

  it('testMcpServer 调用 test_mcp_server', async () => {
    mockedInvoke.mockResolvedValueOnce(status);

    await expect(testMcpServer(server.id)).resolves.toEqual(status);
    expect(mockedInvoke).toHaveBeenCalledWith('test_mcp_server', { id: server.id });
  });

  it('listMcpTools 默认读取全部已启用工具', async () => {
    mockedInvoke.mockResolvedValueOnce([tool]);

    await expect(listMcpTools()).resolves.toEqual([tool]);
    expect(mockedInvoke).toHaveBeenCalledWith('list_mcp_tools');
  });

  it('listMcpTools 可按 serverId 过滤', async () => {
    mockedInvoke.mockResolvedValueOnce([tool]);

    await expect(listMcpTools(server.id)).resolves.toEqual([tool]);
    expect(mockedInvoke).toHaveBeenCalledWith('list_mcp_tools', {
      serverId: server.id,
    });
  });

  it('callMcpTool 透传 runtimeName / arguments / toolUseId', async () => {
    mockedInvoke.mockResolvedValueOnce({
      toolUseId: 'toolu_1',
      content: 'ok',
      isError: false,
      summary: 'Returned text content',
    });

    await expect(
      callMcpTool({
        runtimeName: tool.runtimeName,
        arguments: { path: '/tmp/a' },
        toolUseId: 'toolu_1',
      }),
    ).resolves.toMatchObject({ content: 'ok', isError: false });
    expect(mockedInvoke).toHaveBeenCalledWith('call_mcp_tool', {
      input: {
        runtimeName: tool.runtimeName,
        arguments: { path: '/tmp/a' },
        toolUseId: 'toolu_1',
      },
    });
  });

  it('deleteMcpServer 调用 delete_mcp_server', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);

    await expect(deleteMcpServer(server.id)).resolves.toBeUndefined();
    expect(mockedInvoke).toHaveBeenCalledWith('delete_mcp_server', {
      id: server.id,
    });
  });

  it('setMcpServerEnabled 调用 set_mcp_server_enabled', async () => {
    mockedInvoke.mockResolvedValueOnce({ ...server, enabled: false });

    await expect(setMcpServerEnabled(server.id, false)).resolves.toMatchObject({
      enabled: false,
    });
    expect(mockedInvoke).toHaveBeenCalledWith('set_mcp_server_enabled', {
      id: server.id,
      enabled: false,
    });
  });

  it('refreshMcpServerTools 调用 refresh_mcp_server_tools', async () => {
    mockedInvoke.mockResolvedValueOnce(status);

    await expect(refreshMcpServerTools(server.id)).resolves.toEqual(status);
    expect(mockedInvoke).toHaveBeenCalledWith('refresh_mcp_server_tools', {
      id: server.id,
    });
  });
});
