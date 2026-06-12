import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invoke } from '@tauri-apps/api/core';

import {
  executeTool,
  executeBuiltinTool,
  isMcpRuntimeToolName,
  makeMcpRuntimeToolName,
  mergeToolDefinitions,
  mcpToolToDefinition,
} from '@/lib/tools/executor';

const mockedInvoke = vi.mocked(invoke);

describe('lib/tools/executor', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  describe('read_file', () => {
    it('正确把 max_bytes → maxBytes 映射', async () => {
      mockedInvoke.mockResolvedValueOnce({ path: '/a', content: 'hi', size: 2 });
      const r = await executeBuiltinTool('read_file', { path: '/a', max_bytes: 1024 });
      expect(r.ok).toBe(true);
      // 关键回归保护:js 字段名 max_bytes,invoke 用 Rust serde rename 的 maxBytes
      expect(mockedInvoke).toHaveBeenCalledWith('read_text_file', {
        path: '/a',
        maxBytes: 1024,
      });
    });

    it('不带 max_bytes 也能调用', async () => {
      mockedInvoke.mockResolvedValueOnce({ path: '/a', content: 'hi', size: 2 });
      const r = await executeBuiltinTool('read_file', { path: '/a' });
      expect(r.ok).toBe(true);
      expect(mockedInvoke).toHaveBeenCalledWith('read_text_file', {
        path: '/a',
        maxBytes: undefined,
      });
    });

    it('返回的 content 是 JSON 字符串(含 size + content)', async () => {
      mockedInvoke.mockResolvedValueOnce({ path: '/a', content: 'hi', size: 2 });
      const r = await executeBuiltinTool('read_file', { path: '/a' });
      const parsed = JSON.parse(r.content);
      expect(parsed.path).toBe('/a');
      expect(parsed.size).toBe(2);
      expect(parsed.content).toBe('hi');
    });
  });

  describe('list_dir', () => {
    it('调用 list_dir 并 JSON.stringify', async () => {
      mockedInvoke.mockResolvedValueOnce({
        path: '/a',
        entries: [{ name: 'x', path: '/a/x', is_dir: false, size: 1 }],
      });
      const r = await executeBuiltinTool('list_dir', { path: '/a' });
      expect(r.ok).toBe(true);
      expect(mockedInvoke).toHaveBeenCalledWith('list_dir', { path: '/a' });
      expect(JSON.parse(r.content).entries[0].name).toBe('x');
    });
  });

  describe('write_file', () => {
    it('调用 write_text_file', async () => {
      mockedInvoke.mockResolvedValueOnce({ path: '/a', bytes_written: 5 });
      const r = await executeBuiltinTool('write_file', { path: '/a', content: 'hello' });
      expect(r.ok).toBe(true);
      expect(mockedInvoke).toHaveBeenCalledWith('write_text_file', {
        path: '/a',
        content: 'hello',
      });
      const parsed = JSON.parse(r.content);
      expect(parsed.path).toBe('/a');
      expect(parsed.bytes_written).toBe(5);
    });
  });

  describe('错误处理', () => {
    it('未知工具 → ok=false', async () => {
      const r = await executeBuiltinTool('unknown', {});
      expect(r.ok).toBe(false);
      expect(r.content).toMatch(/未知工具/);
    });

    it('invoke 抛错 → ok=false,content 含错误信息', async () => {
      mockedInvoke.mockRejectedValueOnce(new Error('path not allowed'));
      const r = await executeBuiltinTool('read_file', { path: '/etc/shadow' });
      expect(r.ok).toBe(false);
      expect(r.content).toContain('path not allowed');
    });

    it('invoke 抛非 Error → 字符串化', async () => {
      mockedInvoke.mockRejectedValueOnce('plain string error');
      const r = await executeBuiltinTool('read_file', { path: '/a' });
      expect(r.ok).toBe(false);
      expect(r.content).toContain('plain string error');
    });

    it('content 字段是 object 时被 JSON.stringify', async () => {
      // 模拟 list_dir 返回含复杂 entries
      mockedInvoke.mockResolvedValueOnce({
        path: '/d',
        entries: [
          { name: 'file1.txt', path: '/d/file1.txt', is_dir: false, size: 100 },
          { name: 'sub', path: '/d/sub', is_dir: true, size: 0 },
        ],
      });
      const r = await executeBuiltinTool('list_dir', { path: '/d' });
      const parsed = JSON.parse(r.content);
      expect(parsed.entries).toHaveLength(2);
      expect(parsed.entries[1].is_dir).toBe(true);
    });
  });

  describe('MCP 工具身份映射', () => {
    it('生成稳定且 provider-safe 的 runtime name', () => {
      expect(makeMcpRuntimeToolName('mcp_abc', 'read file')).toBe(
        'mcp__mcp_abc__read_file',
      );
      expect(isMcpRuntimeToolName('mcp__mcp_abc__read_file')).toBe(true);
      expect(isMcpRuntimeToolName('read_file')).toBe(false);
    });

    it('把 MCP tool 映射为 ToolDefinition 并保留归属信息', () => {
      const definition = mcpToolToDefinition({
        serverId: 'mcp_abc',
        serverName: 'Filesystem',
        originalName: 'read_file',
        runtimeName: 'mcp__mcp_abc__read_file',
        description: 'Read a file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        enabled: true,
        discoveredAt: 1,
      });

      expect(definition).toMatchObject({
        name: 'mcp__mcp_abc__read_file',
        description: '[MCP: Filesystem] Read a file',
        source: 'mcp',
        mcp_server_id: 'mcp_abc',
        mcp_original_name: 'read_file',
        mcp_server_name: 'Filesystem',
      });
      expect(definition.parameters.required).toEqual(['path']);
    });

    it('MCP schema 非 object 时降级为空对象参数', () => {
      const definition = mcpToolToDefinition({
        serverId: 'mcp_abc',
        serverName: 'Filesystem',
        originalName: 'ping',
        runtimeName: 'mcp__mcp_abc__ping',
        description: '',
        inputSchema: { type: 'string' },
        enabled: true,
        discoveredAt: 1,
      });

      expect(definition.parameters).toEqual({
        type: 'object',
        properties: {},
        required: [],
      });
    });

    it('合并内置工具和启用的 MCP tools,并跳过重复 runtime name', () => {
      const tools = mergeToolDefinitions(
        [
          {
            name: 'read_file',
            description: 'Read file',
            source: 'builtin',
            parameters: { type: 'object' },
          },
        ],
        [
          {
            serverId: 'mcp_abc',
            serverName: 'Filesystem',
            originalName: 'read_file',
            runtimeName: 'mcp__mcp_abc__read_file',
            description: 'Read through MCP',
            inputSchema: { type: 'object' },
            enabled: true,
            discoveredAt: 1,
          },
          {
            serverId: 'mcp_abc',
            serverName: 'Filesystem',
            originalName: 'disabled',
            runtimeName: 'mcp__mcp_abc__disabled',
            description: 'Disabled tool',
            inputSchema: { type: 'object' },
            enabled: false,
            discoveredAt: 1,
          },
          {
            serverId: 'mcp_abc',
            serverName: 'Filesystem',
            originalName: 'duplicate',
            runtimeName: 'read_file',
            description: 'Collision',
            inputSchema: { type: 'object' },
            enabled: true,
            discoveredAt: 1,
          },
        ],
      );

      expect(tools.map((tool) => tool.name)).toEqual([
        'read_file',
        'mcp__mcp_abc__read_file',
      ]);
      expect(tools[1]).toMatchObject({
        source: 'mcp',
        mcp_server_id: 'mcp_abc',
      });
    });

    it('executeTool 路由 MCP runtime name 到 call_mcp_tool', async () => {
      mockedInvoke.mockResolvedValueOnce({
        toolUseId: 'toolu_1',
        content: 'pong',
        isError: false,
        summary: 'Returned text content',
      });

      const result = await executeTool(
        'mcp__mcp_abc__ping',
        { message: 'hi' },
        { toolUseId: 'toolu_1' },
      );

      expect(result).toEqual({ ok: true, content: 'pong' });
      expect(mockedInvoke).toHaveBeenCalledWith('call_mcp_tool', {
        input: {
          runtimeName: 'mcp__mcp_abc__ping',
          arguments: { message: 'hi' },
          toolUseId: 'toolu_1',
        },
      });
    });

    it('executeTool 将 MCP isError 结果转换为 ok=false', async () => {
      mockedInvoke.mockResolvedValueOnce({
        toolUseId: 'toolu_1',
        content: 'MCP tool failed: server disabled',
        isError: true,
        summary: 'Server disabled',
        errorCategory: 'server_disabled',
      });

      const result = await executeTool(
        'mcp__mcp_abc__ping',
        { message: 'hi' },
        { toolUseId: 'toolu_1' },
      );

      expect(result).toEqual({
        ok: false,
        content: 'MCP tool failed: server disabled',
      });
    });

    it('executeTool 保留内置工具执行路径', async () => {
      mockedInvoke.mockResolvedValueOnce({ path: '/a', content: 'hi', size: 2 });

      const result = await executeTool('read_file', { path: '/a' });

      expect(result.ok).toBe(true);
      expect(mockedInvoke).toHaveBeenCalledWith('read_text_file', {
        path: '/a',
        maxBytes: undefined,
      });
    });
  });
});
