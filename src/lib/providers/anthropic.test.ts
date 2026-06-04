import type Anthropic from '@anthropic-ai/sdk';

import { describe, expect, it } from 'vitest';

import { anthropicAdapter, resolveAnthropicMaxTokens, toAnthropicMessages, accumulateSdkEvent, type SdkAccumulatorState } from '@/lib/providers/anthropic';
import type { AdapterMessage } from '@/lib/providers/types';
import type { Usage } from '@/types/claude';

function emptyState(): SdkAccumulatorState {
  return {
    indexToToolId: new Map<number, string>(),
    toolInputAcc: new Map<string, string>(),
  };
}

describe('providers/anthropic', () => {
  describe('resolveAnthropicMaxTokens', () => {
    it('thinking 为空 → 8192', () => {
      expect(resolveAnthropicMaxTokens(undefined)).toBe(8192);
      expect(resolveAnthropicMaxTokens(null)).toBe(8192);
    });

    it('thinking.budget_tokens=1000 → max(budget*2, 4096) = 4096', () => {
      expect(resolveAnthropicMaxTokens({ budget_tokens: 1_000 })).toBe(4_096);
    });

    it('thinking.budget_tokens=4000 → 8000(> 4096)', () => {
      expect(resolveAnthropicMaxTokens({ budget_tokens: 4_000 })).toBe(8_000);
    });

    it('thinking.budget_tokens=10000 → 20000', () => {
      expect(resolveAnthropicMaxTokens({ budget_tokens: 10_000 })).toBe(20_000);
    });

    it('thinking.budget_tokens=0 → max(0, 4096) = 4096', () => {
      expect(resolveAnthropicMaxTokens({ budget_tokens: 0 })).toBe(4_096);
    });

    it('thinking.budget_tokens=1 → max(2, 4096) = 4096', () => {
      expect(resolveAnthropicMaxTokens({ budget_tokens: 1 })).toBe(4_096);
    });

    it('thinking.budget_tokens=4096 → 8192', () => {
      expect(resolveAnthropicMaxTokens({ budget_tokens: 4_096 })).toBe(8_192);
    });
  });

  describe('toAnthropicMessages', () => {
    it('空数组 → 空', () => {
      expect(toAnthropicMessages([])).toEqual([]);
    });

    it('system 消息被丢弃(Anthropic 走 params.system 字段)', () => {
      const out = toAnthropicMessages([{ role: 'system', content: 'be nice' }]);
      expect(out).toEqual([]);
    });

    it('user 文本消息直接映射', () => {
      const out = toAnthropicMessages([{ role: 'user', content: 'hi' }]);
      expect(out).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('assistant 文本消息', () => {
      const out = toAnthropicMessages([{ role: 'assistant', content: 'hello' }]);
      expect(out).toEqual([{ role: 'assistant', content: 'hello' }]);
    });

    it('assistant + tool_calls → tool_use blocks', () => {
      const out = toAnthropicMessages([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 't1', name: 'read_file', arguments: { path: '/a' } },
            { id: 't2', name: 'list_dir', arguments: { path: '/b' } },
          ],
        },
      ]);
      expect(out).toHaveLength(1);
      expect(out[0]?.role).toBe('assistant');
      const blocks = out[0]?.content as Anthropic.ContentBlockParam[];
      expect(blocks).toHaveLength(2);
      expect(blocks?.[0]).toMatchObject({ type: 'tool_use', id: 't1', name: 'read_file' });
      expect(blocks?.[1]).toMatchObject({ type: 'tool_use', id: 't2', name: 'list_dir' });
    });

    it('连续 tool 消息:第一个 tool 新建 user array turn,后续 tool 合并到该 turn', () => {
      // 实际行为:tool 消息前一条是 user(string)时不合并,新建 user array turn;
      // 后续 tool 因 last 是 user(array)而合并。所以 3 条 input → 2 段 output。
      const out = toAnthropicMessages([
        { role: 'user', content: 'look' },
        { role: 'tool', content: 'r1', tool_call_id: 't1' },
        { role: 'tool', content: 'r2', tool_call_id: 't2' },
      ]);
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual({ role: 'user', content: 'look' });
      const blocks = out[1]?.content as Anthropic.ContentBlockParam[];
      expect(blocks).toHaveLength(2);
      expect(blocks?.[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
      expect(blocks?.[1]).toMatchObject({ type: 'tool_result', tool_use_id: 't2' });
    });

    it('tool 消息没有前 user → 自建 user turn', () => {
      const out = toAnthropicMessages([
        { role: 'tool', content: 'r1', tool_call_id: 't1' },
      ]);
      expect(out).toHaveLength(1);
      expect(out[0]?.role).toBe('user');
      const blocks = out[0]?.content as Anthropic.ContentBlockParam[];
      expect(blocks?.[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    });

    it('assistant + tool_calls 的 content 文本保留在 blocks 头部', () => {
      const out = toAnthropicMessages([
        { role: 'assistant', content: 'look here', tool_calls: [{ id: 't1', name: 'f', arguments: {} }] },
      ]);
      const blocks = out[0]?.content as Anthropic.ContentBlockParam[];
      expect(blocks?.[0]).toEqual({ type: 'text', text: 'look here' });
      expect(blocks?.[1]).toMatchObject({ type: 'tool_use', id: 't1' });
    });

    it('混合 user → assistant(tool_calls) → tool → user', () => {
      const msgs: AdapterMessage[] = [
        { role: 'user', content: 'go' },
        { role: 'assistant', content: '', tool_calls: [{ id: 't1', name: 'f', arguments: {} }] },
        { role: 'tool', content: 'r1', tool_call_id: 't1' },
        { role: 'user', content: 'thanks' },
      ];
      const out = toAnthropicMessages(msgs);
      // 期望 3 段: user / assistant / user(合并 tool_result) / user(thanks)
      expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'user']);
    });
  });

  describe('accumulateSdkEvent', () => {
    it('message_start → usage(输入 tokens)', () => {
      const state = emptyState();
      const events = accumulateSdkEvent(state, {
        type: 'message_start',
        message: {
          id: 'm1',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-opus-4-8',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 0 } as Anthropic.Usage,
        },
      } as unknown as Anthropic.MessageStreamEvent);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('usage');
      if (events[0]?.type === 'usage') {
        const u = events[0].usage as Usage;
        expect(u.input_tokens).toBe(100);
      }
    });

    it('content_block_start tool_use → tool_use_start', () => {
      const state = emptyState();
      const events = accumulateSdkEvent(state, {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 't1', name: 'read_file', input: {} },
      } as unknown as Anthropic.MessageStreamEvent);
      expect(events).toEqual([{ type: 'tool_use_start', id: 't1', name: 'read_file' }]);
      // state 已建立 index → id 映射
      expect(state.indexToToolId.get(0)).toBe('t1');
      expect(state.toolInputAcc.get('t1')).toBe('');
    });

    it('content_block_delta input_json_delta → 累积 + tool_use_delta', () => {
      const state = emptyState();
      // 预先 start
      state.indexToToolId.set(0, 't1');
      state.toolInputAcc.set('t1', '');
      const events = accumulateSdkEvent(state, {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"path":' },
      } as unknown as Anthropic.MessageStreamEvent);
      expect(events).toEqual([{ type: 'tool_use_delta', id: 't1', input_delta: '{"path":' }]);
      expect(state.toolInputAcc.get('t1')).toBe('{"path":');
    });

    it('content_block_stop → tool_use_end(解析 JSON)', () => {
      const state = emptyState();
      state.indexToToolId.set(0, 't1');
      state.toolInputAcc.set('t1', '{"path":"/tmp/a"}');
      const events = accumulateSdkEvent(state, {
        type: 'content_block_stop',
        index: 0,
      } as unknown as Anthropic.MessageStreamEvent);
      expect(events).toEqual([{ type: 'tool_use_end', id: 't1', input: { path: '/tmp/a' } }]);
      // state 已清理
      expect(state.indexToToolId.has(0)).toBe(false);
      expect(state.toolInputAcc.has('t1')).toBe(false);
    });

    it('content_block_stop + 非 JSON input → __raw fallback', () => {
      const state = emptyState();
      state.indexToToolId.set(0, 't1');
      state.toolInputAcc.set('t1', 'not-json');
      const events = accumulateSdkEvent(state, {
        type: 'content_block_stop',
        index: 0,
      } as unknown as Anthropic.MessageStreamEvent);
      expect(events[0]).toMatchObject({ type: 'tool_use_end', id: 't1', input: { __raw: 'not-json' } });
    });

    it('message_delta stop_reason → done', () => {
      const state = emptyState();
      const events = accumulateSdkEvent(state, {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 50 },
      } as unknown as Anthropic.MessageStreamEvent);
      // output_tokens → usage, stop_reason → done
      expect(events.find((e) => e.type === 'usage')).toBeDefined();
      expect(events.find((e) => e.type === 'done')).toEqual({ type: 'done', stopReason: 'end_turn' });
    });
  });

  describe('AnthropicAdapter (基础契约)', () => {
    it('id / baseUrl / capabilities 正确', () => {
      expect(anthropicAdapter.id).toBe('anthropic');
      expect(anthropicAdapter.baseUrl).toBe('https://api.anthropic.com');
      expect(anthropicAdapter.capabilities.thinking).toBe(true);
      expect(anthropicAdapter.capabilities.tools).toBe(true);
      expect(anthropicAdapter.capabilities.system).toBe(true);
    });

    it('validateKey: 空 / 非 sk- 开头 → 拒;合法 → 通过', () => {
      expect(anthropicAdapter.validateKey('').ok).toBe(false);
      expect(anthropicAdapter.validateKey('xxx').ok).toBe(false);
      const ok = anthropicAdapter.validateKey('sk-ant-api03-abc');
      expect(ok.ok).toBe(true);
    });

    it('previewKey: 短 / 长 两种形态', () => {
      expect(anthropicAdapter.previewKey('123')).toBe('sk-…');
      expect(anthropicAdapter.previewKey('sk-ant-api03-abcdef1234')).toBe('sk-…1234');
    });
  });
});
