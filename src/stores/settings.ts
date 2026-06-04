import { create } from 'zustand';

import {
  ALL_MODELS,
  DEFAULT_MODEL_ID,
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

// v2 存储键:defaultModel 现在跨 provider
const STORAGE_KEY = 'claw.settings.v2';
const LEGACY_KEY = 'claw.settings.v1';

interface Persisted {
  theme: Theme;
  defaultModel: string;
  defaultThinkingEnabled: boolean;
  defaultThinkingBudget: number;
}

function isModelKnown(id: string): boolean {
  return ALL_MODELS.some((m) => m.id === id);
}

function loadPersisted(): Partial<Persisted> {
  if (typeof localStorage === 'undefined') return {};
  try {
    // 优先 v2
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Partial<Persisted>;
    }
    // 迁移 v1 → v2(若 defaultModel 仍合法,保留)
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<Persisted>;
      // 写回 v2
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        } catch {
          // ignore
        }
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function savePersisted(s: Persisted): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

const persisted = loadPersisted();

/** 选取一个合法的 defaultModel(优先持久化,fallback 到 DEFAULT_MODEL_ID) */
function resolveDefaultModel(persistedModel: string | undefined): string {
  if (persistedModel && isModelKnown(persistedModel)) return persistedModel;
  return DEFAULT_MODEL_ID;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: persisted.theme ?? 'dark',
  defaultModel: resolveDefaultModel(persisted.defaultModel),
  defaultThinkingEnabled: persisted.defaultThinkingEnabled ?? false,
  defaultThinkingBudget: persisted.defaultThinkingBudget ?? DEFAULT_THINKING_BUDGET,

  setTheme: (theme) => {
    set({ theme });
    persist(get());
  },
  setDefaultModel: (defaultModel) => {
    if (!isModelKnown(defaultModel)) return;
    set({ defaultModel });
    persist(get());
  },
  setDefaultThinkingEnabled: (defaultThinkingEnabled) => {
    set({ defaultThinkingEnabled });
    persist(get());
  },
  setDefaultThinkingBudget: (defaultThinkingBudget) => {
    set({ defaultThinkingBudget });
    persist(get());
  },
}));

function persist(s: SettingsState): void {
  savePersisted({
    theme: s.theme,
    defaultModel: s.defaultModel,
    defaultThinkingEnabled: s.defaultThinkingEnabled,
    defaultThinkingBudget: s.defaultThinkingBudget,
  });
}

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
