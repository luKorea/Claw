import { useEffect, useMemo } from 'react';

import { useSettingsStore } from '@/stores/settings';
import { useProviderKeysStore, type ProviderKeyState } from '@/stores/providerKeys';
import {
  ALL_PROVIDER_IDS,
  type StaticProviderId,
} from '@/types/providers';
// applyTheme 是独立工具函数(非 store 字段),App.tsx 自行 import 使用

export type ApiKeyState = ProviderKeyState;

/**
 * 统一管理全局设置 + 多 Provider API Key 状态。
 */
export function useSettings() {
  // v1.2 Bug 2:用 selector 拆开订阅,避免无 selector 时任意字段变化触发整树重渲
  const theme = useSettingsStore((s) => s.theme);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const defaultThinkingEnabled = useSettingsStore((s) => s.defaultThinkingEnabled);
  const defaultThinkingBudget = useSettingsStore((s) => s.defaultThinkingBudget);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setDefaultModel = useSettingsStore((s) => s.setDefaultModel);
  const setDefaultThinkingEnabled = useSettingsStore((s) => s.setDefaultThinkingEnabled);
  const setDefaultThinkingBudget = useSettingsStore((s) => s.setDefaultThinkingBudget);

  // 聚合对象,行为兼容旧 API(settings.setDefaultModel 等)
  // 注:对象每次 render 新建,但不放入 useEffect deps,无死循环风险
  const settings = useMemo(
    () => ({
      theme,
      defaultModel,
      defaultThinkingEnabled,
      defaultThinkingBudget,
      setTheme,
      setDefaultModel,
      setDefaultThinkingEnabled,
      setDefaultThinkingBudget,
    }),
    [
      theme,
      defaultModel,
      defaultThinkingEnabled,
      defaultThinkingBudget,
      setTheme,
      setDefaultModel,
      setDefaultThinkingEnabled,
      setDefaultThinkingBudget,
    ],
  );

  const keys = useProviderKeysStore((s) => s.keys);
  const keysInitialized = useProviderKeysStore((s) => s.initialized);
  const refreshAll = useProviderKeysStore((s) => s.refreshAll);
  const refreshOne = useProviderKeysStore((s) => s.refreshOne);
  const syncOne = useProviderKeysStore((s) => s.syncOne);
  const saveKey = useProviderKeysStore((s) => s.saveKey);
  const removeKey = useProviderKeysStore((s) => s.removeKey);

  useEffect(() => {
    if (!keysInitialized) void refreshAll();
  }, [keysInitialized, refreshAll]);

  /** 同步拿已配置的 provider 集合(用于 UI 提示) */
  // v1.2 Bug 3.1:用 useMemo 锁住 Set 引用,避免每次 render 新建触发子组件 re-render
  const configuredProviders = useMemo(
    () => new Set<StaticProviderId>(ALL_PROVIDER_IDS.filter((p) => keys[p].configured)),
    [keys],
  );

  return {
    settings,
    keys,                          // 按 provider 的 key 状态 map
    configuredProviders,          // Set<ProviderId>
    refreshAll,                   // 重新拉所有 provider 状态
    refreshOne,                   // 重新拉单个
    syncOne,                      // 显式从旧 Keychain 导入
    saveKey,                      // (provider, key) => Promise<void>
    removeKey,                    // (provider) => Promise<void>
  };
}
