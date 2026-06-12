import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/mcp', () => ({
  listMcpServers: vi.fn(),
  createMcpServer: vi.fn(),
  updateMcpServer: vi.fn(),
  testMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
  setMcpServerEnabled: vi.fn(),
  refreshMcpServerTools: vi.fn(),
}));

import {
  resetMcpServersStoreForTest,
  useMcpServersStore,
  validateMcpServerInput,
} from '@/stores/mcpServers';
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  refreshMcpServerTools,
  setMcpServerEnabled,
  testMcpServer,
  updateMcpServer,
} from '@/lib/mcp';
import type { McpServer, McpServerInput, McpServerStatus } from '@/types/mcp';

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
  phase: 'not_tested',
  supportsTools: false,
  toolCount: 0,
};

function makeServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: 'mcp_abc',
    ...input,
    envKeys: ['API_TOKEN'],
    status,
    tools: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const mockedListMcpServers = vi.mocked(listMcpServers);
const mockedCreateMcpServer = vi.mocked(createMcpServer);
const mockedUpdateMcpServer = vi.mocked(updateMcpServer);
const mockedTestMcpServer = vi.mocked(testMcpServer);
const mockedDeleteMcpServer = vi.mocked(deleteMcpServer);
const mockedSetMcpServerEnabled = vi.mocked(setMcpServerEnabled);
const mockedRefreshMcpServerTools = vi.mocked(refreshMcpServerTools);

describe('stores/mcpServers', () => {
  beforeEach(() => {
    resetMcpServersStoreForTest();
    mockedListMcpServers.mockReset();
    mockedCreateMcpServer.mockReset();
    mockedUpdateMcpServer.mockReset();
    mockedTestMcpServer.mockReset();
    mockedDeleteMcpServer.mockReset();
    mockedSetMcpServerEnabled.mockReset();
    mockedRefreshMcpServerTools.mockReset();
    mockedListMcpServers.mockResolvedValue([]);
    mockedCreateMcpServer.mockImplementation(async (value) =>
      makeServer({
        name: value.name.trim(),
        command: value.command.trim(),
        args: value.args.map((arg) => arg.trim()).filter(Boolean),
      }),
    );
    mockedUpdateMcpServer.mockImplementation(async (value) =>
      makeServer({
        id: value.id,
        name: value.name,
        command: value.command,
        enabled: value.enabled,
        updatedAt: 2,
      }),
    );
    mockedTestMcpServer.mockResolvedValue({
      serverId: 'mcp_abc',
      phase: 'ready',
      supportsTools: true,
      toolCount: 1,
      lastCheckedAt: 2,
    });
    mockedDeleteMcpServer.mockResolvedValue(undefined);
    mockedSetMcpServerEnabled.mockImplementation(async (id, enabled) =>
      makeServer({ id, enabled, updatedAt: 3 }),
    );
    mockedRefreshMcpServerTools.mockResolvedValue({
      serverId: 'mcp_abc',
      phase: 'ready',
      supportsTools: true,
      toolCount: 1,
      lastCheckedAt: 3,
    });
  });

  it('validateMcpServerInput 拒绝空名称和空命令', () => {
    expect(validateMcpServerInput({ ...input, name: '' })).toBe(
      'MCP Server 名称不能为空',
    );
    expect(validateMcpServerInput({ ...input, command: '' })).toBe(
      'MCP 启动命令不能为空',
    );
  });

  it('hydrate 从后端加载 MCP servers', async () => {
    mockedListMcpServers.mockResolvedValueOnce([makeServer()]);

    await useMcpServersStore.getState().hydrate();

    expect(useMcpServersStore.getState().servers).toHaveLength(1);
    expect(useMcpServersStore.getState().hydrated).toBe(true);
    expect(mockedListMcpServers).toHaveBeenCalledTimes(1);
  });

  it('createServer 标准化输入并写入 store', async () => {
    const server = await useMcpServersStore.getState().createServer({
      ...input,
      name: ' Filesystem ',
      command: ' npx ',
      args: [' -y ', '', 'server'],
    });

    expect(server.name).toBe('Filesystem');
    expect(mockedCreateMcpServer).toHaveBeenCalledWith({
      ...input,
      name: 'Filesystem',
      command: 'npx',
      args: ['-y', 'server'],
    });
    expect(useMcpServersStore.getState().servers).toHaveLength(1);
  });

  it('updateServer 替换已有配置并保留 id', async () => {
    useMcpServersStore.setState({ servers: [makeServer()], hydrated: true });

    await useMcpServersStore.getState().updateServer({
      id: 'mcp_abc',
      ...input,
      name: 'Files',
      enabled: false,
    });

    expect(mockedUpdateMcpServer).toHaveBeenCalledWith({
      id: 'mcp_abc',
      ...input,
      name: 'Files',
      enabled: false,
    });
    expect(useMcpServersStore.getState().servers[0]).toMatchObject({
      name: 'Files',
      enabled: false,
    });
  });

  it('testServer 刷新状态后重新拉取工具列表', async () => {
    useMcpServersStore.setState({ servers: [makeServer()], hydrated: true });
    const tested = makeServer({
      status: {
        serverId: 'mcp_abc',
        phase: 'ready',
        supportsTools: true,
        toolCount: 1,
        lastCheckedAt: 2,
      },
      tools: [
        {
          serverId: 'mcp_abc',
          serverName: 'Filesystem',
          originalName: 'read_file',
          runtimeName: 'mcp__mcp_abc__read_file',
          description: 'Read file',
          inputSchema: { type: 'object' },
          enabled: true,
          discoveredAt: 2,
        },
      ],
    });
    mockedListMcpServers.mockResolvedValueOnce([tested]);

    await useMcpServersStore.getState().testServer('mcp_abc');

    expect(mockedTestMcpServer).toHaveBeenCalledWith('mcp_abc');
    expect(useMcpServersStore.getState().servers[0]?.tools).toHaveLength(1);
    expect(useMcpServersStore.getState().testingIds).toEqual([]);
  });

  it('setServerEnabled 只切换 enabled 并替换 store 项', async () => {
    useMcpServersStore.setState({ servers: [makeServer()], hydrated: true });

    await useMcpServersStore.getState().setServerEnabled('mcp_abc', false);

    expect(mockedSetMcpServerEnabled).toHaveBeenCalledWith('mcp_abc', false);
    expect(useMcpServersStore.getState().servers[0]).toMatchObject({
      id: 'mcp_abc',
      enabled: false,
    });
  });

  it('deleteServer 删除后从 store 移除配置', async () => {
    useMcpServersStore.setState({ servers: [makeServer()], hydrated: true });

    await useMcpServersStore.getState().deleteServer('mcp_abc');

    expect(mockedDeleteMcpServer).toHaveBeenCalledWith('mcp_abc');
    expect(useMcpServersStore.getState().servers).toEqual([]);
  });

  it('refreshServer 刷新工具后重新拉取列表', async () => {
    useMcpServersStore.setState({ servers: [makeServer()], hydrated: true });
    const refreshed = makeServer({
      status: {
        serverId: 'mcp_abc',
        phase: 'ready',
        supportsTools: true,
        toolCount: 1,
        lastCheckedAt: 3,
      },
      tools: [
        {
          serverId: 'mcp_abc',
          serverName: 'Filesystem',
          originalName: 'read_file',
          runtimeName: 'mcp__mcp_abc__read_file',
          description: 'Read file',
          inputSchema: { type: 'object' },
          enabled: true,
          discoveredAt: 3,
        },
      ],
    });
    mockedListMcpServers.mockResolvedValueOnce([refreshed]);

    await useMcpServersStore.getState().refreshServer('mcp_abc');

    expect(mockedRefreshMcpServerTools).toHaveBeenCalledWith('mcp_abc');
    expect(useMcpServersStore.getState().servers[0]?.tools).toHaveLength(1);
  });
});
