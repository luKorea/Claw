import { useCallback, useEffect, useMemo } from 'react';

import { useConversationsStore } from '@/stores/conversations';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { now, uuid } from '@/lib/utils';

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

function dumpMessage(m: ChatMessage): {
  content: string;
  thinking: string | null;
  tool_calls: string | null;
  tool_results: string | null;
  model: string | null;
} {
  const thinking = m.content
    .filter((b): b is Extract<ContentBlock, { type: 'thinking' }> => b.type === 'thinking')
    .map((b) => b.thinking)
    .join('\n\n');
  const toolCalls = m.content.filter(
    (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
  );
  const toolResults = m.content.filter(
    (b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result',
  );
  return {
    content: JSON.stringify(m.content),
    thinking: thinking || null,
    tool_calls: toolCalls.length ? JSON.stringify(toolCalls) : null,
    tool_results: toolResults.length ? JSON.stringify(toolResults) : null,
    model: m.model ?? null,
  };
}

/**
 * 会话操作 hook
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
  const chatStore = useChatStore();
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

  // 用稳定引用重组成 caller 期望的"store"对象
  const store = useMemo(
    () => ({
      list,
      currentId,
      loading,
      setList: setListStore,
      setCurrent: setCurrentStore,
      upsert: upsertStore,
      remove: removeStore,
      setLoading: setLoadingStore,
    }),
    [
      list,
      currentId,
      loading,
      setListStore,
      setCurrentStore,
      upsertStore,
      removeStore,
      setLoadingStore,
    ],
  );

  const selectConversation = useCallback(
    async (id: string) => {
      const conv = store.list.find((c) => c.id === id);
      if (!conv) return;
      store.setCurrent(id);
      const messages = await messageApi.list(id);
      chatStore.setConversation(id, messages.map(restoreMessage));
    },
    [store, chatStore],
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
      store.upsert(conv);
      store.setCurrent(conv.id);
      chatStore.setConversation(conv.id, []);
      return conv;
    },
    [store, chatStore, defaultModel],
  );

  const update = useCallback(
    async (input: UpdateConversationInput) => {
      await conversationApi.update(input);
      const updated = await conversationApi.get(input.id);
      store.upsert(updated);
    },
    [store],
  );

  const remove = useCallback(
    async (id: string) => {
      await conversationApi.remove(id);
      store.remove(id);
      if (store.currentId === id) {
        chatStore.clear();
      }
    },
    [store, chatStore],
  );

  /**
   * 创建一条 user 消息并落库，返回 ChatMessage 实例
   */
  const createUserMessage = useCallback(
    async (conversationId: string, text: string): Promise<ChatMessage> => {
      const id = uuid();
      const msg: ChatMessage = {
        id,
        role: 'user',
        content: [{ type: 'text', text }],
        createdAt: now(),
      };
      const dumped = dumpMessage(msg);
      await messageApi.save({
        id,
        conversation_id: conversationId,
        role: 'user',
        content: dumped.content,
        thinking: dumped.thinking,
        tool_calls: dumped.tool_calls,
        tool_results: dumped.tool_results,
        model: dumped.model,
        usage: null,
      });
      return msg;
    },
    [],
  );

  /**
   * 创建一条 assistant 占位消息并落库
   */
  const createAssistantPlaceholder = useCallback(
    async (conversationId: string, model: string): Promise<ChatMessage> => {
      const id = uuid();
      const msg: ChatMessage = {
        id,
        role: 'assistant',
        content: [],
        model,
        streaming: true,
        createdAt: now(),
      };
      const dumped = dumpMessage(msg);
      await messageApi.save({
        id,
        conversation_id: conversationId,
        role: 'assistant',
        content: dumped.content,
        thinking: dumped.thinking,
        tool_calls: dumped.tool_calls,
        tool_results: dumped.tool_results,
        model: dumped.model,
        usage: null,
      });
      return msg;
    },
    [],
  );

  /** 收尾时把 streaming 消息的最终 content 写回 DB */
  const finalizeAssistantMessage = useCallback(
    async (msg: ChatMessage, usageJson: string | null = null) => {
      const dumped = dumpMessage(msg);
      // 通过 save 复用：先 update conversation.updated_at 已由后端触发，这里需要 update 消息
      // 简化：删除旧消息后重新插入
      // 后端没有 update_message，这里采用：删 + 增
      await messageApi.remove(msg.id).catch(() => {});
      await messageApi.save({
        id: msg.id,
        conversation_id: chatStore.conversationId ?? '',
        role: 'assistant',
        content: dumped.content,
        thinking: dumped.thinking,
        tool_calls: dumped.tool_calls,
        tool_results: dumped.tool_results,
        model: dumped.model,
        usage: usageJson,
      });
    },
    [chatStore.conversationId],
  );

  return {
    list: store.list,
    currentId: store.currentId,
    current: store.list.find((c) => c.id === store.currentId) ?? null,
    loading: store.loading,
    refresh,
    selectConversation,
    createNew,
    update,
    remove,
    createUserMessage,
    createAssistantPlaceholder,
    finalizeAssistantMessage,
  };
}

export type { Conversation };
