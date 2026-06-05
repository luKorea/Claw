/**
 * MiniMax (minimaxi) Provider Adapter
 *
 * MiniMax 官方 Anthropic 兼容接口在浏览器侧没有可用 CORS 预检响应,
 * 因此只把 MiniMax 的网络请求桥接到 Rust `reqwest`,再通过 Tauri Channel
 * 把 Anthropic SSE 事件转回前端 AdapterEvent。
 */

import { Channel, invoke } from '@tauri-apps/api/core';

import {
  resolveAnthropicMaxTokens,
  toAnthropicMessages,
} from '@/lib/providers/anthropic';
import type {
  AdapterEvent,
  AdapterRequest,
  ProviderAdapter,
} from '@/lib/providers/types';
import type { ToolDefinition } from '@/types/tool';
import type { Usage } from '@/types/claude';

const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';

type MiniMaxChannelEvent =
  | { event: 'textDelta'; data: { text: string } }
  | { event: 'thinkingDelta'; data: { thinking: string } }
  | { event: 'toolUseStart'; data: { id: string; name: string } }
  | { event: 'toolUseDelta'; data: { id: string; inputDelta: string } }
  | { event: 'toolUseEnd'; data: { id: string; input: unknown } }
  | { event: 'usage'; data: { usage: Usage } }
  | { event: 'done'; data: { stopReason: string | null } }
  | { event: 'error'; data: { message: string } };

interface MiniMaxInvokeInput {
  requestId: string;
  apiKey: string;
  body: Record<string, unknown>;
}

function makeRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) {
    return cryptoApi.randomUUID();
  }
  return `minimax-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toMiniMaxTool(d: ToolDefinition): {
  name: string;
  description: string;
  input_schema: ToolDefinition['parameters'];
} {
  return {
    name: d.name,
    description: d.description,
    input_schema: d.parameters,
  };
}

export function buildMiniMaxRequestBody(req: AdapterRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: resolveAnthropicMaxTokens(req.thinking),
    stream: true,
    messages: toAnthropicMessages(req.messages),
  };
  if (req.system) body.system = req.system;
  if (req.thinking) {
    body.thinking = { type: 'enabled', budget_tokens: req.thinking.budget_tokens };
  }
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map(toMiniMaxTool);
  }
  return body;
}

function channelEventToAdapterEvent(message: MiniMaxChannelEvent): AdapterEvent | null {
  switch (message.event) {
    case 'textDelta':
      return { type: 'text_delta', text: message.data.text };
    case 'thinkingDelta':
      return { type: 'thinking_delta', thinking: message.data.thinking };
    case 'toolUseStart':
      return { type: 'tool_use_start', id: message.data.id, name: message.data.name };
    case 'toolUseDelta':
      return {
        type: 'tool_use_delta',
        id: message.data.id,
        input_delta: message.data.inputDelta,
      };
    case 'toolUseEnd':
      return { type: 'tool_use_end', id: message.data.id, input: message.data.input };
    case 'usage':
      return { type: 'usage', usage: message.data.usage };
    case 'done':
      return { type: 'done', stopReason: message.data.stopReason };
    case 'error':
      return { type: 'error', error: new Error(message.data.message) };
  }
}

function errorFromUnknown(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

async function cancelMiniMaxStream(requestId: string): Promise<void> {
  await invoke('cancel_minimax_stream', { requestId }).catch(() => undefined);
}

async function* streamViaTauri(
  input: MiniMaxInvokeInput,
  signal: AbortSignal,
): AsyncIterable<AdapterEvent> {
  const queue: MiniMaxChannelEvent[] = [];
  let done = false;
  let invokeError: unknown = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const onEvent = new Channel<MiniMaxChannelEvent>();
  onEvent.onmessage = (message) => {
    queue.push(message);
    if (message.event === 'done' || message.event === 'error') {
      done = true;
    }
    notify();
  };

  const abort = () => {
    done = true;
    void cancelMiniMaxStream(input.requestId);
    notify();
  };
  signal.addEventListener('abort', abort, { once: true });

  const invokePromise = invoke<void>('stream_minimax_anthropic', {
    input,
    onEvent,
  }).catch((err: unknown) => {
    invokeError = err;
    done = true;
    notify();
  });

  try {
    while (!done || queue.length > 0) {
      if (signal.aborted && queue.length === 0) break;
      const message = queue.shift();
      if (!message) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      const event = channelEventToAdapterEvent(message);
      if (event) yield event;
    }

    await invokePromise;
    if (invokeError && !signal.aborted) {
      yield { type: 'error', error: errorFromUnknown(invokeError) };
    }
  } finally {
    signal.removeEventListener('abort', abort);
    if (!done && !signal.aborted) {
      void cancelMiniMaxStream(input.requestId);
    }
  }
}

class MiniMaxIAdapter implements ProviderAdapter {
  readonly id = 'minimaxi' as const;
  readonly baseUrl = MINIMAX_BASE_URL;
  readonly capabilities = { thinking: true, tools: true, system: true };

  validateKey(key: string): { ok: true } | { ok: false; reason: string } {
    if (!key) return { ok: false, reason: 'API Key 不能为空' };
    if (!key.startsWith('sk-')) {
      return { ok: false, reason: 'MiniMax API Key 应该以 sk- 开头' };
    }
    return { ok: true };
  }

  previewKey(key: string): string {
    if (key.length < 4) return 'sk-…';
    return `sk-…${key.slice(-4)}`;
  }

  stream(req: AdapterRequest, apiKey: string, signal: AbortSignal): AsyncIterable<AdapterEvent> {
    if (!apiKey) throw new Error('缺少 MiniMax API Key');
    return streamViaTauri(
      {
        requestId: makeRequestId(),
        apiKey,
        body: buildMiniMaxRequestBody(req),
      },
      signal,
    );
  }
}

export const minimaxiAdapter: ProviderAdapter = new MiniMaxIAdapter();
