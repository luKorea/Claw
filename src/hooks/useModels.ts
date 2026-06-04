/**
 * useModels hook (v1.2 Bug 3.2)
 *
 * 包装 useModelsStore + keyring,提供:
 * - `ids(provider)` — 拉取到的 model id 列表(可能空)
 * - `loading(provider)` / `error(provider)`
 * - `fetchProvider(provider)` — 24h 缓存,失败保留旧 ids
 * - `isModelKnown(id, provider)` — 合并查 ALL_MODELS ∪ ids(provider)
 */

import { useCallback } from 'react';

import { getApiKey, listProviderModels } from '@/lib/keyring';
import { CACHE_TTL_MS, useModelsStore } from '@/stores/models';
import {
  ALL_MODELS,
  MODEL_REGISTRY,
  type ProviderId,
} from '@/types/providers';

export interface UseModelsReturn {
  ids: (provider: ProviderId) => string[];
  loading: (provider: ProviderId) => boolean;
  error: (provider: ProviderId) => string | null;
  fetchProvider: (provider: ProviderId) => Promise<void>;
  isModelKnown: (id: string, provider: ProviderId) => boolean;
  /**
   * 合并(硬编码 + 动态)后,按 provider 分组的 model 列表(去重)。
   * 给 UI 层 Select 用。fallback 到 ALL_MODELS。
   */
  mergedModelsByProvider: () => Record<ProviderId, string[]>;
}

export function useModels(): UseModelsReturn {
  const byProvider = useModelsStore((s) => s.byProvider);
  const setIds = useModelsStore((s) => s.setIds);
  const setLoading = useModelsStore((s) => s.setLoading);
  const setError = useModelsStore((s) => s.setError);

  const ids = useCallback(
    (provider: ProviderId) => byProvider[provider].ids,
    [byProvider],
  );
  const loading = useCallback(
    (provider: ProviderId) => byProvider[provider].loading,
    [byProvider],
  );
  const error = useCallback(
    (provider: ProviderId) => byProvider[provider].error,
    [byProvider],
  );

  const fetchProvider = useCallback(
    async (provider: ProviderId) => {
      // 缓存命中:fetchedAt 在 TTL 内且 ids 非空 → 跳过
      const cur = useModelsStore.getState().byProvider[provider];
      if (
        cur.fetchedAt !== null &&
        Date.now() - cur.fetchedAt < CACHE_TTL_MS &&
        cur.ids.length > 0
      ) {
        return;
      }

      setLoading(provider, true);
      try {
        const apiKey = await getApiKey(provider);
        const fetched = await listProviderModels(provider, apiKey);
        setIds(provider, fetched);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(provider, msg);
        // ids 保留 fallback(空 + 旧 cache),不抛给 caller
      }
    },
    [setIds, setLoading, setError],
  );

  const isModelKnown = useCallback(
    (id: string, provider: ProviderId) => {
      // 硬编码白名单
      if (ALL_MODELS.some((m) => m.id === id && m.provider === provider)) return true;
      // 动态拉取缓存
      if (byProvider[provider].ids.includes(id)) return true;
      return false;
    },
    [byProvider],
  );

  const mergedModelsByProvider = useCallback(() => {
    const result = {} as Record<ProviderId, string[]>;
    for (const p of Object.keys(byProvider) as ProviderId[]) {
      const hardcoded = MODEL_REGISTRY[p].map((m) => m.id);
      const dynamic = byProvider[p].ids;
      // 动态优先(用户更可能用),去重
      result[p] = Array.from(new Set([...dynamic, ...hardcoded]));
    }
    return result;
  }, [byProvider]);

  return { ids, loading, error, fetchProvider, isModelKnown, mergedModelsByProvider };
}
