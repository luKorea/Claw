/**
 * 工具定义 (provider-agnostic, v1.1+)
 *
 * 内部统一用 OpenAI 风格的 `parameters` (JSON Schema 形态)。
 * Anthropic adapter 在转 SDK 时把 `parameters` → `input_schema`。
 *
 * 参考: https://platform.openai.com/docs/guides/function-calling
 */

export interface ToolParameters {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema 描述工具参数 */
  parameters: ToolParameters;
  /** 工具来源: 内置 / MCP (MCP 在 v1.1 暂未启用) */
  source: 'builtin' | 'mcp';
  /** MCP server id(仅 source === 'mcp' 时存在) */
  mcp_server_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
