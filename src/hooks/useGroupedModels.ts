/**
 * useGroupedModels hook (v1.3 重构)
 *
 * 把"按 groupLabel 聚合已配 provider 的 model"逻辑抽出来。
 * 之前在 ChatHeader 和 SettingsDialog.DefaultTab 各有一份重复实现。
 *
 * 输入:useSettings.configuredProviders + useModels 合并数据
 * 输出:Record<groupLabel, ModelInfo[]>(动态 model 自动补 label + group)
 */

import { useMemo } from 'react';

import { useModels } from '@/hooks/useModels';
import { useSettings } from '@/hooks/useSettings';
import { ALL_MODELS, type ModelInfo, type ProviderId } from '@/types/providers';

export interface UseGroupedModelsReturn {
  /** 按 groupLabel 聚合后的 model 列表(只含已配 provider)。 */
  grouped: Record<string, ModelInfo[]>;
}

export function useGroupedModels(): UseGroupedModelsReturn {
  const { configuredProviders } = useSettings();
  const { mergedByProvider } = useModels();

  return useMemo<UseGroupedModelsReturn>(() => {
    // 1. 硬编码模型:按 groupLabel 聚合,只保留已配 provider
    const grouped: Record<string, ModelInfo[]> = ALL_MODELS.filter(
      (m) => configuredProviders.has(m.provider),
    ).reduce<Record<string, ModelInfo[]>>((acc, m) => {
      (acc[m.groupLabel] ??= []).push(m);
      return acc;
    }, {});

    // 2. 动态拉取的 id(可能不在 ALL_MODELS 里):归到同 provider 的 group
    for (const [p, ids] of Object.entries(mergedByProvider) as [ProviderId, string[]][]) {
      if (!configuredProviders.has(p)) continue;
      for (const id of ids) {
        // isModelKnown 已包含硬编码;这里只看动态 + 已在硬编码里的去重
        const meta = ALL_MODELS.find((m) => m.id === id);
        if (meta) continue; // 硬编码已包含,跳过
        // 动态 id 用 id 当 label;找同 provider 的 groupLabel
        const sameProvider = ALL_MODELS.find((m) => m.provider === p);
        const groupKey = sameProvider?.groupLabel ?? p;
        grouped[groupKey] ??= [];
        if (!grouped[groupKey].some((m) => m.id === id)) {
          grouped[groupKey].push({
            id,
            provider: p,
            label: id,
            family: id,
            supportsThinking: false,
            groupLabel: groupKey,
          });
        }
      }
    }

    return { grouped };
  }, [configuredProviders, mergedByProvider]);
}
