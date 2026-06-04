/**
 * ChatMessage ↔ AdapterMessage 转换 (provider-agnostic)
 *
 * 前端 `ChatMessage` 维持当前 `ContentBlock[]` 形态,不做破坏性改动。
 * 此模块负责把 ChatMessage 序列化成 AdapterMessage,各 adapter 内部再转各 provider 协议。
 */

import type { ChatMessage, ContentBlock } from '@/types/claude';
import type { AdapterMessage } from '@/lib/providers/types';

/** 把 ContentBlock[] 序列化成 AdapterMessage (单条 user/assistant) */
export function chatMessageToAdapter(m: ChatMessage): AdapterMessage[] {
  if (m.role === 'user') {
    // tool_result 在 Anthropic 是 user turn 内容;在 OAI 兼容是 role='tool' 单独 message
    // 这里拆开,交给 adapter 决定合并
    const toolResults = m.content.filter(
      (b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result',
    );
    const textBlocks = m.content.filter((b) => b.type === 'text');

    const result: AdapterMessage[] = [];

    // 主 user 内容(仅文本)
    if (textBlocks.length > 0) {
      const text = textBlocks.map((b) => (b.type === 'text' ? b.text : '')).join('');
      result.push({ role: 'user', content: text });
    }

    // 每个 tool_result 拆成独立 tool 消息(OAI 协议需要),Anthropic adapter 会合回 user turn
    for (const tr of toolResults) {
      result.push({
        role: 'tool',
        content: tr.content,
        tool_call_id: tr.tool_use_id,
      });
    }

    return result;
  }

  // assistant: 把 tool_use 转成 tool_calls
  const text = m.content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const thinking = m.content
    .filter((b): b is Extract<ContentBlock, { type: 'thinking' }> => b.type === 'thinking')
    .map((b) => b.thinking)
    .join('');
  const toolUses = m.content.filter(
    (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
  );

  // thinking 内容只用于流式回显,进 adapter request 时不带(reasoning 走专用 thinking 块)
  void thinking;

  const result: AdapterMessage = {
    role: 'assistant',
    content: text,
    tool_calls: toolUses.map((tu) => ({
      id: tu.id,
      name: tu.name,
      arguments: tu.input,
    })),
  };

  return [result];
}

/**
 * 把 ChatMessage[] 拼成 AdapterMessage[],处理 system prompt。
 * - system: 取第一个非空 system_prompt(或最近一次)
 * - 历史 messages: 按时间顺序展开
 */
export function buildAdapterMessages(
  history: ChatMessage[],
  systemPrompt?: string,
): AdapterMessage[] {
  const out: AdapterMessage[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    out.push({ role: 'system', content: systemPrompt });
  }
  for (const m of history) {
    out.push(...chatMessageToAdapter(m));
  }
  return out;
}
