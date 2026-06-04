/**
 * OpenAI Provider Adapter
 *
 * 走原生 OpenAI Chat Completions 协议。
 * GPT-5 系列支持 reasoning_effort (v1.1 暂不暴露 UI,内部用 max_tokens 即可)。
 */

import { OpenAICompatAdapter } from '@/lib/providers/openai-compatible';
import type { ProviderAdapter } from '@/lib/providers/types';

class OpenAIAdapter extends OpenAICompatAdapter {
  constructor() {
    super('openai', {
      baseUrl: 'https://api.openai.com/v1',
      keyPrefix: 'sk',
      providerLabel: 'OpenAI',
    });
  }
}

export const openaiAdapter: ProviderAdapter = new OpenAIAdapter();
