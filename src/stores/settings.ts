import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import {
  ALL_MODELS,
  DEFAULT_MODEL_ID,
  getProviderOfModel,
  isCustomProviderId,
  type ModelInfo,
} from '@/types/providers';
import { DEFAULT_THINKING_BUDGET } from '@/types/claude';

type Theme = 'light' | 'dark' | 'system';

export interface SettingsState {
  theme: Theme;
  defaultModel: string;
  defaultThinkingEnabled: boolean;
  defaultThinkingBudget: number;

  setTheme: (theme: Theme) => void;
  setDefaultModel: (model: string) => void;
  setDefaultThinkingEnabled: (enabled: boolean) => void;
  setDefaultThinkingBudget: (budget: number) => void;
}

// 沿用 v2 存储 key,通过 persist version 做 v3 迁移,避免丢失已有设置。
const STORAGE_KEY = 'claw.settings.v2';
const LEGACY_KEY = 'claw.settings.v1';

interface Persisted {
  theme: Theme;
  defaultModel: string;
  defaultThinkingEnabled: boolean;
  defaultThinkingBudget: number;
}

function isModelKnown(id: string): boolean {
  if (isCustomProviderId(id)) return true;
  if (ALL_MODELS.some((m) => m.id === id)) return true;
  return getProviderOfModel(id) !== null;
}

/** v1 → v2 迁移:从旧 key 读出后写回新 key(若 v2 缺,补一次) */
function migrate(persistedState: unknown, _version: number): Partial<Persisted> {
  void _version;
  if (!persistedState || typeof persistedState !== 'object') return {};
  const s = persistedState as Partial<Persisted>;
  // v3:用户要求已有安装也默认切到浅色;仅迁移时强制 light,后续用户手动切换仍可持久化。
  return { ...s, theme: 'light' };
}

/** 选取一个合法的 defaultModel(persisted 值优先,fallback 到 DEFAULT_MODEL_ID) */
function resolveDefaultModel(persistedModel: string | undefined): string {
  if (persistedModel && isModelKnown(persistedModel)) return persistedModel;
  return DEFAULT_MODEL_ID;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      defaultModel: DEFAULT_MODEL_ID,
      defaultThinkingEnabled: false,
      defaultThinkingBudget: DEFAULT_THINKING_BUDGET,

      setTheme: (theme) => set({ theme }),
      setDefaultModel: (defaultModel) => {
        if (!isModelKnown(defaultModel)) return;
        set({ defaultModel });
      },
      setDefaultThinkingEnabled: (defaultThinkingEnabled) =>
        set({ defaultThinkingEnabled }),
      setDefaultThinkingBudget: (defaultThinkingBudget) =>
        set({ defaultThinkingBudget }),
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate,
      // v1 → v2 兼容:旧 key 读一次后立刻写回 v2 并删 v1
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // defaultModel 合法性校验(替代旧 resolveDefaultModel module-scope 求值)
        state.defaultModel = resolveDefaultModel(state.defaultModel);
        // 一次性 v1 迁移:把 v1 key 的内容搬到 v2,然后删 v1
        try {
          const legacy = localStorage.getItem(LEGACY_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as Partial<Persisted>;
            // 仅当 v2 还没写入时迁移
            if (parsed.defaultModel && isModelKnown(parsed.defaultModel)) {
              state.defaultModel = parsed.defaultModel;
            }
            state.theme = 'light';
            if (typeof parsed.defaultThinkingEnabled === 'boolean') {
              state.defaultThinkingEnabled = parsed.defaultThinkingEnabled;
            }
            if (typeof parsed.defaultThinkingBudget === 'number') {
              state.defaultThinkingBudget = parsed.defaultThinkingBudget;
            }
            localStorage.removeItem(LEGACY_KEY);
          }
        } catch {
          // ignore
        }
      },
      // 只持久化字段,排除函数
      partialize: (s) => ({
        theme: s.theme,
        defaultModel: s.defaultModel,
        defaultThinkingEnabled: s.defaultThinkingEnabled,
        defaultThinkingBudget: s.defaultThinkingBudget,
      }),
    },
  ),
);

/** 在文档根上应用 theme class */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
}

// 工具函数
export { isModelKnown };
export type { ModelInfo };
