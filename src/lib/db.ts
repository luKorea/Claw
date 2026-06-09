import { invoke } from '@tauri-apps/api/core';

import type {
  Conversation,
  Message,
  NewConversationInput,
  NewMessageInput,
  UpdateConversationInput,
} from '@/types/conversation';

export const conversationApi = {
  list: () => invoke<Conversation[]>('list_conversations'),
  get: (id: string) => invoke<Conversation>('get_conversation', { id }),
  create: (input: NewConversationInput) =>
    invoke<Conversation>('create_conversation', { input }),
  update: (input: UpdateConversationInput) =>
    invoke<void>('update_conversation', { input }),
  remove: (id: string) => invoke<void>('delete_conversation', { id }),
  removeMany: (ids: string[]) => invoke<void>('delete_conversations', { ids }),
};

export const messageApi = {
  list: (conversationId: string) =>
    invoke<Message[]>('list_messages', { conversationId }),
  save: (input: NewMessageInput) => invoke<Message>('save_message', { input }),
  remove: (id: string) => invoke<void>('delete_message', { id }),
};
