/**
 * DeepSeek Provider Adapter
 *
 * 走 OpenAI 兼容协议,baseURL 固定。
 * DeepSeek-R1 走 `reasoning_content` 字段流式回 reasoning。
 */

import { OpenAICompatAdapter } from '@/lib/providers/openai-compatible';
import type { ProviderAdapter } from '@/lib/providers/types';

class DeepSeekAdapter extends OpenAICompatAdapter {
  constructor() {
    super('deepseek', {
      baseUrl: 'https://api.deepseek.com',
      keyPrefix: 'sk',
      providerLabel: 'DeepSeek',
    });
  }
}

export const deepseekAdapter: ProviderAdapter = new DeepSeekAdapter();
