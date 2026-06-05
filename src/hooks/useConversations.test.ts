vi.mock('@/lib/db', () => ({
  conversationApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  messageApi: {
    list: vi.fn(),
  },
}));

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConversations } from '@/hooks/useConversations';
import { conversationApi } from '@/lib/db';
import { useChatStore } from '@/stores/chat';
import { useConversationsStore } from '@/stores/conversations';
import type { Conversation } from '@/types/conversation';

const mockedList = vi.mocked(conversationApi.list);
const mockedGet = vi.mocked(conversationApi.get);
const mockedUpdate = vi.mocked(conversationApi.update);

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    title: 'Test',
    model: 'MiniMax-M2.7',
    system_prompt: null,
    thinking_enabled: 0,
    thinking_budget: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('useConversations', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    useConversationsStore.setState({ list: [], currentId: null, loading: false });
    useChatStore.setState({
      conversationId: null,
      messages: [],
      isStreaming: false,
      error: null,
      lastUsage: null,
    });
  });

  it('update 成功路径会先乐观更新,再用 DB 回读值覆盖', async () => {
    const original = makeConv({ model: 'MiniMax-M2.7' });
    const fromDb = makeConv({ model: 'deepseek-chat', updated_at: 10 });
    mockedList.mockResolvedValue([original]);
    mockedGet.mockResolvedValue(fromDb);
    const updateResolver: { current: (() => void) | null } = { current: null };
    mockedUpdate.mockReturnValue(
      new Promise<void>((resolve) => {
        updateResolver.current = resolve;
      }),
    );

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = result.current.update({ id: 'c1', model: 'deepseek-chat' });
    });

    expect(useConversationsStore.getState().list[0]?.model).toBe('deepseek-chat');
    if (!updateResolver.current) {
      throw new Error('update resolver was not captured');
    }
    updateResolver.current();
    await act(async () => {
      await promise;
    });
    expect(useConversationsStore.getState().list[0]).toMatchObject({
      model: 'deepseek-chat',
      updated_at: 10,
    });
  });

  it('update 失败路径会回滚旧会话并继续抛错', async () => {
    const original = makeConv({ model: 'MiniMax-M2.7' });
    mockedList.mockResolvedValue([original]);
    mockedUpdate.mockRejectedValue(new Error('db down'));

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    let thrown: unknown = null;
    await act(async () => {
      try {
        await result.current.update({ id: 'c1', model: 'deepseek-chat' });
      } catch (err) {
        thrown = err;
      }
    });
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('db down');
    expect(useConversationsStore.getState().list[0]?.model).toBe('MiniMax-M2.7');
  });
});
