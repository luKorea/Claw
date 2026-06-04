/**
 * Claude 专有类型 + 通用消息 / Usage 归一化定义 (v1.1+)
 *
 * 迁移到多 Provider 后:
 * - `ClaudeModelId` / `CLAUDE_MODELS` / `ClaudeModelInfo` 保留为 Anthropic 内部 alias,
 *   新代码请用 `@/types/providers` 里的 `ModelInfo` / `getModelInfo()` / `getProviderOfModel()`
 * - `ContentBlock` / `ChatMessage` 仍是 provider-agnostic 形态
 * - `Usage` 扩字段,兼容 OpenAI 风格
 */

import { ALL_MODELS, DEFAULT_MODEL_ID, getModelInfo, type ModelInfo } from './providers';

/** @deprecated 请用 `ModelInfo` 替代。仅在 Anthropic 内部代码使用。 */
export const CLAUDE_MODELS = ALL_MODELS.filter((m) => m.provider === 'anthropic');

/** @deprecated 请用 `getProviderOfModel()` 或 `getModelInfo()` 替代。 */
export type ClaudeModelId = string;

/** @deprecated 请用 `ModelInfo` 替代。 */
export interface ClaudeModelInfo {
  id: ClaudeModelId;
  label: string;
  family: 'opus' | 'sonnet' | 'haiku';
  supportsThinking: boolean;
}

/** @deprecated 请用 `DEFAULT_MODEL_ID` 替代。 */
export const DEFAULT_MODEL: ClaudeModelId = DEFAULT_MODEL_ID;

/** 扩展思考(Anthropic 特有) */
export interface ThinkingConfig {
  type: 'enabled';
  budget_tokens: number;
}

export const DEFAULT_THINKING_BUDGET = 10_000;
export const MAX_THINKING_BUDGET = 64_000;

/** 消息块(provider-agnostic) */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/** 消息角色 */
export type MessageRole = 'user' | 'assistant';

/** 前端会话消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: ContentBlock[];
  model?: string;
  /** 流式追加时使用的临时字段 */
  streaming?: boolean;
  createdAt: number;
}

/**
 * Token usage (跨 provider 归一化)
 * - `input_tokens` / `output_tokens` 在所有 provider 都存在 (Anthropic 命名,语义上 input=prompt, output=completion)
 * - `output_tokens` 在 Anthropic / DeepSeek 包含 reasoning;OpenAI 拆出 `reasoning_tokens`
 * - `raw` 透传 provider 原始字段,供后续调试 / 高级 UI 使用
 */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens?: number;
  /** Anthropic 专有 */
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  /** 透传 provider 原始 usage 字段 */
  raw?: Record<string, unknown>;
}

/**
 * 兼容老代码: `CLAUDE_MODELS.some(m => m.id === ...)` 形态
 * 内部直接复用 ALL_MODELS
 */
export function findClaudeModel(id: string): ModelInfo | null {
  return getModelInfo(id);
}
