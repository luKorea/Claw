/**
 * Provider Adapter 工厂 (v1.1+)
 *
 * 维护静态 ProviderAdapter 单例 + 快捷选择函数。
 */

import { anthropicAdapter } from '@/lib/providers/anthropic';
import { deepseekAdapter } from '@/lib/providers/deepseek';
import { openaiAdapter } from '@/lib/providers/openai';
import { minimaxiAdapter } from '@/lib/providers/minimaxi';
import { CustomProviderAdapter } from '@/lib/providers/custom';
import { getCustomProvider } from '@/stores/customProviders';
import type { ProviderAdapter } from '@/lib/providers/types';
import { isCustomProviderId, type ProviderId, type StaticProviderId } from '@/types/providers';

export const PROVIDER_ADAPTERS: Record<StaticProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  deepseek: deepseekAdapter,
  openai: openaiAdapter,
  minimaxi: minimaxiAdapter,
};

export function selectAdapter(provider: ProviderId): ProviderAdapter {
  if (isCustomProviderId(provider)) {
    const customProvider = getCustomProvider(provider);
    if (!customProvider || !customProvider.enabled) {
      throw new Error(`自定义模型不存在或已禁用: ${provider}`);
    }
    return new CustomProviderAdapter(customProvider);
  }
  return PROVIDER_ADAPTERS[provider];
}

export type { ProviderAdapter, AdapterEvent, AdapterRequest, AdapterMessage } from './types';
export { buildAdapterMessages, chatMessageToAdapter } from './messages';
export { resolveAnthropicMaxTokens } from './anthropic';
