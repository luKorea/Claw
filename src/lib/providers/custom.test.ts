import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invoke } from '@tauri-apps/api/core';

import {
  buildCustomProviderRequestBody,
  CustomProviderAdapter,
} from '@/lib/providers/custom';
import type { AdapterRequest } from '@/lib/providers/types';
import type { CustomProvider } from '@/stores/customProviders';

const mockedInvoke = vi.mocked(invoke);

const openAiProvider: CustomProvider = {
  id: 'custom:openai-local',
  name: 'Local OpenAI',
  protocol: 'openai-compatible',
  baseUrl: 'http://localhost:11434/v1',
  modelIds: ['llama3', 'qwen2'],
  selectedModelId: 'llama3',
  enabled: true,
  supportsThinking: true,
  supportsTools: true,
  streamMode: 'auto',
  createdAt: 0,
  updatedAt: 0,
};

const anthropicProvider: CustomProvider = {
  ...openAiProvider,
  id: 'custom:anthropic-local',
  name: 'Local Anthropic',
  protocol: 'anthropic-compatible',
  baseUrl: 'https://api.example.com/anthropic',
  modelIds: ['claude-compatible'],
  selectedModelId: 'claude-compatible',
};

function makeRequest(overrides: Partial<AdapterRequest> = {}): AdapterRequest {
  return {
    model: 'llama3',
    messages: [{ role: 'user', content: 'Reply exactly: OK' }],
    max_tokens: 8,
    tools: [
      {
        name: 'read_text_file',
        description: 'read file',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        source: 'builtin',
      },
    ],
    thinking: null,
    ...overrides,
  };
}

async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('providers/custom', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('buildCustomProviderRequestBody 构造 OpenAI 兼容 body', () => {
    const body = buildCustomProviderRequestBody(
      openAiProvider,
      makeRequest({ model: 'qwen2' }),
    );

    expect(body).toMatchObject({
      model: 'qwen2',
      stream: true,
      max_tokens: 8,
      stream_options: { include_usage: true },
    });
    expect(body.messages).toEqual([{ role: 'user', content: 'Reply exactly: OK' }]);
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: expect.objectContaining({ name: 'read_text_file' }),
      },
    ]);
  });

  it('buildCustomProviderRequestBody 按 non-stream 模式关闭流式字段', () => {
    const body = buildCustomProviderRequestBody(
      { ...openAiProvider, streamMode: 'non-stream' },
      makeRequest({ model: 'qwen2' }),
    );

    expect(body).toMatchObject({
      model: 'qwen2',
      stream: false,
      max_tokens: 8,
    });
    expect(body.stream_options).toBeUndefined();
  });

  it('buildCustomProviderRequestBody 构造 Anthropic 兼容 body', () => {
    const body = buildCustomProviderRequestBody(
      anthropicProvider,
      makeRequest({
        model: 'claude-compatible',
        system: 'system prompt',
        thinking: { budget_tokens: 4096 },
      }),
    );

    expect(body).toMatchObject({
      model: 'claude-compatible',
      stream: true,
      system: 'system prompt',
      max_tokens: 8192,
      thinking: { type: 'enabled', budget_tokens: 4096 },
    });
    expect(body.messages).toEqual([{ role: 'user', content: 'Reply exactly: OK' }]);
    expect(body.tools).toEqual([
      expect.objectContaining({
        name: 'read_text_file',
        input_schema: expect.objectContaining({ type: 'object' }),
      }),
    ]);
  });

  it('stream 通过 Tauri Channel 转出 AdapterEvent', async () => {
    mockedInvoke.mockImplementationOnce(async (_command, args) => {
      const payload = args as {
        onEvent: {
          onmessage?: (event: unknown) => void;
        };
      };
      payload.onEvent.onmessage?.({ event: 'textDelta', data: { text: 'O' } });
      payload.onEvent.onmessage?.({ event: 'textDelta', data: { text: 'K' } });
      payload.onEvent.onmessage?.({
        event: 'done',
        data: { stopReason: 'stop' },
      });
    });

    const adapter = new CustomProviderAdapter(openAiProvider);
    const events = await collect(
      adapter.stream(makeRequest(), 'sk-test', new AbortController().signal),
    );

    expect(mockedInvoke).toHaveBeenCalledWith(
      'stream_custom_provider',
      expect.objectContaining({
        input: expect.objectContaining({
          protocol: 'openai-compatible',
          streamMode: 'auto',
          fallbackProtocol: 'anthropic-compatible',
          baseUrl: 'http://localhost:11434/v1',
          apiKey: 'sk-test',
          body: expect.objectContaining({ model: 'llama3', stream: true }),
          fallbackBody: expect.objectContaining({
            model: 'llama3',
            stream: true,
          }),
        }),
      }),
    );
    expect(events).toEqual([
      { type: 'text_delta', text: 'O' },
      { type: 'text_delta', text: 'K' },
      { type: 'done', stopReason: 'stop' },
    ]);
  });

  it('auto 模式为 Anthropic 配置准备 OpenAI 协议 fallback body', async () => {
    mockedInvoke.mockImplementationOnce(async (_command, args) => {
      const payload = args as {
        onEvent: {
          onmessage?: (event: unknown) => void;
        };
      };
      payload.onEvent.onmessage?.({
        event: 'done',
        data: { stopReason: 'stop' },
      });
    });

    const adapter = new CustomProviderAdapter(anthropicProvider);
    await collect(
      adapter.stream(
        makeRequest({ model: 'claude-compatible', system: 'system prompt' }),
        'sk-test',
        new AbortController().signal,
      ),
    );

    expect(mockedInvoke).toHaveBeenCalledWith(
      'stream_custom_provider',
      expect.objectContaining({
        input: expect.objectContaining({
          protocol: 'anthropic-compatible',
          fallbackProtocol: 'openai-compatible',
          body: expect.objectContaining({
            model: 'claude-compatible',
            system: 'system prompt',
          }),
          fallbackBody: expect.objectContaining({
            model: 'claude-compatible',
            messages: expect.arrayContaining([
              expect.objectContaining({ role: 'system', content: 'system prompt' }),
            ]),
          }),
        }),
      }),
    );
  });

  it('AbortSignal 触发 cancel_custom_provider_stream', async () => {
    const controller = new AbortController();
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'stream_custom_provider') {
        controller.abort();
      }
    });

    const adapter = new CustomProviderAdapter(openAiProvider);
    await collect(adapter.stream(makeRequest(), 'sk-test', controller.signal));

    expect(mockedInvoke).toHaveBeenCalledWith(
      'cancel_custom_provider_stream',
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
});
