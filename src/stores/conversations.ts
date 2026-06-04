import { create } from 'zustand';

import type { Conversation } from '@/types/conversation';

export interface ConversationsState {
  list: Conversation[];
  currentId: string | null;
  loading: boolean;

  setList: (list: Conversation[]) => void;
  setCurrent: (id: string | null) => void;
  upsert: (conv: Conversation) => void;
  remove: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useConversationsStore = create<ConversationsState>((set) => ({
  list: [],
  currentId: null,
  loading: false,

  setList: (list) => set({ list }),
  setCurrent: (currentId) => set({ currentId }),
  upsert: (conv) =>
    set((s) => {
      const existing = s.list.findIndex((c) => c.id === conv.id);
      if (existing === -1) {
        return { list: [conv, ...s.list] };
      }
      const next = s.list.slice();
      next[existing] = conv;
      return { list: next };
    }),
  remove: (id) =>
    set((s) => ({
      list: s.list.filter((c) => c.id !== id),
      currentId: s.currentId === id ? null : s.currentId,
    })),
  setLoading: (loading) => set({ loading }),
}));
