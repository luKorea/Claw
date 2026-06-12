import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/mcp', () => ({
  listMcpTools: vi.fn(),
}));

import { handleEngineEvent, resolveChatTools } from '@/hooks/useChat';
import { listMcpTools } from '@/lib/mcp';
import { useChatStore } from '@/stores/chat';
import type { McpTool } from '@/types/mcp';

const mockedListMcpTools = vi.mocked(listMcpTools);

describe('hooks/useChat handleEngineEvent', () => {
  beforeEach(() => {
    useChatStore.getState().clear();
    mockedListMcpTools.mockReset();
  });

  it('error 事件结束最近的 assistant streaming 并写入错误', async () => {
    useChatStore.getState().appendMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: [],
      streaming: true,
      createdAt: 1,
    });

    await handleEngineEvent(
      { type: 'error', message: '代理请求失败', recoverable: true },
      {
        onToolResult: vi.fn(),
        onPersist: vi.fn(),
      },
    );

    expect(useChatStore.getState().messages[0]?.streaming).toBe(false);
    expect(useChatStore.getState().error).toBe('代理请求失败');
  });

  it('resolveChatTools 合并启用的 MCP tools 并保留内置禁用项', async () => {
    const mcpTool: McpTool = {
      serverId: 'mcp_abc',
      serverName: 'Filesystem',
      originalName: 'read_file',
      runtimeName: 'mcp__mcp_abc__read_file',
      description: 'Read through MCP',
      inputSchema: { type: 'object' },
      enabled: true,
      discoveredAt: 1,
    };
    mockedListMcpTools.mockResolvedValueOnce([mcpTool]);

    const tools = await resolveChatTools(['write_file']);

    expect(mockedListMcpTools).toHaveBeenCalledWith();
    expect(tools.map((tool) => tool.name)).toEqual([
      'read_file',
      'list_dir',
      'mcp__mcp_abc__read_file',
    ]);
  });
});
