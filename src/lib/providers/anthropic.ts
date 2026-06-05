/**
 * Anthropic Provider Adapter (v1.1+)
 *
 * 基于 @anthropic-ai/sdk,把 SDK 事件流转换为归一化 AdapterEvent。
 * thinking 通过 `thinking: { type: 'enabled', budget_tokens }` 开启,流式回 thinking_delta。
 */

import Anthropic from '@anthropic-ai/sdk';

import type {
  AdapterEvent,
  AdapterRequest,
  ProviderAdapter,
} from '@/lib/providers/types';
import type { ToolDefinition } from '@/types/tool';
import type { Usage } from '@/types/claude';
import type { ProviderId } from '@/types/providers';

/** Anthropic 强制 max_tokens > budget_tokens */
export function resolveAnthropicMaxTokens(thinking?: { budget_tokens: number } | null): number {
  if (!thinking) return 8192;
  return Math.max(thinking.budget_tokens * 2, 4096);
}

function toAdapterTool(d: ToolDefinition): Anthropic.Tool {
  return {
    name: d.name,
    description: d.description,
    input_schema: d.parameters as Anthropic.Tool.InputSchema,
  };
}

/**
 * 把 AdapterMessage[] 转为 Anthropic MessageParam[]。
 * - role=tool 合并到前一条 user 的 tool_result blocks(Anthropic 要求 tool_result 出现在 user turn)
 * - assistant + tool_calls 转为 tool_use blocks
 */
export function toAnthropicMessages(msgs: AdapterRequest['messages']): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of msgs) {
    if (m.role === 'system') continue;

    if (m.role === 'tool' && m.tool_call_id) {
      const toolResult: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        is_error: m.is_error ?? false,
      };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        (last.content as Anthropic.ContentBlockParam[]).push(toolResult);
      } else {
        out.push({ role: 'user', content: [toolResult] });
      }
      continue;
    }

    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      const text = typeof m.content === 'string' ? m.content : '';
      if (text) blocks.push({ type: 'text', text });
      for (const tc of m.tool_calls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments as Anthropic.ToolUseBlockParam['input'],
        });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }

    out.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : '',
    });
  }
  return out;
}

export interface AnthropicAdapterOptions {
  /**
   * 覆盖 SDK baseURL。
   * - Anthropic 官方:`https://api.anthropic.com`(SDK 默认)
   * - MiniMax Anthropic 兼容:`https://api.minimax.io/anthropic`(端点 `/anthropic/v1/messages`)
   *
   * SDK 会自动在 baseURL 后拼 `/v1/messages`,所以要包含 path 前缀。
   */
  baseURL?: string;
  /** 覆盖 validateKey 逻辑(默认:非空 + `sk-` 开头) */
  validateKey?: (key: string) => { ok: true } | { ok: false; reason: string };
  /** previewKey 前缀(默认 `sk`) */
  keyPrefix?: string;
  /** provider 标识,错误信息用(默认 `Anthropic`) */
  providerLabel?: string;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly id: ProviderId;
  readonly baseUrl: string;
  readonly capabilities = { thinking: true, tools: true, system: true };
  private readonly opts: AnthropicAdapterOptions;

  constructor(id: ProviderId = 'anthropic', opts: AnthropicAdapterOptions = {}) {
    this.id = id;
    this.opts = opts;
    this.baseUrl = opts.baseURL ?? 'https://api.anthropic.com';
  }

  validateKey(key: string): { ok: true } | { ok: false; reason: string } {
    if (this.opts.validateKey) return this.opts.validateKey(key);
    if (!key) return { ok: false, reason: 'API Key 不能为空' };
    if (!key.startsWith('sk-')) return { ok: false, reason: 'API Key 必须以 sk- 开头' };
    return { ok: true };
  }

  previewKey(key: string): string {
    // 默认前缀 `sk-`(Anthropic 风格),子类可覆盖。
    const prefix = this.opts.keyPrefix ?? 'sk-';
    if (key.length < 4) return `${prefix}…`;
    return `${prefix}…${key.slice(-4)}`;
  }

  stream(req: AdapterRequest, apiKey: string, signal: AbortSignal): AsyncIterable<AdapterEvent> {
    if (!apiKey) throw new Error(`缺少 ${this.opts.providerLabel ?? 'Anthropic'} API Key`);
    const client = new Anthropic({
      apiKey,
      baseURL: this.opts.baseURL,
      dangerouslyAllowBrowser: true,
    });

    const params: Anthropic.MessageStreamParams = {
      model: req.model,
      max_tokens: resolveAnthropicMaxTokens(req.thinking),
      messages: toAnthropicMessages(req.messages),
    };
    if (req.system) params.system = req.system;
    if (req.thinking) {
      params.thinking = { type: 'enabled', budget_tokens: req.thinking.budget_tokens };
    }
    if (req.tools && req.tools.length > 0) {
      params.tools = req.tools.map(toAdapterTool);
    }
    // SDK 类型未声明 signal,底层 fetch 透传
    (params as unknown as { signal: AbortSignal }).signal = signal;

    const sdkStream = client.messages.stream(params);
    return this.fromSdkStream(sdkStream);
  }

  private async *fromSdkStream(
    sdkStream: AsyncIterable<Anthropic.MessageStreamEvent>,
  ): AsyncIterable<AdapterEvent> {
    const state: SdkAccumulatorState = {
      indexToToolId: new Map<number, string>(),
      toolInputAcc: new Map<string, string>(),
    };

    try {
      for await (const event of sdkStream) {
        for (const ev of accumulateSdkEvent(state, event)) {
          yield ev;
        }
      }
    } catch (err) {
      // v1.3 修复:Anthropic SDK 抛 APIConnectionError 时 message 永远 "Connection error.",
      // 真实原因在 `cause`(fetch init 失败的 Error,例如 net::ERR_BLOCKED_BY_CLIENT /
      // TypeError: Failed to fetch / DNS 解析失败等)。把 cause 拼到 message,
      // 用户在 UI 看到的 "Connection error" 才有诊断价值。
      if (err instanceof Anthropic.APIConnectionError) {
        const cause = (err as { cause?: unknown }).cause;
        const causeMsg =
          cause instanceof Error
            ? cause.message
            : typeof cause === 'string'
              ? cause
              : cause
                ? String(cause)
                : '未知网络错误';
        const enriched = new Error(
          `${err.message} (${this.opts.providerLabel ?? 'Anthropic'} → ${causeMsg})`,
        );
        yield { type: 'error', error: enriched };
        return;
      }
      throw err;
    }
  }
}

/**
 * 维护 SDK event 流内部状态:
 * - `indexToToolId` 把 content_block index 映射到 tool_use_id(SDK 用 index,我们对外用 id)
 * - `toolInputAcc` 累积每个 tool_use 的 partial_json 字符串,直到 content_block_stop 一次性 JSON.parse
 */
export interface SdkAccumulatorState {
  indexToToolId: Map<number, string>;
  toolInputAcc: Map<string, string>;
}

/**
 * 消费单个 SDK MessageStreamEvent,返回对应的归一化 AdapterEvent 序列。
 * 纯函数 + 修改 state(因为要累积 tool_use input),可单测。
 */
export function accumulateSdkEvent(
  state: SdkAccumulatorState,
  event: Anthropic.MessageStreamEvent,
): AdapterEvent[] {
  switch (event.type) {
    case 'message_start': {
      const u = event.message.usage;
      const usage: Usage = {
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        cache_read_input_tokens: u.cache_read_input_tokens ?? undefined,
        cache_creation_input_tokens: u.cache_creation_input_tokens ?? undefined,
      };
      return [{ type: 'usage', usage }];
    }
    case 'content_block_start': {
      const block = event.content_block;
      const idx = event.index;
      if (block.type === 'text') {
        if (block.text) return [{ type: 'text_delta', text: block.text }];
      } else if (block.type === 'thinking') {
        if (block.thinking) return [{ type: 'thinking_delta', thinking: block.thinking }];
      } else if (block.type === 'tool_use') {
        state.indexToToolId.set(idx, block.id);
        state.toolInputAcc.set(block.id, '');
        return [{ type: 'tool_use_start', id: block.id, name: block.name }];
      }
      return [];
    }
    case 'content_block_delta': {
      const delta = event.delta;
      if (delta.type === 'text_delta') {
        return [{ type: 'text_delta', text: delta.text }];
      } else if (delta.type === 'thinking_delta') {
        return [{ type: 'thinking_delta', thinking: delta.thinking }];
      } else if (delta.type === 'input_json_delta') {
        const id = state.indexToToolId.get(event.index);
        if (id) {
          const acc = (state.toolInputAcc.get(id) ?? '') + delta.partial_json;
          state.toolInputAcc.set(id, acc);
          return [{ type: 'tool_use_delta', id, input_delta: delta.partial_json }];
        }
      }
      return [];
    }
    case 'content_block_stop': {
      const id = state.indexToToolId.get(event.index);
      if (id) {
        const raw = state.toolInputAcc.get(id) ?? '';
        let parsed: unknown = {};
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { __raw: raw };
          }
        }
        state.toolInputAcc.delete(id);
        state.indexToToolId.delete(event.index);
        return [{ type: 'tool_use_end', id, input: parsed }];
      }
      return [];
    }
    case 'message_delta': {
      const out: AdapterEvent[] = [];
      if (event.usage) {
        out.push({
          type: 'usage',
          usage: {
            input_tokens: 0, // message_delta 不再带 input 增量
            output_tokens: event.usage.output_tokens ?? 0,
          },
        });
      }
      if (event.delta.stop_reason) {
        out.push({ type: 'done', stopReason: event.delta.stop_reason });
      }
      return out;
    }
    case 'message_stop':
      return [];
    default:
      return [];
  }
}

export const anthropicAdapter: ProviderAdapter = new AnthropicAdapter();
