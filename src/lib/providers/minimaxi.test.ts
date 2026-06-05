/**
 * MiniMax Provider Adapter 测试。
 *
 * MiniMax 通过 Tauri Rust command 发起真实网络请求,前端只负责构造
 * Anthropic 兼容 body 并消费 Channel 事件。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invoke } from '@tauri-apps/api/core';

import {
  buildMiniMaxRequestBody,
  minimaxiAdapter,
} from '@/lib/providers/minimaxi';
import type { AdapterRequest } from '@/lib/providers/types';

const mockedInvoke = vi.mocked(invoke);

function makeRequest(overrides: Partial<AdapterRequest> = {}): AdapterRequest {
  return {
    model: 'MiniMax-M2.7',
    messages: [{ role: 'user', content: 'Reply exactly: OK' }],
    max_tokens: 8,
    tools: [],
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

describe('providers/minimaxi', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('id 是 minimaxi', () => {
    expect(minimaxiAdapter.id).toBe('minimaxi');
  });

  it('baseURL 指向 MiniMax 官方 Anthropic 兼容端点', () => {
    expect(minimaxiAdapter.baseUrl).toBe('https://api.minimax.io/anthropic');
  });

  it('capabilities:thinking / tools / system 全开', () => {
    expect(minimaxiAdapter.capabilities).toEqual({
      thinking: true,
      tools: true,
      system: true,
    });
  });

  describe('validateKey', () => {
    it('空 → 拒', () => {
      const r = minimaxiAdapter.validateKey('');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    });

    it('非 sk- 开头 → 拒', () => {
      const r = minimaxiAdapter.validateKey('eyJhbGciOiJIUzI1NiJ9.xxx');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/sk-/);
    });

    it('sk-cp- 开头 → 通过', () => {
      const ok = minimaxiAdapter.validateKey('sk-cp-abcdef');
      expect(ok.ok).toBe(true);
    });
  });

  describe('previewKey', () => {
    it('短 key(< 4 字符)安全降级', () => {
      expect(minimaxiAdapter.previewKey('123')).toBe('sk-…');
    });

    it('长 key 截取前缀 + 后 4 位', () => {
      expect(minimaxiAdapter.previewKey('sk-cp-abcdef1234')).toBe('sk-…1234');
    });
  });

  it('buildMiniMaxRequestBody 使用 Anthropic 兼容消息和 thinking max_tokens', () => {
    const body = buildMiniMaxRequestBody(
      makeRequest({
        system: 'system prompt',
        thinking: { budget_tokens: 10_000 },
      }),
    );
    expect(body).toMatchObject({
      model: 'MiniMax-M2.7',
      stream: true,
      system: 'system prompt',
      max_tokens: 20_000,
      thinking: { type: 'enabled', budget_tokens: 10_000 },
    });
    expect(body.messages).toEqual([{ role: 'user', content: 'Reply exactly: OK' }]);
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
        event: 'usage',
        data: { usage: { input_tokens: 3, output_tokens: 1 } },
      });
      payload.onEvent.onmessage?.({
        event: 'done',
        data: { stopReason: 'end_turn' },
      });
    });

    const events = await collect(
      minimaxiAdapter.stream(makeRequest(), 'sk-cp-test', new AbortController().signal),
    );

    expect(mockedInvoke).toHaveBeenCalledWith(
      'stream_minimax_anthropic',
      expect.objectContaining({
        input: expect.objectContaining({
          apiKey: 'sk-cp-test',
          body: expect.objectContaining({ model: 'MiniMax-M2.7', stream: true }),
        }),
      }),
    );
    expect(events).toEqual([
      { type: 'text_delta', text: 'O' },
      { type: 'text_delta', text: 'K' },
      { type: 'usage', usage: { input_tokens: 3, output_tokens: 1 } },
      { type: 'done', stopReason: 'end_turn' },
    ]);
  });

  it('AbortSignal 触发 cancel_minimax_stream', async () => {
    const controller = new AbortController();
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'stream_minimax_anthropic') {
        controller.abort();
      }
    });

    await collect(minimaxiAdapter.stream(makeRequest(), 'sk-cp-test', controller.signal));

    expect(mockedInvoke).toHaveBeenCalledWith(
      'cancel_minimax_stream',
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
});
