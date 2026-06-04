/**
 * chat-engine 单元测试 (v1.3 重构)
 *
 * 覆盖:
 * - 单轮:无 tool_use,turn_done → final_done
 * - 单轮:有 tool_use,1 轮 tool 执行后无更多 tool_use
 * - 多轮:round 1 tool_use → round 2 直接 text → final_done
 * - 流式错误 → yield error
 * - AbortSignal 已 aborted → yield aborted
 * - tool_executing + tool_result 事件对
 * - serializeAssistantContent 序列化(文本/思考/工具)
 * - resolveMaxTokens(anthropic thinking / 其他)
 */

import type * as providersModule from '@/lib/providers';

vi.mock('@/lib/providers', async () => {
  const actual = await vi.importActual<typeof providersModule>('@/lib/providers');
  return {
    ...actual,
    selectAdapter: vi.fn(),
  };
});

vi.mock('@/lib/tools/executor', () => ({
  executeBuiltinTool: vi.fn(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runChatTurn, serializeAssistantContent, resolveMaxTokens } from '@/lib/chat-engine';
import * as providers from '@/lib/providers';
import * as executor from '@/lib/tools/executor';
import type { ProviderAdapter, AdapterEvent } from '@/lib/providers/types';
import type { ChatMessage, ContentBlock } from '@/types/claude';
import type { ProviderId } from '@/types/providers';

const mockedSelectAdapter = vi.mocked(providers.selectAdapter);
const mockedExecute = vi.mocked(executor.executeBuiltinTool);

function makeAdapter(events: AdapterEvent[]): ProviderAdapter {
  return {
    id: 'anthropic',
    baseUrl: '',
    capabilities: { thinking: true, tools: true, system: true },
    validateKey: () => ({ ok: true }),
    previewKey: () => '',
    async *stream() {
      for (const e of events) yield e;
    },
  } as unknown as ProviderAdapter;
}

function makeCtx(
  _adapter: ProviderAdapter,
  overrides: Partial<Parameters<typeof runChatTurn>[0]> = {},
): Parameters<typeof runChatTurn>[0] {
  let counter = 0;
  return {
    provider: 'anthropic' as ProviderId,
    apiKey: 'sk-test',
    model: 'claude-opus-4-8',
    system: undefined,
    thinking: null,
    maxTokens: 8192,
    tools: [],
    history: () => [],
    toolResultsBuffer: [],
    nextAssistantId: () => `asst-${++counter}`,
    signal: new AbortController().signal,
    ...overrides,
  };
}

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('lib/chat-engine', () => {
  beforeEach(() => {
    mockedSelectAdapter.mockReset();
    mockedExecute.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('单轮:无 tool_use,turn_done → final_done', async () => {
    const adapter = makeAdapter([
      { type: 'text_delta', text: 'hello ' },
      { type: 'text_delta', text: 'world' },
      { type: 'done', stopReason: 'end_turn' },
    ]);
    mockedSelectAdapter.mockReturnValue(adapter);

    const events = await collect(runChatTurn(makeCtx(adapter)));

    const types = events.map((e) => (e as { type: string }).type);
    // engine 直接 yield 增量 delta(2 个 text_delta)
    expect(types).toEqual([
      'turn_start',
      'text_delta',
      'text_delta',
      'turn_done',
      'final_done',
    ]);

    const textDeltas = events
      .filter((e) => (e as { type: string }).type === 'text_delta')
      .map((e) => (e as { type: 'text_delta'; text: string }).text);
    expect(textDeltas).toEqual(['hello ', 'world']);

    const final = events.at(-1) as { type: 'final_done'; totalTurns: number };
    expect(final.totalTurns).toBe(1);
  });

  it('单轮:有 tool_use → tool_executing → tool_result → 再流式 → final_done', async () => {
    const round1: AdapterEvent[] = [
      { type: 'text_delta', text: '我先查一下' },
      { type: 'tool_use_start', id: 't1', name: 'read_file' },
      { type: 'tool_use_delta', id: 't1', input_delta: '{"path":' },
      { type: 'tool_use_delta', id: 't1', input_delta: '"/tmp/a"}' },
      { type: 'tool_use_end', id: 't1', input: { path: '/tmp/a' } },
      { type: 'done', stopReason: 'tool_use' },
    ];
    const round2: AdapterEvent[] = [
      { type: 'text_delta', text: '查到了' },
      { type: 'done', stopReason: 'end_turn' },
    ];
    let callIdx = 0;
    const adapter: ProviderAdapter = {
      id: 'anthropic',
      baseUrl: '',
      capabilities: { thinking: true, tools: true, system: true },
      validateKey: () => ({ ok: true }),
      previewKey: () => '',
      async *stream() {
        const events = callIdx++ === 0 ? round1 : round2;
        for (const e of events) yield e;
      },
    } as unknown as ProviderAdapter;
    mockedSelectAdapter.mockReturnValue(adapter);
    mockedExecute.mockResolvedValue({ ok: true, content: '文件内容' });

    const events = await collect(
      runChatTurn(
        makeCtx(adapter, {
          history: () => [],
          toolResultsBuffer: [],
        }),
      ),
    );

    const types = events.map((e) => (e as { type: string }).type);
    // 期望事件序列:
    // turn_start, text_delta, tool_use_start, tool_use_delta(×2), tool_use_end, turn_done,
    // tool_executing, tool_result,
    // turn_start, text_delta, turn_done, final_done
    expect(types).toEqual([
      'turn_start',
      'text_delta',
      'tool_use_start',
      'tool_use_delta',
      'tool_use_delta',
      'tool_use_end',
      'turn_done',
      'tool_executing',
      'tool_result',
      'turn_start',
      'text_delta',
      'turn_done',
      'final_done',
    ]);

    expect(mockedExecute).toHaveBeenCalledTimes(1);
    expect(mockedExecute).toHaveBeenCalledWith('read_file', { path: '/tmp/a' });

    const final = events.at(-1) as { type: 'final_done'; totalTurns: number };
    expect(final.totalTurns).toBe(2);
  });

  it('history() 闭包调用:每轮都拉最新,反映 tool_result 注入后状态', async () => {
    const calls: ChatMessage[][] = [];
    const round1: AdapterEvent[] = [
      { type: 'tool_use_start', id: 't1', name: 'list_dir' },
      { type: 'tool_use_end', id: 't1', input: { path: '/tmp' } },
      { type: 'done', stopReason: 'tool_use' },
    ];
    const round2: AdapterEvent[] = [
      { type: 'text_delta', text: 'done' },
      { type: 'done', stopReason: 'end_turn' },
    ];
    let callIdx = 0;
    const adapter: ProviderAdapter = {
      id: 'anthropic',
      baseUrl: '',
      capabilities: { thinking: true, tools: true, system: true },
      validateKey: () => ({ ok: true }),
      previewKey: () => '',
      async *stream() {
        const events = callIdx++ === 0 ? round1 : round2;
        for (const e of events) yield e;
      },
    } as unknown as ProviderAdapter;
    mockedSelectAdapter.mockReturnValue(adapter);
    mockedExecute.mockResolvedValue({ ok: true, content: '[]' });

    let historyCallIdx = 0;
    const history: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: [{ type: 'text', text: 'list /tmp' }],
        createdAt: 0,
      },
    ];
    const gen = runChatTurn(
      makeCtx(adapter, {
        history: () => {
          historyCallIdx++;
          if (historyCallIdx === 2) {
            history.push({
              id: 'tr1',
              role: 'assistant',
              content: [
                { type: 'tool_use', id: 't1', name: 'list_dir', input: { path: '/tmp' } },
                {
                  type: 'tool_result',
                  tool_use_id: 't1',
                  content: '[]',
                  is_error: false,
                },
              ],
              createdAt: 1,
            });
          }
          // 在更新(或更新前)后拍快照,记录"引擎看到什么"
          calls.push([...history]);
          return history;
        },
      }),
    );
    await collect(gen);

    expect(calls.length).toBeGreaterThanOrEqual(2);
    // 第 2 次调用时,history 已包含 tool_result block
    expect(calls[1]!.some((m) => m.content.some((b) => b.type === 'tool_result'))).toBe(true);
  });

  it('流式 error 事件 → yield error(recoverable=true)', async () => {
    const adapter = makeAdapter([{ type: 'error', error: new Error('boom') }]);
    mockedSelectAdapter.mockReturnValue(adapter);

    const events = await collect(runChatTurn(makeCtx(adapter)));
    const err = events.find((e) => (e as { type: string }).type === 'error') as
      | { type: 'error'; message: string; recoverable: boolean }
      | undefined;
    expect(err).toBeDefined();
    expect(err!.message).toBe('boom');
    expect(err!.recoverable).toBe(true);
  });

  it('adapter.stream 抛错 → yield error', async () => {
    const adapter: ProviderAdapter = {
      id: 'anthropic',
      baseUrl: '',
      capabilities: { thinking: true, tools: true, system: true },
      validateKey: () => ({ ok: true }),
      previewKey: () => '',
      async *stream() {
        // engine 调 for-await 时第一项就是 rejected promise,await 抛出
        yield Promise.reject(new Error('network down'));
      },
    } as unknown as ProviderAdapter;
    mockedSelectAdapter.mockReturnValue(adapter);

    const events = await collect(runChatTurn(makeCtx(adapter)));
    const err = events.find((e) => (e as { type: string }).type === 'error') as
      | { type: 'error'; message: string }
      | undefined;
    expect(err).toBeDefined();
    expect(err!.message).toBe('network down');
  });

  it('AbortSignal 已 aborted → 立即 yield aborted 并 return', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = makeAdapter([]);
    mockedSelectAdapter.mockReturnValue(adapter);

    const events = await collect(
      runChatTurn(makeCtx(adapter, { signal: controller.signal })),
    );
    const types = events.map((e) => (e as { type: string }).type);
    expect(types[0]).toBe('aborted');
  });

  it('thinking_delta 事件透传', async () => {
    const adapter = makeAdapter([
      { type: 'thinking_delta', thinking: '分析中' },
      { type: 'text_delta', text: '结论' },
      { type: 'done', stopReason: 'end_turn' },
    ]);
    mockedSelectAdapter.mockReturnValue(adapter);

    const events = await collect(runChatTurn(makeCtx(adapter)));
    const types = events.map((e) => (e as { type: string }).type);
    expect(types).toContain('thinking_delta');
    expect(types).toContain('text_delta');
  });

  it('工具 execute 抛错 → tool_result 仍 yield,isError=true', async () => {
    const round1: AdapterEvent[] = [
      { type: 'tool_use_start', id: 't1', name: 'unknown_tool' },
      { type: 'tool_use_end', id: 't1', input: {} },
      { type: 'done', stopReason: 'tool_use' },
    ];
    const round2: AdapterEvent[] = [{ type: 'done', stopReason: 'end_turn' }];
    let callIdx = 0;
    const adapter: ProviderAdapter = {
      id: 'anthropic',
      baseUrl: '',
      capabilities: { thinking: true, tools: true, system: true },
      validateKey: () => ({ ok: true }),
      previewKey: () => '',
      async *stream() {
        const events = callIdx++ === 0 ? round1 : round2;
        for (const e of events) yield e;
      },
    } as unknown as ProviderAdapter;
    mockedSelectAdapter.mockReturnValue(adapter);
    mockedExecute.mockRejectedValue(new Error('exec fail'));

    const events = await collect(runChatTurn(makeCtx(adapter)));
    const tr = events.find((e) => (e as { type: string }).type === 'tool_result') as
      | { type: 'tool_result'; isError: boolean; content: string }
      | undefined;
    expect(tr).toBeDefined();
    expect(tr!.isError).toBe(true);
    expect(tr!.content).toBe('exec fail');
  });

  it('serializeAssistantContent:文本 + 思考 + tool_use', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'a' },
      { type: 'thinking', thinking: '思考 1' },
      { type: 'thinking', thinking: '思考 2' },
      { type: 'tool_use', id: 't', name: 'f', input: { x: 1 } },
    ];
    const r = serializeAssistantContent(blocks);
    expect(JSON.parse(r.content)).toHaveLength(4);
    expect(r.thinking).toBe('思考 1\n\n思考 2');
    expect(r.toolCalls).not.toBeNull();
    expect(JSON.parse(r.toolCalls!)).toEqual([
      { type: 'tool_use', id: 't', name: 'f', input: { x: 1 } },
    ]);
  });

  it('resolveMaxTokens:anthropic 用 thinking 解析,其他 provider fallback 8192', () => {
    expect(resolveMaxTokens('anthropic', null)).toBeGreaterThan(0);
    expect(resolveMaxTokens('anthropic', { budget_tokens: 5000 })).toBeGreaterThan(5000);
    expect(resolveMaxTokens('openai', null)).toBe(8192);
    expect(resolveMaxTokens('deepseek', null)).toBe(8192);
  });
});
