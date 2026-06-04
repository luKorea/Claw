/**
 * Provider Adapter 抽象 (v1.1+)
 *
 * 所有 provider 通过统一接口 `ProviderAdapter.stream()` 暴露流式事件。
 * useChat 不感知 SDK / SSE 协议差异,只处理归一化的 `AdapterEvent`。
 */

import type { ProviderId } from '@/types/providers';
import type { ToolDefinition } from '@/types/tool';
import type { ContentBlock, Usage } from '@/types/claude';

/** Adapter 内部的归一化消息。adapter 负责转各 provider 协议。 */
export interface AdapterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 纯文本或 ContentBlock[];tool 角色时通常为 string */
  content: string | ContentBlock[];
  /** 工具结果 ID,仅 role === 'tool' 时存在 */
  tool_call_id?: string;
  /** 助手发起的工具调用(OAI 风格,Anthropic adapter 内部转 tool_use) */
  tool_calls?: Array<{
    id: string;
    name: string;
    /** 已解析为对象的参数(OAI 协议在 wire 上是 JSON 字符串,adapter 内部解析) */
    arguments: unknown;
  }>;
}

export interface AdapterRequest {
  model: string;
  system?: string;
  messages: AdapterMessage[];
  tools?: ToolDefinition[];
  /** Anthropic thinking / DeepSeek reasoning / OpenAI o1 reasoning 预算 */
  thinking?: { budget_tokens: number } | null;
  max_tokens: number;
}

/**
 * 归一化的流式事件。所有 provider 都映射到这 8 种事件。
 * - text_delta: 普通文本
 * - thinking_delta: 扩展思考 / reasoning
 * - tool_use_start / delta / end: 工具调用三段式
 * - usage: token 统计
 * - done: 流结束
 * - error: 错误
 */
export type AdapterEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; id: string; input_delta: string }
  | { type: 'tool_use_end'; id: string; input: unknown }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; stopReason: string | null }
  | { type: 'error'; error: Error };

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly baseUrl: string;
  readonly capabilities: { thinking: boolean; tools: boolean; system: boolean };
  /** 校验 key 合法性(返回 ok 或具体 reason) */
  validateKey(key: string): { ok: true } | { ok: false; reason: string };
  /** 脱敏预览(显示前缀 + 后 4 位) */
  previewKey(key: string): string;
  /**
   * 发起流式请求。
   * - 抛错:仅当入参校验或 fetch init 失败等同步错误
   * - 流式过程中产生的错误通过 `{ type: 'error', error }` 事件返回
   * - 必须支持 AbortSignal 取消
   */
  stream(req: AdapterRequest, apiKey: string, signal: AbortSignal): AsyncIterable<AdapterEvent>;
}
