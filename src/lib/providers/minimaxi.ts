/**
 * MiniMax (minimaxi) Provider Adapter
 *
 * 走 OpenAI 兼容协议,baseURL 固定 https://api.minimaxi.com/v1。
 * M2.7 系列支持 `reasoning_content` 字段流式回 reasoning,
 * 与 DeepSeek-R1 走同一 AdapterEvent `thinking_delta` 通道。
 *
 * Key 格式:sk-cp- 前缀(与 Anthropic / OpenAI 一致)。
 */

import { OpenAICompatAdapter } from '@/lib/providers/openai-compatible';
import type { ProviderAdapter } from '@/lib/providers/types';

class MiniMaxIAdapter extends OpenAICompatAdapter {
  constructor() {
    super('minimaxi', {
      baseUrl: 'https://api.minimaxi.com/v1',
      keyPrefix: 'sk',
      providerLabel: 'MiniMax',
    });
  }
}

export const minimaxiAdapter: ProviderAdapter = new MiniMaxIAdapter();
