import { invoke } from '@tauri-apps/api/core';

import { callMcpTool } from '@/lib/mcp';
import type { McpTool } from '@/types/mcp';
import type { ToolDefinition, ToolParameters } from '@/types/tool';

export interface ToolExecResult {
  ok: boolean;
  content: string;
}

export interface ToolExecOptions {
  toolUseId?: string;
}

export const MCP_TOOL_PREFIX = 'mcp__';

function sanitizeRuntimeNamePart(value: string): string {
  const next = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return next || 'tool';
}

/** 为 MCP 工具生成可暴露给模型的稳定 runtime name。 */
export function makeMcpRuntimeToolName(serverId: string, originalName: string): string {
  return `${MCP_TOOL_PREFIX}${sanitizeRuntimeNamePart(serverId)}__${sanitizeRuntimeNamePart(originalName)}`;
}

/** 判断工具名是否属于 MCP runtime name。 */
export function isMcpRuntimeToolName(name: string): boolean {
  return name.startsWith(MCP_TOOL_PREFIX);
}

/** 将后端发现的 MCP tool 映射为聊天可用的 provider-agnostic ToolDefinition。 */
export function mcpToolToDefinition(tool: McpTool): ToolDefinition {
  return {
    name: tool.runtimeName || makeMcpRuntimeToolName(tool.serverId, tool.originalName),
    description: `[MCP: ${tool.serverName}] ${tool.description || tool.originalName}`,
    parameters: normalizeToolParameters(tool.inputSchema),
    source: 'mcp',
    mcp_server_id: tool.serverId,
    mcp_original_name: tool.originalName,
    mcp_server_name: tool.serverName,
  };
}

/** 合并内置工具和 MCP 工具，内置工具优先保留同名定义。 */
export function mergeToolDefinitions(
  builtinTools: readonly ToolDefinition[],
  mcpTools: readonly McpTool[],
): ToolDefinition[] {
  const merged = [...builtinTools];
  const seen = new Set(merged.map((tool) => tool.name));
  for (const tool of mcpTools) {
    if (!tool.enabled) continue;
    const definition = mcpToolToDefinition(tool);
    if (seen.has(definition.name)) continue;
    merged.push(definition);
    seen.add(definition.name);
  }
  return merged;
}

function normalizeToolParameters(schema: Record<string, unknown>): ToolParameters {
  if (schema.type === 'object') {
    return schema as ToolParameters;
  }
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

/**
 * 执行一个内置工具调用。
 * 返回的 content 是 JSON 字符串或纯文本，将作为 tool_result 块回传模型。
 */
export async function executeBuiltinTool(
  name: string,
  input: unknown,
): Promise<ToolExecResult> {
  try {
    switch (name) {
      case 'read_file': {
        const args = input as { path: string; max_bytes?: number };
        const result = await invoke<{ path: string; content: string; size: number }>(
          'read_text_file',
          { path: args.path, maxBytes: args.max_bytes },
        );
        return {
          ok: true,
          content: JSON.stringify(
            { path: result.path, size: result.size, content: result.content },
            null,
            2,
          ),
        };
      }
      case 'list_dir': {
        const args = input as { path: string };
        const result = await invoke<{
          path: string;
          entries: { name: string; path: string; is_dir: boolean; size: number }[];
        }>('list_dir', { path: args.path });
        return { ok: true, content: JSON.stringify(result, null, 2) };
      }
      case 'write_file': {
        const args = input as { path: string; content: string };
        const result = await invoke<{ path: string; bytes_written: number }>(
          'write_text_file',
          { path: args.path, content: args.content },
        );
        return {
          ok: true,
          content: JSON.stringify(
            { path: result.path, bytes_written: result.bytes_written },
          ),
        };
      }
      default:
        return { ok: false, content: `未知工具: ${name}` };
    }
  } catch (err) {
    return {
      ok: false,
      content: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function normalizeMcpArguments(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

/**
 * 执行 provider tool call。
 * 内置工具保持原路径，MCP runtime tool 统一路由到 Rust MCP runtime。
 */
export async function executeTool(
  name: string,
  input: unknown,
  options: ToolExecOptions = {},
): Promise<ToolExecResult> {
  if (!isMcpRuntimeToolName(name)) {
    return executeBuiltinTool(name, input);
  }

  try {
    const result = await callMcpTool({
      runtimeName: name,
      arguments: normalizeMcpArguments(input),
      toolUseId: options.toolUseId ?? name,
    });
    return {
      ok: !result.isError,
      content: result.content,
    };
  } catch (err) {
    return {
      ok: false,
      content: `MCP 工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
