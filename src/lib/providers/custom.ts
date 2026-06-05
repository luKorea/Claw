import { Channel, invoke } from '@tauri-apps/api/core';

import {
  resolveAnthropicMaxTokens,
  toAnthropicMessages,
} from '@/lib/providers/anthropic';
import { toOAIMessages } from '@/lib/providers/openai-compatible';
import type {
  AdapterEvent,
  AdapterRequest,
  ProviderAdapter,
} from '@/lib/providers/types';
import type {
  CustomProvider,
  CustomProviderProtocol,
} from '@/stores/customProviders';
import type { ToolDefinition } from '@/types/tool';
import type { Usage } from '@/types/claude';

type CustomProviderChannelEvent =
  | { event: 'textDelta'; data: { text: string } }
  | { event: 'thinkingDelta'; data: { thinking: string } }
  | { event: 'toolUseStart'; data: { id: string; name: string } }
  | { event: 'toolUseDelta'; data: { id: string; inputDelta: string } }
  | { event: 'toolUseEnd'; data: { id: string; input: unknown } }
  | { event: 'usage'; data: { usage: Usage } }
  | { event: 'done'; data: { stopReason: string | null } }
  | { event: 'error'; data: { message: string } };

interface CustomProviderInvokeInput {
  requestId: string;
  protocol: CustomProviderProtocol;
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
}

function makeRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) return cryptoApi.randomUUID();
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toAnthropicTool(d: ToolDefinition): {
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

function toOpenAITool(d: ToolDefinition): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolDefinition['parameters'];
  };
} {
  return {
    type: 'function',
    function: {
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    },
  };
}

export function buildCustomProviderRequestBody(
  provider: CustomProvider,
  req: AdapterRequest,
): Record<string, unknown> {
  if (provider.protocol === 'anthropic-compatible') {
    const body: Record<string, unknown> = {
      model: provider.modelId,
      max_tokens: resolveAnthropicMaxTokens(req.thinking),
      stream: true,
      messages: toAnthropicMessages(req.messages),
    };
    if (req.system) body.system = req.system;
    if (req.thinking && provider.supportsThinking) {
      body.thinking = { type: 'enabled', budget_tokens: req.thinking.budget_tokens };
    }
    if (req.tools && req.tools.length > 0 && provider.supportsTools) {
      body.tools = req.tools.map(toAnthropicTool);
    }
    return body;
  }

  const body: Record<string, unknown> = {
    model: provider.modelId,
    messages: toOAIMessages(req.messages),
    max_tokens: req.max_tokens,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (req.tools && req.tools.length > 0 && provider.supportsTools) {
    body.tools = req.tools.map(toOpenAITool);
  }
  return body;
}

function channelEventToAdapterEvent(message: CustomProviderChannelEvent): AdapterEvent {
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

async function cancelCustomProviderStream(requestId: string): Promise<void> {
  await invoke('cancel_custom_provider_stream', { requestId }).catch(() => undefined);
}

async function* streamViaTauri(
  input: CustomProviderInvokeInput,
  signal: AbortSignal,
): AsyncIterable<AdapterEvent> {
  const queue: CustomProviderChannelEvent[] = [];
  let done = false;
  let invokeError: unknown = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const onEvent = new Channel<CustomProviderChannelEvent>();
  onEvent.onmessage = (message) => {
    queue.push(message);
    if (message.event === 'done' || message.event === 'error') done = true;
    notify();
  };

  const abort = () => {
    done = true;
    void cancelCustomProviderStream(input.requestId);
    notify();
  };
  signal.addEventListener('abort', abort, { once: true });

  const invokePromise = invoke<void>('stream_custom_provider', {
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
      yield channelEventToAdapterEvent(message);
    }

    await invokePromise;
    if (invokeError && !signal.aborted) {
      yield { type: 'error', error: errorFromUnknown(invokeError) };
    }
  } finally {
    signal.removeEventListener('abort', abort);
    if (!done && !signal.aborted) {
      void cancelCustomProviderStream(input.requestId);
    }
  }
}

export class CustomProviderAdapter implements ProviderAdapter {
  readonly id: CustomProvider['id'];
  readonly baseUrl: string;
  readonly capabilities: { thinking: boolean; tools: boolean; system: boolean };
  private readonly provider: CustomProvider;

  constructor(provider: CustomProvider) {
    this.provider = provider;
    this.id = provider.id;
    this.baseUrl = provider.baseUrl;
    this.capabilities = {
      thinking: provider.supportsThinking,
      tools: provider.supportsTools,
      system: true,
    };
  }

  validateKey(key: string): { ok: true } | { ok: false; reason: string } {
    if (!key.trim()) return { ok: false, reason: 'API Key 不能为空' };
    return { ok: true };
  }

  previewKey(key: string): string {
    if (key.length < 4) return '…';
    return `…${key.slice(-4)}`;
  }

  stream(req: AdapterRequest, apiKey: string, signal: AbortSignal): AsyncIterable<AdapterEvent> {
    if (!apiKey) throw new Error(`缺少 ${this.provider.name} API Key`);
    return streamViaTauri(
      {
        requestId: makeRequestId(),
        protocol: this.provider.protocol,
        baseUrl: this.provider.baseUrl,
        apiKey,
        body: buildCustomProviderRequestBody(this.provider, req),
      },
      signal,
    );
  }
}

