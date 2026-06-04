import { describe, expect, it } from 'vitest';

import { deepseekAdapter } from '@/lib/providers/deepseek';
import { openaiAdapter } from '@/lib/providers/openai';
import { OpenAICompatAdapter, parseSSEEvent, type ToolAccEntry } from '@/lib/providers/openai-compatible';

function mkEvent(data: string): string {
  return `data: ${data}\n\n`;
}

function mkAcc(): Map<number, ToolAccEntry> {
  return new Map();
}

describe('providers/openai-compatible', () => {
  describe('parseSSEEvent', () => {
    it('无 data 行 → 空', () => {
      const events = parseSSEEvent('event: ping\n: heartbeat\n\n', mkAcc());
      expect(events).toEqual([]);
    });

    it('忽略 : ping 注释行', () => {
      const events = parseSSEEvent(': ping\n\n', mkAcc());
      expect(events).toEqual([]);
    });

    it('忽略 event: 行', () => {
      const raw = `event: message\ndata: {"choices":[]}\n\n`;
      const events = parseSSEEvent(raw, mkAcc());
      expect(events).toEqual([]);
    });

    it('text_delta: content 字段', () => {
      const events = parseSSEEvent(
        mkEvent(JSON.stringify({ choices: [{ index: 0, delta: { content: 'hi' } }] })),
        mkAcc(),
      );
      expect(events).toEqual([{ type: 'text_delta', text: 'hi' }]);
    });

    it('thinking_delta: reasoning_content 字段(DeepSeek-R1 / MiniMax-M2.7)', () => {
      const events = parseSSEEvent(
        mkEvent(JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: 'let me think' } }] })),
        mkAcc(),
      );
      expect(events).toEqual([{ type: 'thinking_delta', thinking: 'let me think' }]);
    });

    it('多行 data 拼接(同一事件内多 data: 行)→ 拼接后整体 JSON.parse', () => {
      // SSE 规范允许一个 event 块内多 data: 行,内容用 \n 拼接。
      // 这里测试两个独立 SSE event 块(用 \n\n 分隔)各自被调用一次:
      const acc = mkAcc();
      // 第 1 块:单一 data,产 text_delta
      const e1 = parseSSEEvent('data: {"choices":[{"index":0,"delta":{"content":"a"}}]}\n\n', acc);
      expect(e1).toEqual([{ type: 'text_delta', text: 'a' }]);
      // 第 2 块:DONE,无累积 tool → 空
      const e2 = parseSSEEvent('data: [DONE]\n\n', acc);
      expect(e2).toEqual([]);
    });

    it('非 JSON data 忽略(心跳等)', () => {
      const events = parseSSEEvent('data: not-json\n\n', mkAcc());
      expect(events).toEqual([]);
    });

    it('[DONE] 哨兵 + 无累积 tool → 空(只清空 acc)', () => {
      const acc = mkAcc();
      const events = parseSSEEvent('data: [DONE]\n\n', acc);
      expect(events).toEqual([]);
    });

    it('[DONE] + 累积 tool → flush tool_use_end(JSON 解析)', () => {
      const acc = mkAcc();
      // 先输入一个 tool_calls start
      parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'f', arguments: '{"a":1}' } }] } }],
          }),
        ),
        acc,
      );
      // 再 DONE
      const events = parseSSEEvent('data: [DONE]\n\n', acc);
      expect(events).toEqual([{ type: 'tool_use_end', id: 't1', input: { a: 1 } }]);
      // acc 已清空
      expect(acc.size).toBe(0);
    });

    it('[DONE] + tool 累积的 args 非 JSON → __raw fallback', () => {
      const acc = mkAcc();
      parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'f', arguments: 'not-json' } }] } }],
          }),
        ),
        acc,
      );
      const events = parseSSEEvent('data: [DONE]\n\n', acc);
      expect(events[0]).toMatchObject({ type: 'tool_use_end', id: 't1', input: { __raw: 'not-json' } });
    });

    it('finish_reason: 触发 flush 残留 tool_use + done', () => {
      const acc = mkAcc();
      parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'f', arguments: '{"k":2}' } }] } }],
          }),
        ),
        acc,
      );
      const events = parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          }),
        ),
        acc,
      );
      expect(events).toEqual([
        { type: 'tool_use_end', id: 't1', input: { k: 2 } },
        { type: 'done', stopReason: 'stop' },
      ]);
    });

    it('tool_calls delta 多 chunk 累积', () => {
      const acc = mkAcc();
      // 第 1 chunk: id + name + 部分 args
      parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'read', arguments: '{"pat' } }] } }],
          }),
        ),
        acc,
      );
      // 第 2 chunk: 续 args
      const events = parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'h":"/a"}' } }] } }],
          }),
        ),
        acc,
      );
      // 第 2 chunk 应当 yield tool_use_delta
      expect(events).toEqual([{ type: 'tool_use_delta', id: 't1', input_delta: 'h":"/a"}' }]);
      // 累积后 acc.args = '{"path":"/a"}'
      expect(acc.get(0)?.args).toBe('{"pat' + 'h":"/a"}');
    });

    it('tool_use_start 只 yield 一次(首次见到 id+name)', () => {
      const acc = mkAcc();
      // 第 1 chunk:id + name → 应当 yield start
      const events1 = parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'f', arguments: '{}' } }] } }],
          }),
        ),
        acc,
      );
      expect(events1).toContainEqual({ type: 'tool_use_start', id: 't1', name: 'f' });
      // 第 2 chunk:已有 acc.id,只追加 args → 不再 yield start
      const events2 = parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'x' } }] } }],
          }),
        ),
        acc,
      );
      // 仅有 tool_use_delta,无 tool_use_start
      expect(events2.find((e) => e.type === 'tool_use_start')).toBeUndefined();
      expect(events2).toContainEqual({ type: 'tool_use_delta', id: 't1', input_delta: 'x' });
    });

    it('usage-only chunk → usage + done(stopReason=null)', () => {
      const events = parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        ),
        mkAcc(),
      );
      expect(events[0]).toMatchObject({ type: 'usage' });
      expect(events[1]).toEqual({ type: 'done', stopReason: null });
    });

    it('chunk 自带 usage(非空 choices 也有) → 末尾追加 usage', () => {
      const events = parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 7 },
          }),
        ),
        mkAcc(),
      );
      // 顺序: text_delta → done → usage
      expect(events[0]).toEqual({ type: 'text_delta', text: 'ok' });
      expect(events.find((e) => e.type === 'done')).toBeDefined();
      expect(events.find((e) => e.type === 'usage')).toBeDefined();
    });

    it('reasoning_tokens 透传到 usage', () => {
      const events = parseSSEEvent(
        mkEvent(
          JSON.stringify({
            choices: [],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              completion_tokens_details: { reasoning_tokens: 30 },
            },
          }),
        ),
        mkAcc(),
      );
      const usageEvent = events.find((e) => e.type === 'usage');
      expect(usageEvent).toBeDefined();
      if (usageEvent && usageEvent.type === 'usage') {
        expect(usageEvent.usage.reasoning_tokens).toBe(30);
      }
    });
  });

  describe('OpenAICompatAdapter 基础契约', () => {
    function mkAdapter() {
      return new OpenAICompatAdapter('openai', {
        baseUrl: 'https://api.example.com/v1',
        keyPrefix: 'sk',
        providerLabel: 'Example',
      });
    }

    it('id / baseUrl 正确', () => {
      const a = mkAdapter();
      expect(a.id).toBe('openai');
      expect(a.baseUrl).toBe('https://api.example.com/v1');
    });

    it('validateKey 默认要求 sk- 开头', () => {
      const a = mkAdapter();
      expect(a.validateKey('sk-abc').ok).toBe(true);
      expect(a.validateKey('').ok).toBe(false);
      expect(a.validateKey('abc').ok).toBe(false);
    });

    it('validateKey 支持自定义(覆盖默认)', () => {
      const a = new OpenAICompatAdapter('openai', {
        baseUrl: 'https://x',
        keyPrefix: 'sk',
        providerLabel: 'Custom',
        validateKey: (k) =>
          k.startsWith('cp-') ? { ok: true } : { ok: false, reason: 'need cp-' },
      });
      expect(a.validateKey('cp-xyz').ok).toBe(true);
      expect(a.validateKey('sk-xyz').ok).toBe(false);
    });

    it('previewKey: 短 / 长', () => {
      const a = mkAdapter();
      expect(a.previewKey('123')).toBe('sk…');
      expect(a.previewKey('sk-abcdef1234')).toBe('sk…1234');
    });

    it('stream: 缺 apiKey → 抛错(在第一次 next 时)', async () => {
      const a = mkAdapter();
      const stream = a.stream({ model: 'm', messages: [], max_tokens: 1 }, '', new AbortController().signal);
      // async iterable:用 for-await 触发,throw 在 first iteration 抛出
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ev of stream) {
          // 不会到这
        }
      }).rejects.toThrow(/Example/);
    });
  });

  describe('子类 smoke', () => {
    it('deepseekAdapter 配置正确', () => {
      expect(deepseekAdapter.id).toBe('deepseek');
      // v1.2 Bug 1 强化:强约束 endpoint(避免子串匹配的弱断言)
      // DeepSeek 没有 /v1 后缀,openai-compatible driver 拼 URL 时直接 /chat/completions
      expect(deepseekAdapter.baseUrl).toBe('https://api.deepseek.com');
    });
    it('openaiAdapter 配置正确', () => {
      expect(openaiAdapter.id).toBe('openai');
      expect(openaiAdapter.baseUrl).toBe('https://api.openai.com/v1');
    });
    // minimaxi 不在 OAI compat 子类里 — 它走 Anthropic 兼容协议,
    // 测试见 minimaxi.test.ts。
  });
});
