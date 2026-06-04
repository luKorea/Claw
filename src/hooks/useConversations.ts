import { useCallback, useEffect, useMemo } from 'react';

import { useConversationsStore } from '@/stores/conversations';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';

import { conversationApi, messageApi } from '@/lib/db';

import type { ContentBlock } from '@/types/claude';
import type { ChatMessage } from '@/types/claude';
import type { Conversation, Message } from '@/types/conversation';
import type { UpdateConversationInput } from '@/types/conversation';

/**
 * 把后端 Message 还原成 ChatMessage
 */
function restoreMessage(m: Message): ChatMessage {
  const content = JSON.parse(m.content) as ContentBlock[];
  return {
    id: m.id,
    role: m.role as ChatMessage['role'],
    content,
    model: m.model ?? undefined,
    createdAt: m.created_at,
  };
}

/**
 * 会话操作 hook(v1.3 重构)
 *
 * 设计要点:
 * - 跨 store 全部 selector 化,避免整订阅导致流式时整 hook 重渲
 * - 删除 `createUserMessage` / `createAssistantPlaceholder` / `finalizeAssistantMessage`
 *   三个死函数(useChat 有同名但不同实现的私有函数,grep 全仓 0 调用)
 * - 暴露扁平 API,不再包裹"store-like"对象,调用方按需取字段
 */
export function useConversations() {
  // 用 selector 拿稳定的 action 引用,避免每次 store 更新导致 useEffect 死循环刷 SQL
  const setListStore = useConversationsStore((s) => s.setList);
  const setLoadingStore = useConversationsStore((s) => s.setLoading);
  const list = useConversationsStore((s) => s.list);
  const currentId = useConversationsStore((s) => s.currentId);
  const loading = useConversationsStore((s) => s.loading);
  const upsertStore = useConversationsStore((s) => s.upsert);
  const removeStore = useConversationsStore((s) => s.remove);
  const setCurrentStore = useConversationsStore((s) => s.setCurrent);

  // v1.3:跨 store 拆 selector,避免 useChatStore() 裸订阅
  const setChatConversation = useChatStore((s) => s.setConversation);
  const clearChat = useChatStore((s) => s.clear);

  const defaultModel = useSettingsStore((s) => s.defaultModel);

  const refresh = useCallback(async () => {
    setLoadingStore(true);
    try {
      const result = await conversationApi.list();
      setListStore(result);
    } finally {
      setLoadingStore(false);
    }
  }, [setListStore, setLoadingStore]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 当前会话的派生值(用 useMemo 锁住,避免每次 render 重新 find)
  const current = useMemo(
    () => list.find((c) => c.id === currentId) ?? null,
    [list, currentId],
  );

  const selectConversation = useCallback(
    async (id: string) => {
      const conv = list.find((c) => c.id === id);
      if (!conv) return;
      setCurrentStore(id);
      const messages = await messageApi.list(id);
      setChatConversation(id, messages.map(restoreMessage));
    },
    [list, setCurrentStore, setChatConversation],
  );

  const createNew = useCallback(
    async (params?: { model?: string; systemPrompt?: string | null }) => {
      const model = params?.model ?? defaultModel;
      const title = '新会话';
      const conv = await conversationApi.create({
        title,
        model,
        system_prompt: params?.systemPrompt ?? null,
        thinking_enabled: false,
        thinking_budget: null,
      });
      upsertStore(conv);
      setCurrentStore(conv.id);
      setChatConversation(conv.id, []);
      return conv;
    },
    [upsertStore, setCurrentStore, setChatConversation, defaultModel],
  );

  const update = useCallback(
    async (input: UpdateConversationInput) => {
      await conversationApi.update(input);
      const updated = await conversationApi.get(input.id);
      upsertStore(updated);
    },
    [upsertStore],
  );

  const remove = useCallback(
    async (id: string) => {
      await conversationApi.remove(id);
      removeStore(id);
      if (currentId === id) {
        clearChat();
      }
    },
    [removeStore, clearChat, currentId],
  );

  return {
    list,
    currentId,
    current,
    loading,
    refresh,
    selectConversation,
    createNew,
    update,
    remove,
  };
}

export type { Conversation };
