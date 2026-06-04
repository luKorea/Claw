/**
 * MiniMax (minimaxi) Provider Adapter
 *
 * **走 Anthropic 兼容协议**(`POST /anthropic/v1/messages`),**不**走 OpenAI 兼容协议。
 * 复用 `AnthropicAdapter` 同一份 SDK 逻辑,只换 baseURL。
 *
 * 历史:之前误把 MiniMax 当 OpenAI 兼容,baseURL 写 `https://api.minimax.io/v1`,
 * 发 `Authorization: Bearer <key>`,但 MiniMax 在 `/v1/chat/completions` 走的是另一套
 * (用 `eyJ...` JWT key)。实际 **用户拿的 key 是 `sk-cp-...` 格式**,只能走
 * `/anthropic/v1/messages`,用 `X-Api-Key` 头(SDK 默认就发 x-api-key)。
 *
 * 协议层 100% 兼容 Anthropic(content_block_start/thinking/tool_use 全套),
 * context7 OpenAPI 已确认。
 */

import { AnthropicAdapter } from '@/lib/providers/anthropic';
import type { ProviderAdapter } from '@/lib/providers/types';

class MiniMaxIAdapter extends AnthropicAdapter {
  constructor() {
    super('minimaxi', {
      // SDK 拼 /v1/messages → 实际 https://api.minimaxi.com/anthropic/v1/messages
      baseURL: 'https://api.minimaxi.com/anthropic',
      // key 格式: `sk-cp-...`(用户实测),不是 eyJ
      validateKey: (key) => {
        if (!key) return { ok: false, reason: 'API Key 不能为空' };
        if (!key.startsWith('sk-')) {
          return { ok: false, reason: 'MiniMax API Key 应该以 sk- 开头' };
        }
        return { ok: true };
      },
      // 与 anthropic 走同一前缀(Anthropic 风格)
      keyPrefix: 'sk-',
      providerLabel: 'MiniMax',
    });
  }
}

export const minimaxiAdapter: ProviderAdapter = new MiniMaxIAdapter();
