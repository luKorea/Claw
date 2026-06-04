import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSettingsStore } from '@/stores/settings';
import {
  ALL_PROVIDER_IDS,
  type ProviderId,
} from '@/types/providers';
import {
  deleteApiKey,
  getApiKeyStatus,
  setApiKey as keyringSetKey,
} from '@/lib/keyring';
// applyTheme 是独立工具函数(非 store 字段),App.tsx 自行 import 使用

export interface ApiKeyState {
  configured: boolean;
  preview: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

type ApiKeyStateMap = Record<ProviderId, ApiKeyState>;

const initialKeyState: ApiKeyState = {
  configured: false,
  preview: null,
  loading: true,
  saving: false,
  error: null,
};

function makeInitialMap(): ApiKeyStateMap {
  return Object.fromEntries(
    ALL_PROVIDER_IDS.map((p) => [p, { ...initialKeyState }]),
  ) as ApiKeyStateMap;
}

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

  const [keys, setKeys] = useState<ApiKeyStateMap>(makeInitialMap);

  const refreshAll = useCallback(async () => {
    // 先全部 loading
    setKeys((prev) => {
      const next = { ...prev };
      for (const p of ALL_PROVIDER_IDS) {
        next[p] = { ...next[p], loading: true, error: null };
      }
      return next;
    });
    // 并行查 status
    const results = await Promise.all(
      ALL_PROVIDER_IDS.map(async (p) => {
        try {
          const s = await getApiKeyStatus(p);
          return { p, status: s, error: null };
        } catch (err) {
          return {
            p,
            status: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    setKeys((prev) => {
      const next = { ...prev };
      for (const r of results) {
        const cur = next[r.p];
        if (r.status) {
          next[r.p] = {
            configured: r.status.configured,
            preview: r.status.preview,
            loading: false,
            saving: false,
            error: null,
          };
        } else {
          next[r.p] = {
            configured: cur?.configured ?? false,
            preview: cur?.preview ?? null,
            loading: false,
            saving: false,
            error: r.error,
          };
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const refreshOne = useCallback(async (provider: ProviderId) => {
    setKeys((prev) => ({ ...prev, [provider]: { ...prev[provider], loading: true, error: null } }));
    try {
      const s = await getApiKeyStatus(provider);
      setKeys((prev) => ({
        ...prev,
        [provider]: {
          configured: s.configured,
          preview: s.preview,
          loading: false,
          saving: false,
          error: null,
        },
      }));
    } catch (err) {
      setKeys((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }, []);

  const saveKey = useCallback(
    async (provider: ProviderId, key: string) => {
      setKeys((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], saving: true, error: null },
      }));
      try {
        await keyringSetKey(provider, key);
        await refreshOne(provider);
      } catch (err) {
        setKeys((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            saving: false,
            error: err instanceof Error ? err.message : String(err),
          },
        }));
        throw err;
      }
    },
    [refreshOne],
  );

  const removeKey = useCallback(
    async (provider: ProviderId) => {
      setKeys((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], saving: true, error: null },
      }));
      try {
        await deleteApiKey(provider);
        await refreshOne(provider);
      } catch (err) {
        setKeys((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            saving: false,
            error: err instanceof Error ? err.message : String(err),
          },
        }));
        throw err;
      }
    },
    [refreshOne],
  );

  /** 同步拿已配置的 provider 集合(用于 UI 提示) */
  // v1.2 Bug 3.1:用 useMemo 锁住 Set 引用,避免每次 render 新建触发子组件 re-render
  const configuredProviders = useMemo(
    () => new Set<ProviderId>(ALL_PROVIDER_IDS.filter((p) => keys[p].configured)),
    [keys],
  );

  return {
    settings,
    keys,                          // 按 provider 的 key 状态 map
    configuredProviders,          // Set<ProviderId>
    refreshAll,                   // 重新拉所有 provider 状态
    refreshOne,                   // 重新拉单个
    saveKey,                      // (provider, key) => Promise<void>
    removeKey,                    // (provider) => Promise<void>
  };
}
