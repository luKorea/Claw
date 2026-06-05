/**
 * useChat hook (v1.3 重构)
 *
 * 业务层只负责"事件订阅 + 副作用分发":
 * - `send(opts)` 准备 ctx,启动 `runChatTurn(ctx)` generator
 * - `for await` 消费 event,根据 type 调 store action / 落库 / 收集 tool_result
 * - 跨 await 用 `useChatStore.getState()` 拿最新,绕闭包
 * - 暴露 { send, cancel, isStreaming, error },messages 由组件自己 selector
 */

import { useCallback, useRef } from 'react';

import { useChatStore } from '@/stores/chat';
import { useConversationsStore } from '@/stores/conversations';
import { useSettingsStore } from '@/stores/settings';
import {
  getCustomProvider,
  listEnabledCustomProviders,
} from '@/stores/customProviders';
import { useToolsStore } from '@/stores/tools';
import { now, uuid } from '@/lib/utils';
import { getApiKey, listConfiguredProviders } from '@/lib/keyring';
import { filterEnabled } from '@/lib/tools/builtin';
import { conversationApi, messageApi } from '@/lib/db';
import {
  getModelInfo,
  getProviderOfModel,
  isCustomProviderId,
  resolveConfiguredModel,
} from '@/types/providers';
import type { ChatMessage, ContentBlock, Usage } from '@/types/claude';
import {
  runChatTurn,
  resolveMaxTokens,
  serializeAssistantContent,
  type EngineEvent,
} from '@/lib/chat-engine';

export interface SendOptions {
  text: string;
  model?: string;
  system?: string | null;
  thinkingEnabled?: boolean;
  thinkingBudget?: number;
}

interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

export function useChat() {
  // v1.3:细粒度 selector,避免整 store 订阅
  const isStreaming = useChatStore((s) => s.isStreaming);
  const error = useChatStore((s) => s.error);

  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sendingRef.current = false;
    useChatStore.getState().setStreaming(false);
  }, []);

  const send = useCallback(async (opts: SendOptions) => {
    const text = opts.text.trim();
    if (!text) return;
    if (sendingRef.current) {
      throw new Error('正在处理上一条消息，请稍候');
    }

    // 1. 解析 model / provider / key
    const chatState = useChatStore.getState();
    let conversationId = useChatStore.getState().conversationId;
    let conv = useConversationsStore
      .getState()
      .list.find((c) => c.id === conversationId) ?? null;

    const settings = useSettingsStore.getState();
    const configuredProviders = new Set(await listConfiguredProviders());
    const enabledCustomProviders = listEnabledCustomProviders();
    if (configuredProviders.size === 0 && enabledCustomProviders.length === 0) {
      const msg = '请先配置至少一个 Provider API Key';
      chatState.setError(msg);
      throw new Error(msg);
    }

    const preferredModel = opts.model ?? conv?.model ?? settings.defaultModel;
    const preferredCustomProvider = isCustomProviderId(preferredModel)
      ? getCustomProvider(preferredModel)
      : null;
    const model =
      preferredCustomProvider?.enabled
        ? preferredCustomProvider.id
        : resolveConfiguredModel(preferredModel, configuredProviders) ??
          enabledCustomProviders[0]?.id ??
          null;
    if (!model) {
      const msg = '请先配置至少一个 Provider API Key';
      chatState.setError(msg);
      throw new Error(msg);
    }
    if (model !== settings.defaultModel && !opts.model && !conv) {
      settings.setDefaultModel(model);
    }

    const modelInfo = getModelInfo(model);
    const customProvider = isCustomProviderId(model) ? getCustomProvider(model) : null;
    const provider = customProvider?.id ?? (modelInfo ? modelInfo.provider : getProviderOfModel(model));
    if (!provider) {
      chatState.setError(`未知模型: ${model}`);
      throw new Error(`未知模型: ${model}`);
    }

    let apiKey: string;
    try {
      apiKey = await getApiKey(provider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未配置 API Key';
      useChatStore.getState().setError(msg);
      throw err;
    }

    // 2. 确保有当前会话
    if (!conv) {
      const created = await conversationApi.create({
        title: text.slice(0, 20),
        model,
        system_prompt: opts.system ?? null,
        thinking_enabled: opts.thinkingEnabled ?? settings.defaultThinkingEnabled,
        thinking_budget: opts.thinkingBudget ?? settings.defaultThinkingBudget,
      });
      useConversationsStore.getState().upsert(created);
      useConversationsStore.getState().setCurrent(created.id);
      useChatStore.getState().setConversation(created.id, []);
      conversationId = created.id;
      conv = created;
    } else if (
      opts.model ||
      model !== conv.model ||
      opts.system !== undefined ||
      opts.thinkingEnabled !== undefined ||
      opts.thinkingBudget !== undefined
    ) {
      const patch: Parameters<typeof conversationApi.update>[0] = { id: conv.id };
      if (opts.model || model !== conv.model) patch.model = model;
      if (opts.system !== undefined) patch.system_prompt = opts.system;
      if (opts.thinkingEnabled !== undefined) patch.thinking_enabled = opts.thinkingEnabled;
      if (opts.thinkingBudget !== undefined) patch.thinking_budget = opts.thinkingBudget;
      await conversationApi.update(patch);
      const refreshed = await conversationApi.get(conv.id);
      useConversationsStore.getState().upsert(refreshed);
      conv = refreshed;
    }

    sendingRef.current = true;
    useChatStore.getState().setStreaming(true);
    useChatStore.getState().setError(null);

    // 3. user message
    const userMsg: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt: now(),
    };
    useChatStore.getState().appendMessage(userMsg);
    if (conversationId) {
      await messageApi
        .save({
          id: userMsg.id,
          conversation_id: conversationId,
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
    const thinkingBudget =
      opts.thinkingBudget ?? conv.thinking_budget ?? useSettingsStore.getState().defaultThinkingBudget;
    const system = opts.system ?? conv.system_prompt ?? undefined;
    const supportsThinking = customProvider?.supportsThinking ?? modelInfo?.supportsThinking ?? false;
    const thinking =
      thinkingEnabled && supportsThinking ? { budget_tokens: thinkingBudget } : null;

    const enabledTools = filterEnabled(useToolsStore.getState().disabled);
    const controller = new AbortController();
    abortRef.current = controller;

    // 4. 订阅 event 流
    let lastAssistantId: string | null = null;
    let lastUsage: Usage | null = null;
    try {
      const gen = runChatTurn({
        provider,
        apiKey,
        model,
        system,
        thinking,
        maxTokens: resolveMaxTokens(provider, thinking),
        tools: enabledTools,
        history: () => useChatStore.getState().messages,
        nextAssistantId: () => uuid(),
        signal: controller.signal,
      });

      for await (const ev of gen) {
        await handleEngineEvent(ev, {
          onToolResult: (tr) => {
            // 写进当前 assistant message content,用于 UI 展示和下一轮协议转换:
            // providers/messages 会把它拆成独立 role=tool,而不是作为 assistant content 发送。
            if (lastAssistantId) {
              useChatStore.getState().appendContentBlock(lastAssistantId, {
                type: 'tool_result',
                tool_use_id: tr.tool_use_id,
                content: tr.content,
                is_error: tr.is_error,
              });
            }
          },
          onPersist: (blocks) => {
            const assistantId = lastAssistantId;
            const convId = conversationId;
            if (assistantId && convId) {
              const { content, thinking: t, toolCalls } = serializeAssistantContent(blocks);
              void messageApi
                .remove(assistantId)
                .catch(() => {})
                .then(() =>
                  messageApi.save({
                    id: assistantId,
                    conversation_id: convId,
                    role: 'assistant',
                    content,
                    thinking: t,
                    tool_calls: toolCalls,
                    tool_results: null,
                    model,
                    usage: lastUsage ? JSON.stringify(lastUsage) : null,
                  }),
                )
                .catch((e) => console.warn('save assistant message failed', e));
            }
          },
        });
        if (ev.type === 'turn_start') {
          lastAssistantId = ev.messageId;
        } else if (ev.type === 'turn_done') {
          lastUsage = ev.usage;
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        useChatStore.getState().setError(msg);
      }
      if (lastAssistantId) {
        useChatStore
          .getState()
          .updateMessage(lastAssistantId, (m) => ({ ...m, streaming: false }));
      }
    } finally {
      sendingRef.current = false;
      abortRef.current = null;
      useChatStore.getState().setStreaming(false);
      // 触发 session 列表 updated_at 刷新
      if (conversationId) {
        try {
          const refreshed = await conversationApi.get(conversationId);
          useConversationsStore.getState().upsert(refreshed);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  return { send, cancel, isStreaming, error };
}

/**
 * 把 engine event 翻译成 store 副作用。
 * 抽成单独函数,便于单测 + 主流程更线性。
 */
async function handleEngineEvent(
  ev: EngineEvent,
  hooks: {
    onToolResult: (tr: ToolResult) => void;
    onPersist: (blocks: ContentBlock[]) => void;
  },
): Promise<void> {
  const store = useChatStore.getState();
  switch (ev.type) {
    case 'turn_start': {
      // 在 store 里建 assistant 占位
      store.appendMessage({
        id: ev.messageId,
        role: 'assistant',
        content: [],
        streaming: true,
        createdAt: now(),
      });
      return;
    }
    case 'text_delta': {
      // 第一个 delta 用 append,后续用 update 合并
      const msg = store.messages.find((m) => m.id === ev.messageId);
      if (!msg) return;
      const hasText = msg.content.some((b) => b.type === 'text');
      if (!hasText) {
        store.appendContentBlock(ev.messageId, { type: 'text', text: ev.text });
      } else {
        store.updateMessage(ev.messageId, (m) => {
          const next = m.content.slice();
          const idx = next.findIndex((b) => b.type === 'text');
          if (idx >= 0) {
            const cur = next[idx];
            if (cur.type === 'text') {
              next[idx] = { type: 'text', text: cur.text + ev.text };
            }
          }
          return { ...m, content: next };
        });
      }
      return;
    }
    case 'thinking_delta': {
      const msg = store.messages.find((m) => m.id === ev.messageId);
      if (!msg) return;
      const hasT = msg.content.some((b) => b.type === 'thinking');
      if (!hasT) {
        store.appendContentBlock(ev.messageId, { type: 'thinking', thinking: ev.thinking });
      } else {
        store.updateMessage(ev.messageId, (m) => {
          const next = m.content.slice();
          const idx = next.findIndex((b) => b.type === 'thinking');
          if (idx >= 0) {
            const cur = next[idx];
            if (cur.type === 'thinking') {
              next[idx] = { type: 'thinking', thinking: cur.thinking + ev.thinking };
            }
          }
          return { ...m, content: next };
        });
      }
      return;
    }
    case 'tool_use_start': {
      store.appendContentBlock(ev.messageId, { type: 'tool_use', id: ev.id, name: ev.name, input: {} });
      return;
    }
    case 'tool_use_end': {
      store.updateMessage(ev.messageId, (m) => {
        const next = m.content.map((b) =>
          b.type === 'tool_use' && b.id === ev.id ? { ...b, input: ev.input } : b,
        );
        return { ...m, content: next };
      });
      return;
    }
    case 'turn_done': {
      store.finalizeMessage(ev.messageId, ev.usage);
      const msg = store.messages.find((m) => m.id === ev.messageId);
      if (msg) hooks.onPersist(msg.content);
      return;
    }
    case 'tool_result': {
      hooks.onToolResult({
        tool_use_id: ev.toolUseId,
        content: ev.content,
        is_error: ev.isError,
      });
      return;
    }
    case 'error': {
      store.setError(ev.message);
      return;
    }
    case 'aborted':
    case 'final_done':
    case 'tool_executing':
    case 'tool_use_delta':
      // 引擎内部细节,useChat 暂不消费
      return;
  }
}
