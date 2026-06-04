/**
 * Provider Adapter 工厂 (v1.1+)
 *
 * 维护静态 ProviderAdapter 单例 + 快捷选择函数。
 */

import { anthropicAdapter } from '@/lib/providers/anthropic';
import { deepseekAdapter } from '@/lib/providers/deepseek';
import { openaiAdapter } from '@/lib/providers/openai';
import { minimaxiAdapter } from '@/lib/providers/minimaxi';
import type { ProviderAdapter } from '@/lib/providers/types';
import type { ProviderId } from '@/types/providers';

export const PROVIDER_ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  deepseek: deepseekAdapter,
  openai: openaiAdapter,
  minimaxi: minimaxiAdapter,
};

export function selectAdapter(provider: ProviderId): ProviderAdapter {
  return PROVIDER_ADAPTERS[provider];
}

export type { ProviderAdapter, AdapterEvent, AdapterRequest, AdapterMessage } from './types';
export { buildAdapterMessages, chatMessageToAdapter } from './messages';
export { resolveAnthropicMaxTokens } from './anthropic';
