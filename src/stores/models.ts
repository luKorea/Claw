/**
 * Provider 模型列表 store (v1.2 Bug 3.2)
 *
 * 每个 provider 一份 `{ ids, loading, error?, fetchedAt? }`,
 * 由 `useModels.fetchProvider` 拉取并写入。24h 内不重复拉取。
 * 持久化到 localStorage 跨会话保留,失败时 fallback 到 ALL_MODELS 静态。
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { ALL_PROVIDER_IDS, type ProviderId } from '@/types/providers';

const STORAGE_KEY = 'claw.models.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ProviderModelState {
  ids: string[];
  loading: boolean;
  error: string | null;
  /** 距 epoch ms;undefined = 从未拉过 */
  fetchedAt: number | null;
}

export type { ProviderId };

const emptyEntry = (): ProviderModelState => ({
  ids: [],
  loading: false,
  error: null,
  fetchedAt: null,
});

const initialByProvider = (): Record<ProviderId, ProviderModelState> =>
  Object.fromEntries(ALL_PROVIDER_IDS.map((p) => [p, emptyEntry()])) as Record<
    ProviderId,
    ProviderModelState
  >;

interface ModelsState {
  byProvider: Record<ProviderId, ProviderModelState>;
  /** 写 ids 字段(成功路径) */
  setIds: (provider: ProviderId, ids: string[]) => void;
  /** 写 loading 字段 */
  setLoading: (provider: ProviderId, loading: boolean) => void;
  /** 写 error 字段(失败路径);保留旧 ids */
  setError: (provider: ProviderId, error: string) => void;
  /** 重置某个 provider(用于手动 retry) */
  reset: (provider: ProviderId) => void;
}

export const useModelsStore = create<ModelsState>()(
  persist(
    (set) => ({
      byProvider: initialByProvider(),
      setIds: (provider, ids) =>
        set((s) => ({
          byProvider: {
            ...s.byProvider,
            [provider]: {
              ids,
              loading: false,
              error: null,
              fetchedAt: Date.now(),
            },
          },
        })),
      setLoading: (provider, loading) =>
        set((s) => ({
          byProvider: {
            ...s.byProvider,
            [provider]: { ...s.byProvider[provider], loading },
          },
        })),
      setError: (provider, error) =>
        set((s) => ({
          byProvider: {
            ...s.byProvider,
            [provider]: {
              ...s.byProvider[provider],
              loading: false,
              error,
              // 注意:ids 保留,fetchedAt 不更新,允许 retry 后再覆盖
            },
          },
        })),
      reset: (provider) =>
        set((s) => ({
          byProvider: { ...s.byProvider, [provider]: emptyEntry() },
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // 仅持久化 ids 和 fetchedAt,loading/error 不持久化
      partialize: (s) => ({
        byProvider: Object.fromEntries(
          Object.entries(s.byProvider).map(([k, v]) => [k, { ids: v.ids, fetchedAt: v.fetchedAt }]),
        ) as Record<ProviderId, ProviderModelState>,
      }),
    },
  ),
);

export { CACHE_TTL_MS };
