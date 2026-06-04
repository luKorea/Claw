/**
 * Chat engine (v1.3 重构)
 *
 * 把 useChat 的多轮 tool_use 状态机从 hook 抽到 lib,语义层独立。
 * 暴露 `runChatTurn(ctx)` 作为 AsyncGenerator,消费方只关心 event 流。
 *
 * 设计动机:
 * - useChat 之前 280 行,业务逻辑(请求拼装、tool 执行、消息合并)全在 hook 里,
 *   单元测试只能"用 renderHook mock 整个 SDK",覆盖不到核心循环。
 * - 抽成纯函数 generator 后,可以用一个 mock adapter 直接断言多轮 event 序列。
 * - 历史消息通过 ctx.history() 函数注入,绕开 React 闭包陷阱:
 *   round ≥ 2 时,即使外部 store 状态已变更,引擎也能拿到最新 messages。
 *
 * 调用方契约:
 * - 引擎**只 yield 事件**,不写 store。所有 store 副作用(append / update / persist)
 *   由 useChat 订阅 event 流并分发。
 * - engine 内部不抛非流式错误(除了 AbortError 透传),所有错误都走 event 流
 *   { type: 'error', message, recoverable }。
 */

import type { ChatMessage, ContentBlock, Usage } from '@/types/claude';
import type { ProviderId } from '@/types/providers';
import type { ToolDefinition } from '@/types/tool';
import {
  buildAdapterMessages,
  resolveAnthropicMaxTokens,
  selectAdapter,
  type AdapterRequest,
} from '@/lib/providers';
import { executeBuiltinTool } from '@/lib/tools/executor';

/** 引擎对外的事件流。一个 turn 可能 yield 几十个 delta 事件,直到 final_done。 */
export type EngineEvent =
  | { type: 'turn_start'; turn: number; messageId: string }
  | { type: 'text_delta'; messageId: string; text: string }
  | { type: 'thinking_delta'; messageId: string; thinking: string }
  | { type: 'tool_use_start'; messageId: string; id: string; name: string }
  | { type: 'tool_use_delta'; messageId: string; id: string; inputDelta: string }
  | { type: 'tool_use_end'; messageId: string; id: string; input: unknown }
  | { type: 'tool_executing'; toolUseId: string; name: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'turn_done'; turn: number; messageId: string; usage: Usage | null }
  | { type: 'final_done'; totalTurns: number; lastUsage: Usage | null }
  | { type: 'aborted' }
  | { type: 'error'; message: string; recoverable: boolean };

export interface ChatTurnContext {
  provider: ProviderId;
  apiKey: string;
  model: string;
  system?: string;
  thinking: { budget_tokens: number } | null;
  maxTokens: number;
  tools: ToolDefinition[];
  /** 拉取最新历史消息的闭包。引擎每轮都会调,绕闭包陷阱。 */
  history: () => ChatMessage[];
  /** 当前累积的 tool_result 缓冲(由 useChat 维护,引擎读) */
  toolResultsBuffer: ReadonlyArray<{
    tool_use_id: string;
    content: string;
    is_error: boolean;
  }>;
  /** 注入 tool_result 时使用的临时 assistant 消息 id 工厂 */
  nextAssistantId: () => string;
  signal: AbortSignal;
}

/** 单 turn 内最多允许的 tool_use 循环轮数(防失控)。 */
export const MAX_TOOL_ROUNDS = 5;

/**
 * 跑一个 user turn(可能多轮 tool_use)。
 *
 * - `turn_start` 携带本轮新 assistant 的 messageId(消费方在 store 里建占位)
 * - `text_delta` / `thinking_delta` 边收边 yield
 * - `tool_use_*` 三段式事件
 * - `tool_executing` / `tool_result` 表达"工具执行阶段"
 * - `turn_done` 表达"本轮 assistant 完成(可落库)"
 * - `final_done` 表达"整个 turn 结束"
 *
 * 错误处理:
 * - 同步抛错(参数缺失等)→ throw(调用方必须 try)
 * - 流式错误 → yield { type: 'error', ... }
 * - AbortSignal 触发 → yield { type: 'aborted' } 后 return
 */
export async function* runChatTurn(
  ctx: ChatTurnContext,
): AsyncGenerator<EngineEvent, void, void> {
  const adapter = selectAdapter(ctx.provider);
  let round = 0;
  let lastUsage: Usage | null = null;

  while (round < MAX_TOOL_ROUNDS) {
    round += 1;

    if (ctx.signal.aborted) {
      yield { type: 'aborted' };
      return;
    }

    const messageId = ctx.nextAssistantId();
    yield { type: 'turn_start', turn: round, messageId };

    // 历史消息 = store 最新 messages(过滤掉当前正在累积的 assistant 占位)
    const historyMessages = ctx.history().filter((m) => m.id !== messageId);

    // 拼 adapter 消息
    const messages = buildAdapterMessages(historyMessages, ctx.system);

    // 注入 tool_result(基于 contentBlock 形式)
    for (const tr of ctx.toolResultsBuffer) {
      messages.push({
        role: 'tool',
        content: tr.content,
        tool_call_id: tr.tool_use_id,
      });
    }

    // 过滤空 assistant(无 text / tool_calls 的)
    const cleanMessages = messages.filter(
      (m) =>
        !(
          m.role === 'assistant' &&
          typeof m.content === 'string' &&
          !m.content &&
          (!m.tool_calls || m.tool_calls.length === 0)
        ),
    );

    const req: AdapterRequest = {
      model: ctx.model,
      system: ctx.system,
      messages: cleanMessages,
      tools: ctx.tools,
      thinking: ctx.thinking,
      max_tokens: ctx.maxTokens,
    };

    const collected: ContentBlock[] = [];
    let usage: Usage | null = null;

    /**
     * 直接遍历 adapter stream,绕过 consumeStream 的合并:
     * 每个 delta 立刻 yield,保持 streaming 语义。
     * 用闭包变量收集"完整 blocks"用于 turn_done 时的落库。
     */
    try {
      const sdkStream = adapter.stream(req, ctx.apiKey, ctx.signal);
      for await (const ev of sdkStream) {
        switch (ev.type) {
          case 'text_delta': {
            const last = collected[collected.length - 1];
            if (last && last.type === 'text') {
              last.text += ev.text;
            } else {
              collected.push({ type: 'text', text: ev.text });
            }
            yield { type: 'text_delta', messageId, text: ev.text };
            break;
          }
          case 'thinking_delta': {
            const last = collected[collected.length - 1];
            if (last && last.type === 'thinking') {
              last.thinking += ev.thinking;
            } else {
              collected.push({ type: 'thinking', thinking: ev.thinking });
            }
            yield { type: 'thinking_delta', messageId, thinking: ev.thinking };
            break;
          }
          case 'tool_use_start': {
            collected.push({ type: 'tool_use', id: ev.id, name: ev.name, input: {} });
            yield { type: 'tool_use_start', messageId, id: ev.id, name: ev.name };
            break;
          }
          case 'tool_use_delta': {
            // 累积到 tool_use.input.__raw,跟 consumeStream 行为一致
            const tu = collected.find(
              (b): b is Extract<ContentBlock, { type: 'tool_use' }> =>
                b.type === 'tool_use' && b.id === ev.id,
            );
            if (tu) {
              const acc = tu.input as { __raw?: string };
              acc.__raw = (acc.__raw ?? '') + ev.input_delta;
            }
            yield {
              type: 'tool_use_delta',
              messageId,
              id: ev.id,
              inputDelta: ev.input_delta,
            };
            break;
          }
          case 'tool_use_end': {
            const tu = collected.find(
              (b): b is Extract<ContentBlock, { type: 'tool_use' }> =>
                b.type === 'tool_use' && b.id === ev.id,
            );
            if (tu) tu.input = ev.input;
            yield { type: 'tool_use_end', messageId, id: ev.id, input: ev.input };
            break;
          }
          case 'usage': {
            usage = { ...(usage ?? {}), ...ev.usage };
            break;
          }
          case 'done': {
            void ev.stopReason;
            break;
          }
          case 'error': {
            yield {
              type: 'error',
              message: ev.error.message,
              recoverable: true,
            };
            return;
          }
        }
      }
    } catch (err) {
      if (ctx.signal.aborted) {
        yield { type: 'aborted' };
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: 'error', message: msg, recoverable: true };
      return;
    }

    lastUsage = usage;
    yield { type: 'turn_done', turn: round, messageId, usage };

    // 检查 tool_use
    const toolUses = collected.filter(
      (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
    );

    if (toolUses.length === 0) {
      break;
    }

    // 执行工具(本函数不负责更新 toolResultsBuffer,只 yield 事件)
    for (const tu of toolUses) {
      yield { type: 'tool_executing', toolUseId: tu.id, name: tu.name };
      try {
        const r = await executeBuiltinTool(tu.name, tu.input);
        yield {
          type: 'tool_result',
          toolUseId: tu.id,
          content: r.content,
          isError: !r.ok,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        yield {
          type: 'tool_result',
          toolUseId: tu.id,
          content: msg,
          isError: true,
        };
      }
    }
    // 工具结果由 useChat 收集到 toolResultsBuffer,下一轮 round=2 时 history 注入
    // 因为 history() 是闭包,store 里的 messages 已被 useChat 同步追加 tool_result block
  }

  yield { type: 'final_done', totalTurns: round, lastUsage };
}

/**
 * 工具函数:把"事件流"在流式过程中产生的 assistant content,序列化为可落库形式。
 * 使用方在 `turn_done` 时调用,落库前统一。
 */
export function serializeAssistantContent(
  blocks: readonly ContentBlock[],
): { content: string; thinking: string | null; toolCalls: string | null } {
  return {
    content: JSON.stringify(blocks),
    thinking:
      blocks
        .filter((b): b is Extract<ContentBlock, { type: 'thinking' }> => b.type === 'thinking')
        .map((b) => b.thinking)
        .join('\n\n') || null,
    toolCalls:
      blocks.filter((b) => b.type === 'tool_use').length > 0
        ? JSON.stringify(blocks.filter((b) => b.type === 'tool_use'))
        : null,
  };
}

/**
 * 工具函数:resolveAnthropicMaxTokens 的封装 + 通用 maxTokens fallback。
 * 抽到 engine 里避免 useChat 重复 import。
 */
export function resolveMaxTokens(
  provider: ProviderId,
  thinking: { budget_tokens: number } | null,
): number {
  return provider === 'anthropic' ? resolveAnthropicMaxTokens(thinking) : 8192;
}
