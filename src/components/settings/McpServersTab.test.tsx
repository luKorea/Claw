import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import { McpServersTab } from '@/components/settings/McpServersTab';
import { resetMcpServersStoreForTest } from '@/stores/mcpServers';
import type { McpServer, McpServerInput, McpServerStatus } from '@/types/mcp';

const mockedInvoke = vi.mocked(invoke);

const baseStatus: McpServerStatus = {
  serverId: 'mcp_created',
  phase: 'not_tested',
  supportsTools: false,
  toolCount: 0,
};

function makeServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: 'mcp_created',
    name: 'Filesystem',
    transport: 'local-command',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    workingDirectory: undefined,
    envKeys: ['API_TOKEN'],
    enabled: true,
    status: baseStatus,
    tools: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeServerFromInput(input: McpServerInput, id = `mcp_${input.name}`): McpServer {
  return makeServer({
    id,
    name: input.name,
    command: input.command,
    args: input.args,
    workingDirectory: input.workingDirectory,
    envKeys: Object.keys(input.env),
    enabled: input.enabled,
  });
}

async function handleDefaultInvoke(command: string, args?: unknown) {
  if (command === 'list_mcp_servers') {
    return [];
  }
  if (command === 'create_mcp_server') {
    const input = (args as { input: McpServerInput }).input;
    return makeServerFromInput(input);
  }
  if (command === 'update_mcp_server') {
    const input = (args as { input: McpServerInput & { id: string } }).input;
    return makeServerFromInput(input, input.id);
  }
  if (command === 'test_mcp_server') {
    return {
      serverId: 'mcp_created',
      phase: 'ready',
      supportsTools: true,
      toolCount: 1,
      lastCheckedAt: 2,
    };
  }
  if (command === 'set_mcp_server_enabled') {
    const input = args as { id: string; enabled: boolean };
    return makeServer({ id: input.id, enabled: input.enabled, updatedAt: 3 });
  }
  if (command === 'refresh_mcp_server_tools') {
    return {
      serverId: 'mcp_created',
      phase: 'ready',
      supportsTools: true,
      toolCount: 1,
      lastCheckedAt: 3,
    };
  }
  if (command === 'delete_mcp_server') {
    return undefined;
  }
  return undefined;
}

describe('McpServersTab', () => {
  beforeEach(() => {
    resetMcpServersStoreForTest();
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation(handleDefaultInvoke);
  });

  it('展示 MCP Server 列表和 New MCP Server 行', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'list_mcp_servers') {
        return [makeServer()];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<McpServersTab />);

    expect(await screen.findByText('Installed MCP Servers')).toBeInTheDocument();
    expect(await screen.findByText('Filesystem')).toBeInTheDocument();
    expect(screen.getByText('Not tested')).toBeInTheDocument();
    expect(screen.getByText('New MCP Server')).toBeInTheDocument();
    expect(screen.getByText('Add a Custom MCP Server')).toBeInTheDocument();
  });

  it('点击 New MCP Server 打开包含已有 MCP 的完整 JSON 弹窗', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'list_mcp_servers') {
        return [makeServer()];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<McpServersTab />);

    fireEvent.click(await screen.findByText('New MCP Server'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('New MCP Server')).toBeInTheDocument();
    const textarea = within(dialog).getByLabelText('MCP JSON') as HTMLTextAreaElement;
    expect(JSON.parse(textarea.value)).toEqual({
      mcpServers: {
        Filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
          env: { API_TOKEN: '' },
        },
      },
    });
  });

  it('保存新增 JSON 时只创建新 server，不删除已有 server', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'list_mcp_servers') {
        return [makeServer()];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<McpServersTab />);

    fireEvent.click(await screen.findByText('New MCP Server'));
    const dialog = screen.getByRole('dialog');
    const textarea = within(dialog).getByLabelText('MCP JSON');
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          mcpServers: {
            GitHub: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-github'],
              env: { GITHUB_TOKEN: 'secret' },
            },
          },
        }),
      },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存 JSON' }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('create_mcp_server', {
        input: {
          name: 'GitHub',
          transport: 'local-command',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          workingDirectory: undefined,
          env: { GITHUB_TOKEN: 'secret' },
          enabled: true,
        },
      });
    });
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      'delete_mcp_server',
      expect.anything(),
    );
  });

  it('编辑已有 server 时通过 JSON 更新配置', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'list_mcp_servers') {
        return [
          makeServer(),
          makeServer({
            id: 'mcp_github',
            name: 'GitHub',
            command: 'node',
            args: ['github-mcp.js'],
            envKeys: ['GITHUB_TOKEN'],
          }),
        ];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<McpServersTab />);

    fireEvent.click(await screen.findByLabelText('编辑 Filesystem'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('编辑 MCP Server「Filesystem」')).toBeInTheDocument();
    const textarea = within(dialog).getByLabelText('MCP JSON') as HTMLTextAreaElement;
    expect(JSON.parse(textarea.value).mcpServers.GitHub).toEqual({
      command: 'node',
      args: ['github-mcp.js'],
      env: { GITHUB_TOKEN: '' },
    });
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          mcpServers: {
            Filesystem: {
              command: 'uvx',
              args: ['mcp-server-filesystem'],
              env: { API_TOKEN: '' },
              disabled: true,
            },
          },
        }),
      },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存 JSON' }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('update_mcp_server', {
        input: {
          id: 'mcp_created',
          name: 'Filesystem',
          transport: 'local-command',
          command: 'uvx',
          args: ['mcp-server-filesystem'],
          workingDirectory: undefined,
          env: { API_TOKEN: '' },
          enabled: false,
        },
      });
    });
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      'create_mcp_server',
      expect.anything(),
    );
  });

  it('失败 server 可展开错误输出', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'list_mcp_servers') {
        return [
          makeServer({
            status: {
              serverId: 'mcp_created',
              phase: 'failed',
              supportsTools: false,
              toolCount: 0,
              lastCheckedAt: 4,
              errorCategory: 'startup_failed',
              errorMessage: 'stderr: [secret] could not start',
            },
          }),
        ];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<McpServersTab />);

    fireEvent.click(await screen.findByText('Error - Show Output'));

    expect(screen.getByText('stderr: [secret] could not start')).toBeInTheDocument();
  });

  it('列表中可以启用或禁用 MCP Server', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'list_mcp_servers') {
        return [makeServer()];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<McpServersTab />);

    fireEvent.click(await screen.findByLabelText('启用 Filesystem'));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('set_mcp_server_enabled', {
        id: 'mcp_created',
        enabled: false,
      });
    });
  });

  it('测试和刷新 MCP Server', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'list_mcp_servers') {
        return [makeServer()];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<McpServersTab />);

    fireEvent.click(await screen.findByLabelText('测试 Filesystem'));
    fireEvent.click(await screen.findByLabelText('刷新 Filesystem'));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('test_mcp_server', {
        id: 'mcp_created',
      });
      expect(mockedInvoke).toHaveBeenCalledWith('refresh_mcp_server_tools', {
        id: 'mcp_created',
      });
    });
  });

  it('确认后删除 MCP Server', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'list_mcp_servers') {
        const deleted = mockedInvoke.mock.calls.some(
          ([name]) => name === 'delete_mcp_server',
        );
        return deleted ? [] : [makeServer()];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<McpServersTab />);

    fireEvent.click(await screen.findByLabelText('删除 Filesystem'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('delete_mcp_server', {
        id: 'mcp_created',
      });
    });
  });

  it('非法 JSON 留在弹窗中并展示错误', async () => {
    render(<McpServersTab />);

    fireEvent.click(await screen.findByText('New MCP Server'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('MCP JSON'), {
      target: { value: '{bad json' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存 JSON' }));

    expect(await within(dialog).findByText(/MCP JSON 解析失败/)).toBeInTheDocument();
  });
});
