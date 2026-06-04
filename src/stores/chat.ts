import { create } from 'zustand';

import type { ContentBlock, Usage } from '@/types/claude';
import type { ChatMessage } from '@/types/claude';

export interface ChatState {
  /** 当前会话 id */
  conversationId: string | null;
  /** 消息列表（当前会话） */
  messages: ChatMessage[];
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 错误信息 */
  error: string | null;
  /** 最近一次 usage */
  lastUsage: Usage | null;

  setConversation: (id: string | null, messages?: ChatMessage[]) => void;
  appendMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, updater: (m: ChatMessage) => ChatMessage) => void;
  appendContentBlock: (messageId: string, block: ContentBlock) => void;
  finalizeMessage: (messageId: string, usage?: Usage | null) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  error: null,
  lastUsage: null,

  setConversation: (id, messages = []) =>
    set({ conversationId: id, messages, error: null, lastUsage: null }),

  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  updateMessage: (id, updater) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? updater(m) : m)),
    })),

  appendContentBlock: (messageId, block) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, content: [...m.content, block], streaming: true }
          : m,
      ),
    })),

  finalizeMessage: (messageId, usage = null) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, streaming: false } : m,
      ),
      lastUsage: usage ?? s.lastUsage,
    })),

  setStreaming: (isStreaming) => set({ isStreaming }),
  setError: (error) => set({ error }),
  clear: () =>
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      error: null,
      lastUsage: null,
    }),
}));
