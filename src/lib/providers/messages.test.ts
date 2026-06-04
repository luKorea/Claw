import { describe, expect, it } from 'vitest';

import { buildAdapterMessages, chatMessageToAdapter } from '@/lib/providers/messages';
import type { ChatMessage } from '@/types/claude';

function userMsg(content: ChatMessage['content']): ChatMessage {
  return { id: 'm', role: 'user', content, createdAt: 0 };
}
function asstMsg(content: ChatMessage['content']): ChatMessage {
  return { id: 'm', role: 'assistant', content, createdAt: 0 };
}

describe('providers/messages', () => {
  describe('chatMessageToAdapter - user', () => {
    it('空 content → 空数组', () => {
      expect(chatMessageToAdapter(userMsg([]))).toEqual([]);
    });

    it('单 text block', () => {
      const out = chatMessageToAdapter(userMsg([{ type: 'text', text: 'hello' }]));
      expect(out).toEqual([{ role: 'user', content: 'hello' }]);
    });

    it('多 text block 合并', () => {
      const out = chatMessageToAdapter(
        userMsg([
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ]),
      );
      expect(out).toEqual([{ role: 'user', content: 'ab' }]);
    });

    it('thinking block 在 user content 中被忽略(仅 user 输出文本)', () => {
      const out = chatMessageToAdapter(
        userMsg([
          { type: 'text', text: 'hi' },
          { type: 'thinking', thinking: 'thinking' },
        ]),
      );
      expect(out).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('tool_result 拆成独立 tool 消息', () => {
      const out = chatMessageToAdapter(
        userMsg([
          { type: 'tool_result', tool_use_id: 't1', content: 'r1', is_error: false },
        ]),
      );
      expect(out).toEqual([
        { role: 'tool', content: 'r1', tool_call_id: 't1' },
      ]);
    });

    it('text + tool_result 混合 → user 文本 + 独立 tool 消息', () => {
      const out = chatMessageToAdapter(
        userMsg([
          { type: 'text', text: '看看' },
          { type: 'tool_result', tool_use_id: 't1', content: 'r1', is_error: false },
          { type: 'tool_result', tool_use_id: 't2', content: 'r2', is_error: false },
        ]),
      );
      expect(out).toEqual([
        { role: 'user', content: '看看' },
        { role: 'tool', content: 'r1', tool_call_id: 't1' },
        { role: 'tool', content: 'r2', tool_call_id: 't2' },
      ]);
    });

    it('tool_result 的 content 是 string(转 string 透传)', () => {
      const out = chatMessageToAdapter(
        userMsg([{ type: 'tool_result', tool_use_id: 't1', content: 'plain', is_error: false }]),
      );
      // tool content 直接 string 透传
      expect(out[0]?.content).toBe('plain');
    });
  });

  describe('chatMessageToAdapter - assistant', () => {
    it('text 消息', () => {
      const out = chatMessageToAdapter(asstMsg([{ type: 'text', text: 'hi' }]));
      expect(out).toEqual([{ role: 'assistant', content: 'hi', tool_calls: [] }]);
    });

    it('tool_use 转为 tool_calls', () => {
      const out = chatMessageToAdapter(
        asstMsg([
          {
            type: 'tool_use',
            id: 't1',
            name: 'read_file',
            input: { path: '/a' },
          },
        ]),
      );
      expect(out[0]?.role).toBe('assistant');
      expect(out[0]?.tool_calls).toEqual([
        { id: 't1', name: 'read_file', arguments: { path: '/a' } },
      ]);
    });

    it('多 text 合并 + tool_use 列表', () => {
      const out = chatMessageToAdapter(
        asstMsg([
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
          { type: 'tool_use', id: 't1', name: 'f', input: {} },
        ]),
      );
      expect(out[0]?.content).toBe('ab');
      expect(out[0]?.tool_calls).toHaveLength(1);
    });

    it('thinking block 不进 tool_calls(在 chatMessageToAdapter 内部丢弃)', () => {
      const out = chatMessageToAdapter(
        asstMsg([
          { type: 'thinking', thinking: 'reasoning' },
          { type: 'text', text: 'final' },
        ]),
      );
      expect(out[0]?.content).toBe('final');
      expect(out[0]?.tool_calls).toEqual([]);
    });

    it('空 content → tool_calls 空数组', () => {
      const out = chatMessageToAdapter(asstMsg([]));
      expect(out[0]?.content).toBe('');
      expect(out[0]?.tool_calls).toEqual([]);
    });
  });

  describe('buildAdapterMessages', () => {
    it('无 system 时不注入', () => {
      const out = buildAdapterMessages([userMsg([{ type: 'text', text: 'hi' }])]);
      expect(out.find((m) => m.role === 'system')).toBeUndefined();
    });

    it('空白 system prompt 不注入', () => {
      const out = buildAdapterMessages([], '   \n  ');
      expect(out).toEqual([]);
    });

    it('system 注入为首条', () => {
      const out = buildAdapterMessages([userMsg([{ type: 'text', text: 'hi' }])], 'be nice');
      expect(out[0]).toEqual({ role: 'system', content: 'be nice' });
      expect(out[1]?.role).toBe('user');
    });
  });
});
