/**
 * 归一化流式事件消费器 (v1.1+)
 *
 * 接收 ProviderAdapter 的 AsyncIterable<AdapterEvent>,组装为 ContentBlock[] 列表。
 * 内部维护状态机: text / thinking / tool_use 累积;tool_use 在 end 时解析 JSON。
 */

import type { AdapterEvent } from '@/lib/providers/types';
import type { ContentBlock, Usage } from '@/types/claude';

export interface StreamCallbacks {
  onText: (delta: string) => void;
  onThinking: (delta: string) => void;
  onToolUse: (block: { id: string; name: string; input: unknown }) => void;
  onUsage: (usage: Usage) => void;
  onDone: (blocks: ContentBlock[], stopReason: string | null) => void;
  onError: (err: Error) => void;
}

export async function consumeStream(
  stream: AsyncIterable<AdapterEvent>,
  cb: StreamCallbacks,
): Promise<void> {
  const blocks: ContentBlock[] = [];
  let currentTextIndex = -1;
  let currentThinkingIndex = -1;
  const toolIndexById = new Map<string, number>();
  const stopReason: string | null = null;
  let usage: Usage | null = null;

  try {
    for await (const event of stream) {
      switch (event.type) {
        case 'text_delta': {
          if (currentTextIndex < 0) {
            currentTextIndex = blocks.length;
            blocks.push({ type: 'text', text: event.text });
          } else {
            const blk = blocks[currentTextIndex];
            if (blk.type === 'text') blk.text += event.text;
          }
          cb.onText(event.text);
          break;
        }
        case 'thinking_delta': {
          if (currentThinkingIndex < 0) {
            currentThinkingIndex = blocks.length;
            blocks.push({ type: 'thinking', thinking: event.thinking });
          } else {
            const blk = blocks[currentThinkingIndex];
            if (blk.type === 'thinking') blk.thinking += event.thinking;
          }
          cb.onThinking(event.thinking);
          break;
        }
        case 'tool_use_start': {
          // 先 flush 之前的 text/thinking block
          currentTextIndex = -1;
          currentThinkingIndex = -1;
          const idx = blocks.length;
          toolIndexById.set(event.id, idx);
          blocks.push({ type: 'tool_use', id: event.id, name: event.name, input: {} });
          break;
        }
        case 'tool_use_delta': {
          // JSON 字符串累积在 tool_use.input.__raw 上;不立即回调
          const idx = toolIndexById.get(event.id);
          if (idx !== undefined) {
            const blk = blocks[idx];
            if (blk.type === 'tool_use') {
              const acc = blk.input as { __raw?: string };
              acc.__raw = (acc.__raw ?? '') + event.input_delta;
            }
          }
          break;
        }
        case 'tool_use_end': {
          const idx = toolIndexById.get(event.id);
          if (idx !== undefined) {
            const blk = blocks[idx];
            if (blk.type === 'tool_use') {
              blk.input = event.input;
              cb.onToolUse({ id: blk.id, name: blk.name, input: event.input });
            }
            toolIndexById.delete(event.id);
          }
          break;
        }
        case 'usage': {
          // 合并:后到的覆盖
          usage = { ...(usage ?? {}), ...event.usage };
          cb.onUsage(usage);
          break;
        }
        case 'done': {
          cb.onDone(blocks, event.stopReason);
          return;
        }
        case 'error': {
          cb.onError(event.error);
          return;
        }
      }
    }
    // 流自然结束(没有 done 事件,如 OAI [DONE] 后没显式 done)
    cb.onDone(blocks, stopReason);
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
