import { useEffect, useMemo } from 'react';

import { useModels } from '@/hooks/useModels';
import {
  customProviderToModelInfos,
  resolveCustomModelSelection,
  useCustomProvidersStore,
} from '@/stores/customProviders';
import { useProviderKeysStore } from '@/stores/providerKeys';
import {
  ALL_MODELS,
  ALL_PROVIDER_IDS,
  isCustomProviderId,
  MODEL_REGISTRY,
  type ModelInfo,
  type StaticProviderId,
} from '@/types/providers';

export interface UseAvailableModelsReturn {
  grouped: Record<string, ModelInfo[]>;
  flat: ModelInfo[];
  configuredProviders: Set<StaticProviderId>;
  hasAvailableModels: boolean;
  firstModelId: string | null;
  isModelAvailable: (id: string) => boolean;
  getModelLabel: (id: string) => string;
}

function dynamicModelInfo(provider: StaticProviderId, id: string): ModelInfo {
  const sameProvider = MODEL_REGISTRY[provider][0];
  const groupLabel = sameProvider?.groupLabel ?? provider;
  return {
    id,
    provider,
    label: id,
    family: id,
    supportsThinking: false,
    groupLabel,
  };
}

function pushGrouped(grouped: Record<string, ModelInfo[]>, model: ModelInfo): void {
  const group = model.groupLabel;
  grouped[group] ??= [];
  if (!grouped[group].some((item) => item.id === model.id)) {
    grouped[group].push(model);
  }
}

export function resolveAvailableModelId(
  id: string | null | undefined,
  flat: readonly ModelInfo[],
): string | null {
  if (!id) return flat[0]?.id ?? null;
  if (flat.some((model) => model.id === id)) return id;

  if (isCustomProviderId(id)) {
    const resolved = resolveCustomModelSelection(id);
    if (resolved && flat.some((model) => model.id === resolved.modelId)) return resolved.modelId;
  }

  return flat[0]?.id ?? null;
}

/**
 * 当前应用唯一的可用模型目录视图。
 *
 * 静态 Provider 只在 API Key 已配置时暴露模型；自定义 Provider 展开为多个
 * `custom-model:*` 引用，避免“一个配置只能选一个写死模型”。
 */
export function useAvailableModels(): UseAvailableModelsReturn {
  const keys = useProviderKeysStore((state) => state.keys);
  const keysInitialized = useProviderKeysStore((state) => state.initialized);
  const refreshAllKeys = useProviderKeysStore((state) => state.refreshAll);
  const { mergedByProvider } = useModels();
  const customProviders = useCustomProvidersStore((state) => state.providers);
  const customProvidersHydrated = useCustomProvidersStore((state) => state.hydrated);
  const hydrateCustomProviders = useCustomProvidersStore((state) => state.hydrate);

  useEffect(() => {
    if (!keysInitialized) void refreshAllKeys();
  }, [keysInitialized, refreshAllKeys]);

  useEffect(() => {
    if (!customProvidersHydrated) void hydrateCustomProviders();
  }, [customProvidersHydrated, hydrateCustomProviders]);

  return useMemo<UseAvailableModelsReturn>(() => {
    const configuredProviders = new Set<StaticProviderId>(
      ALL_PROVIDER_IDS.filter((provider) => keys[provider].configured),
    );
    const grouped: Record<string, ModelInfo[]> = {};

    for (const provider of ALL_PROVIDER_IDS) {
      if (!configuredProviders.has(provider)) continue;
      for (const id of mergedByProvider[provider]) {
        const staticMeta = ALL_MODELS.find(
          (model) => model.id === id && model.provider === provider,
        );
        pushGrouped(grouped, staticMeta ?? dynamicModelInfo(provider, id));
      }
    }

    for (const provider of customProviders) {
      if (!provider.enabled) continue;
      for (const model of customProviderToModelInfos(provider)) {
        pushGrouped(grouped, model);
      }
    }

    const flat = Object.values(grouped).flat();
    const availableIds = new Set(flat.map((model) => model.id));
    const labelById = new Map(flat.map((model) => [model.id, model.label]));

    return {
      grouped,
      flat,
      configuredProviders,
      hasAvailableModels: flat.length > 0,
      firstModelId: flat[0]?.id ?? null,
      isModelAvailable: (id: string) => {
        if (availableIds.has(id)) return true;
        const resolved = resolveCustomModelSelection(id);
        return resolved ? availableIds.has(resolved.modelId) : false;
      },
      getModelLabel: (id: string) => labelById.get(id) ?? id,
    };
  }, [customProviders, keys, mergedByProvider]);
}
