import { useCallback, useRef } from 'react';

import { useChatStore } from '@/stores/chat';
import { useConversationsStore } from '@/stores/conversations';
import { useSettingsStore } from '@/stores/settings';
import { useToolsStore } from '@/stores/tools';
import { now, uuid } from '@/lib/utils';

import {
  buildAdapterMessages,
  resolveAnthropicMaxTokens,
  selectAdapter,
  type AdapterRequest,
} from '@/lib/providers';
import { consumeStream } from '@/lib/streaming';
import { conversationApi, messageApi } from '@/lib/db';
import { getApiKey } from '@/lib/keyring';
import { filterEnabled } from '@/lib/tools/builtin';
import { executeBuiltinTool } from '@/lib/tools/executor';

import type { ChatMessage, ContentBlock, Usage } from '@/types/claude';
import { getModelInfo, getProviderOfModel } from '@/types/providers';

export interface SendOptions {
  text: string;
  model?: string;
  system?: string | null;
  thinkingEnabled?: boolean;
  thinkingBudget?: number;
}

const MAX_TOOL_ROUNDS = 5;

export function useChat() {
  const chat = useChatStore();
  // 用 selector 拿稳定引用,避免整个 store 变化触发 useCallback/useEffect 重算
  const conversationsList = useConversationsStore((s) => s.list);
  const upsertConv = useConversationsStore((s) => s.upsert);
  const setCurrentConv = useConversationsStore((s) => s.setCurrent);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const defaultThinking = useSettingsStore((s) => s.defaultThinkingEnabled);
  const defaultBudget = useSettingsStore((s) => s.defaultThinkingBudget);
  const disabledTools = useToolsStore((s) => s.disabled);

  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sendingRef.current = false;
    chat.setStreaming(false);
  }, [chat]);

  const send = useCallback(
    async (opts: SendOptions) => {
      const text = opts.text.trim();
      if (!text) return;
      if (sendingRef.current) {
        throw new Error('正在处理上一条消息,请稍候');
      }

      // 解析 model 与 provider
      const model = opts.model ?? defaultModel;
      const modelInfo = getModelInfo(model);
      const provider = modelInfo ? modelInfo.provider : getProviderOfModel(model);
      if (!provider) {
        chat.setError(`未知模型: ${model}`);
        throw new Error(`未知模型: ${model}`);
      }

      // 取 key
      let apiKey: string;
      try {
        apiKey = await getApiKey(provider);
      } catch (err) {
        chat.setError(err instanceof Error ? err.message : '未配置 API Key');
        throw err;
      }

      // 确保有当前会话
      let conversationId = chat.conversationId;
      let conv = conversationsList.find((c) => c.id === conversationId) ?? null;
      if (!conv) {
        const created = await conversationApi.create({
          title: text.slice(0, 20),
          model,
          system_prompt: opts.system ?? null,
          thinking_enabled: opts.thinkingEnabled ?? defaultThinking,
          thinking_budget: opts.thinkingBudget ?? defaultBudget,
        });
        upsertConv(created);
        setCurrentConv(created.id);
        chat.setConversation(created.id, []);
        conversationId = created.id;
        conv = created;
      } else if (opts.model || opts.system !== undefined || opts.thinkingEnabled !== undefined) {
        const patch: Parameters<typeof conversationApi.update>[0] = { id: conv.id };
        if (opts.model) patch.model = opts.model;
        if (opts.system !== undefined) patch.system_prompt = opts.system;
        if (opts.thinkingEnabled !== undefined) patch.thinking_enabled = opts.thinkingEnabled;
        if (opts.thinkingBudget !== undefined) patch.thinking_budget = opts.thinkingBudget;
        await conversationApi.update(patch);
        const refreshed = await conversationApi.get(conv.id);
        upsertConv(refreshed);
        conv = refreshed;
      }

      sendingRef.current = true;
      chat.setStreaming(true);
      chat.setError(null);

      // 1. user message
      const userMsg: ChatMessage = {
        id: uuid(),
        role: 'user',
        content: [{ type: 'text', text }],
        createdAt: now(),
      };
      chat.appendMessage(userMsg);
      const convId = conversationId;
      if (convId) {
        await messageApi
          .save({
            id: userMsg.id,
            conversation_id: convId,
            role: 'user',
            content: JSON.stringify(userMsg.content),
            thinking: null,
            tool_calls: null,
            tool_results: null,
            model: null,
            usage: null,
          })
          .catch((e) => console.warn('save user message failed', e));
      }

      const thinkingEnabled = opts.thinkingEnabled ?? Boolean(conv.thinking_enabled);
      const thinkingBudget = opts.thinkingBudget ?? conv.thinking_budget ?? defaultBudget;
      const system = opts.system ?? conv.system_prompt ?? undefined;

      const enabledTools = filterEnabled(disabledTools);
      const adapter = selectAdapter(provider);
      const controller = new AbortController();
      abortRef.current = controller;

      let round = 0;

      // 当前累积的 assistant 消息
      let currentAssistant: ChatMessage = createAssistantPlaceholder(model);
      chat.appendMessage(currentAssistant);

      // 工具结果累积(每轮更新)
      const toolResultsBuffer: Array<{
        tool_use_id: string;
        content: string;
        is_error: boolean;
      }> = [];

      try {
        while (round < MAX_TOOL_ROUNDS) {
          round += 1;

          // 构造 messages
          const historyMessages = chat.messages
            .filter((m) => m.id !== currentAssistant.id || toolResultsBuffer.length > 0)
            .concat(
              toolResultsBuffer.length > 0
                ? ([
                    {
                      id: uuid(),
                      role: 'assistant' as const,
                      content: [],
                      createdAt: now(),
                    },
                  ] as ChatMessage[])
                : [],
            );

          // 工具结果注入为独立 tool 消息(由 adapter 决定合并方式)
          const messages = buildAdapterMessages(historyMessages, system);

          // 注入 tool_result(基于 contentBlock 形式)
          for (const tr of toolResultsBuffer) {
            messages.push({
              role: 'tool',
              content: tr.content,
              tool_call_id: tr.tool_use_id,
            });
          }

          // 过滤空 assistant
          const cleanMessages = messages.filter(
            (m) => !(m.role === 'assistant' && typeof m.content === 'string' && !m.content && (!m.tool_calls || m.tool_calls.length === 0)),
          );

          // thinking 能力由 modelInfo 决定
          const supportsThinking = modelInfo?.supportsThinking ?? false;
          const thinking =
            thinkingEnabled && supportsThinking
              ? { budget_tokens: thinkingBudget }
              : null;

          const maxTokens =
            provider === 'anthropic' ? resolveAnthropicMaxTokens(thinking) : 8192;

          const req: AdapterRequest = {
            model,
            system,
            messages: cleanMessages,
            tools: enabledTools,
            thinking,
            max_tokens: maxTokens,
          };

          const collected: ContentBlock[] = [];
          let textIdx = -1;
          let thinkingIdx = -1;
          let usage: Usage | null = null;

          const sdkStream = adapter.stream(req, apiKey, controller.signal);

          await consumeStream(sdkStream, {
            onText: (delta) => {
              if (textIdx === -1) {
                chat.appendContentBlock(currentAssistant.id, { type: 'text', text: delta });
                textIdx = collected.length;
                collected.push({ type: 'text', text: delta });
              } else {
                collected[textIdx] = {
                  type: 'text',
                  text:
                    (collected[textIdx] as Extract<ContentBlock, { type: 'text' }>).text + delta,
                };
                chat.updateMessage(currentAssistant.id, (m) => mergeText(m, delta));
              }
            },
            onThinking: (delta) => {
              if (thinkingIdx === -1) {
                chat.appendContentBlock(currentAssistant.id, {
                  type: 'thinking',
                  thinking: delta,
                });
                thinkingIdx = collected.length;
                collected.push({ type: 'thinking', thinking: delta });
              } else {
                collected[thinkingIdx] = {
                  type: 'thinking',
                  thinking:
                    (collected[thinkingIdx] as Extract<ContentBlock, { type: 'thinking' }>)
                      .thinking + delta,
                };
                chat.updateMessage(currentAssistant.id, (m) => mergeThinking(m, delta));
              }
            },
            onToolUse: () => {
              // 内容已通过 streaming 累积,这里只是回调
            },
            onUsage: (u) => {
              usage = u;
            },
            onDone: (blocks) => {
              collected.length = 0;
              collected.push(...blocks);
            },
            onError: (err) => {
              throw err;
            },
          });

          // 检查是否有 tool_use
          const toolUses = collected.filter(
            (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
          );

          // 完成本轮 assistant 消息
          chat.finalizeMessage(currentAssistant.id, usage);

          // 落库当前 assistant
          const finalAssistant: ChatMessage = {
            ...currentAssistant,
            content: collected,
            streaming: false,
          };
          await persistMessage(finalAssistant, usage, convId ?? '');

          if (toolUses.length === 0) {
            break;
          }

          // 执行工具
          toolResultsBuffer.length = 0;
          for (const tu of toolUses) {
            const r = await executeBuiltinTool(tu.name, tu.input);
            toolResultsBuffer.push({
              tool_use_id: tu.id,
              content: r.content,
              is_error: !r.ok,
            });
          }

          // 创建新一轮 assistant 占位
          currentAssistant = createAssistantPlaceholder(model);
          chat.appendMessage(currentAssistant);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          chat.setError(null);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          chat.setError(msg);
        }
        chat.updateMessage(currentAssistant.id, (m) => ({ ...m, streaming: false }));
        sendingRef.current = false;
        abortRef.current = null;
        chat.setStreaming(false);
        return;
      }

      sendingRef.current = false;
      abortRef.current = null;
      chat.setStreaming(false);

      // 触发 session 列表 updated_at 刷新
      if (conversationId) {
        try {
          const refreshed = await conversationApi.get(conversationId);
          upsertConv(refreshed);
        } catch {
          // ignore
        }
      }
    },
    [chat, conversationsList, upsertConv, setCurrentConv, defaultModel, defaultThinking, defaultBudget, disabledTools],
  );

  return {
    send,
    cancel,
    isStreaming: chat.isStreaming,
    error: chat.error,
  };
}

function createAssistantPlaceholder(model: string): ChatMessage {
  return {
    id: uuid(),
    role: 'assistant',
    content: [],
    model,
    streaming: true,
    createdAt: now(),
  };
}

function mergeText(m: ChatMessage, delta: string): ChatMessage {
  const next = m.content.slice();
  const idx = next.findIndex((b) => b.type === 'text');
  if (idx === -1) {
    next.push({ type: 'text', text: delta });
  } else {
    const cur = next[idx];
    if (cur.type === 'text') {
      next[idx] = { type: 'text', text: cur.text + delta };
    }
  }
  return { ...m, content: next };
}

function mergeThinking(m: ChatMessage, delta: string): ChatMessage {
  const next = m.content.slice();
  const idx = next.findIndex((b) => b.type === 'thinking');
  if (idx === -1) {
    next.push({ type: 'thinking', thinking: delta });
  } else {
    const cur = next[idx];
    if (cur.type === 'thinking') {
      next[idx] = { type: 'thinking', thinking: cur.thinking + delta };
    }
  }
  return { ...m, content: next };
}

async function persistMessage(
  msg: ChatMessage,
  usage: Usage | null,
  conversationId: string,
): Promise<void> {
  await messageApi.remove(msg.id).catch(() => {});
  await messageApi.save({
    id: msg.id,
    conversation_id: conversationId, // 修复 v1.0 的空字符串 bug
    role: msg.role,
    content: JSON.stringify(msg.content),
    thinking:
      msg.content
        .filter((b): b is Extract<ContentBlock, { type: 'thinking' }> => b.type === 'thinking')
        .map((b) => b.thinking)
        .join('\n\n') || null,
    tool_calls:
      msg.content.filter((b) => b.type === 'tool_use').length > 0
        ? JSON.stringify(msg.content.filter((b) => b.type === 'tool_use'))
        : null,
    tool_results:
      msg.content.filter((b) => b.type === 'tool_result').length > 0
        ? JSON.stringify(msg.content.filter((b) => b.type === 'tool_result'))
        : null,
    model: msg.model ?? null,
    usage: usage ? JSON.stringify(usage) : null,
  });
}
