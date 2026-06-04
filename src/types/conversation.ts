/** 与 Rust 端 Conversation 一一对应 */
export interface Conversation {
  id: string;
  title: string;
  /** 模型 id 字符串,跨 provider */
  model: string;
  system_prompt: string | null;
  thinking_enabled: number; // 0 | 1
  thinking_budget: number | null;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: 'user' | 'assistant';
  content: string; // JSON of ContentBlock[]
  thinking: string | null;
  tool_calls: string | null; // JSON
  tool_results: string | null; // JSON
  model: string | null;
  usage: string | null; // JSON
  created_at: number;
}

export interface NewConversationInput {
  title: string;
  model: string;
  system_prompt?: string | null;
  thinking_enabled: boolean;
  thinking_budget?: number | null;
}

export interface UpdateConversationInput {
  id: string;
  title?: string;
  model?: string;
  system_prompt?: string | null;
  thinking_enabled?: boolean;
  thinking_budget?: number | null;
}

export interface NewMessageInput {
  id: string;
  conversation_id: string;
  parent_id?: string | null;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string | null;
  tool_calls?: string | null;
  tool_results?: string | null;
  model?: string | null;
  usage?: string | null;
}
