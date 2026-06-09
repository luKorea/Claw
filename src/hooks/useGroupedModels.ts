/**
 * useGroupedModels hook (v1.3 重构)
 *
 * 把"按 groupLabel 聚合已配 provider 的 model"逻辑抽出来。
 * 之前在 ChatHeader 和 SettingsDialog.DefaultTab 各有一份重复实现。
 *
 * 输入:useSettings.configuredProviders + useModels 合并数据
 * 输出:Record<groupLabel, ModelInfo[]>(动态 model 自动补 label + group)
 */

import { useAvailableModels } from '@/hooks/useAvailableModels';
import type { ModelInfo } from '@/types/providers';

export interface UseGroupedModelsReturn {
  /** 按 groupLabel 聚合后的 model 列表(只含已配 provider)。 */
  grouped: Record<string, ModelInfo[]>;
}

export function useGroupedModels(): UseGroupedModelsReturn {
  const { grouped } = useAvailableModels();
  return { grouped };
}
