import { beforeEach, describe, expect, it } from 'vitest';

import { useConversationsStore } from '@/stores/conversations';
import { useChatStore } from '@/stores/chat';
import type { Conversation } from '@/types/conversation';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    title: 'Test',
    model: 'claude-sonnet-4-6',
    system_prompt: null,
    thinking_enabled: 0,
    thinking_budget: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('stores/conversations', () => {
  beforeEach(() => {
    useConversationsStore.setState({ list: [], currentId: null });
    useChatStore.setState({
      conversationId: null,
      messages: [],
      isStreaming: false,
      error: null,
      lastUsage: null,
    });
  });

  describe('upsert + sort', () => {
    it('新会话 prepend 到头部', () => {
      useConversationsStore.getState().setList([makeConv({ id: 'a', updated_at: 100 })]);
      useConversationsStore.getState().upsert(makeConv({ id: 'b', updated_at: 200 }));
      const ids = useConversationsStore.getState().list.map((c) => c.id);
      expect(ids).toEqual(['b', 'a']);
    });

    it('更新已有会话后,按 updated_at desc 重新排序', () => {
      useConversationsStore.getState().setList([
        makeConv({ id: 'a', updated_at: 100 }),
        makeConv({ id: 'b', updated_at: 200 }),
        makeConv({ id: 'c', updated_at: 300 }),
      ]);
      // 把 a 提到最新
      useConversationsStore.getState().upsert(makeConv({ id: 'a', updated_at: 500 }));
      const ids = useConversationsStore.getState().list.map((c) => c.id);
      expect(ids).toEqual(['a', 'c', 'b']);
    });

    it('同 updated_at 保持原相对顺序(stable sort)', () => {
      useConversationsStore.getState().setList([
        makeConv({ id: 'a', updated_at: 100 }),
        makeConv({ id: 'b', updated_at: 100 }),
        makeConv({ id: 'c', updated_at: 100 }),
      ]);
      // 不触发任何变化,但 setList 仍走排序路径(应保持原顺序)
      useConversationsStore.getState().setList([
        makeConv({ id: 'a', updated_at: 100 }),
        makeConv({ id: 'b', updated_at: 100 }),
        makeConv({ id: 'c', updated_at: 100 }),
      ]);
      const ids = useConversationsStore.getState().list.map((c) => c.id);
      expect(ids).toEqual(['a', 'b', 'c']);
    });
  });

  describe('patchLocal', () => {
    it('本地 patch 会返回旧会话并立即更新列表', () => {
      useConversationsStore.getState().setList([makeConv({ id: 'a', model: 'deepseek-chat' })]);
      const previous = useConversationsStore
        .getState()
        .patchLocal('a', { model: 'MiniMax-M2.7' });

      expect(previous?.model).toBe('deepseek-chat');
      expect(useConversationsStore.getState().list[0]?.model).toBe('MiniMax-M2.7');
    });

    it('找不到会话时返回 null', () => {
      expect(useConversationsStore.getState().patchLocal('missing', { model: 'gpt-4o' })).toBeNull();
    });
  });

  describe('remove', () => {
    it('删除非当前会话,不动 currentId 也不动 chat', () => {
      useConversationsStore.setState({
        list: [makeConv({ id: 'a' }), makeConv({ id: 'b' })],
        currentId: 'a',
      });
      useChatStore.setState({
        conversationId: 'a',
        messages: [
          { id: 'm1', role: 'user', content: [], createdAt: 0 },
        ],
      });
      useConversationsStore.getState().remove('b');
      expect(useConversationsStore.getState().list.map((c) => c.id)).toEqual(['a']);
      expect(useConversationsStore.getState().currentId).toBe('a');
      // chat store 不动
      expect(useChatStore.getState().messages).toHaveLength(1);
    });

    it('删除当前会话,清 currentId + 调 chat.clear()', () => {
      useConversationsStore.setState({
        list: [makeConv({ id: 'a' }), makeConv({ id: 'b' })],
        currentId: 'a',
      });
      useChatStore.setState({
        conversationId: 'a',
        messages: [
          { id: 'm1', role: 'user', content: [], createdAt: 0 },
        ],
        isStreaming: true,
        error: 'xxx',
      });
      useConversationsStore.getState().remove('a');
      expect(useConversationsStore.getState().list.map((c) => c.id)).toEqual(['b']);
      expect(useConversationsStore.getState().currentId).toBeNull();
      // chat store 已清空
      expect(useChatStore.getState().messages).toEqual([]);
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().error).toBeNull();
      expect(useChatStore.getState().conversationId).toBeNull();
    });
  });

  describe('removeMany', () => {
    it('批量删除包含当前会话时清 currentId + chat', () => {
      useConversationsStore.setState({
        list: [
          makeConv({ id: 'a' }),
          makeConv({ id: 'b' }),
          makeConv({ id: 'c' }),
        ],
        currentId: 'b',
      });
      useChatStore.setState({
        conversationId: 'b',
        messages: [{ id: 'm1', role: 'user', content: [], createdAt: 0 }],
        isStreaming: true,
        error: 'xxx',
      });

      useConversationsStore.getState().removeMany(['a', 'b']);

      expect(useConversationsStore.getState().list.map((c) => c.id)).toEqual(['c']);
      expect(useConversationsStore.getState().currentId).toBeNull();
      expect(useChatStore.getState().messages).toEqual([]);
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });
});
