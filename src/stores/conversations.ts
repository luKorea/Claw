import { create } from 'zustand';

import type { Conversation } from '@/types/conversation';
import { useChatStore } from '@/stores/chat';

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

/**
 * v1.3:stable sort by `updated_at` desc。
 *
 * - 同 `updated_at` 时保持原相对顺序(避免 React key 抖动)。
 * - 用展开副本 + 索引比对代替 `splice`,保证原数组不被修改。
 */
function sortByUpdatedAtDesc(list: Conversation[]): Conversation[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      if (b.c.updated_at !== a.c.updated_at) return b.c.updated_at - a.c.updated_at;
      return a.i - b.i;
    })
    .map(({ c }) => c);
}

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  list: [],
  currentId: null,
  loading: false,

  setList: (list) => set({ list: sortByUpdatedAtDesc(list) }),
  setCurrent: (currentId) => set({ currentId }),
  upsert: (conv) =>
    set((s) => {
      const existing = s.list.findIndex((c) => c.id === conv.id);
      let next: Conversation[];
      if (existing === -1) {
        next = [conv, ...s.list];
      } else {
        next = s.list.slice();
        next[existing] = conv;
      }
      return { list: sortByUpdatedAtDesc(next) };
    }),
  remove: (id) => {
    const wasCurrent = get().currentId === id;
    set((s) => ({
      list: s.list.filter((c) => c.id !== id),
      currentId: wasCurrent ? null : s.currentId,
    }));
    // v1.3:删除当前会话时,同步清空 chat store(避免残留消息 + 当前会话指向 null 时显示错误)
    if (wasCurrent) {
      useChatStore.getState().clear();
    }
  },
  setLoading: (loading) => set({ loading }),
}));
