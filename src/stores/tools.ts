import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_DISABLED_TOOLS = ['write_file'] as const;
const STORAGE_VERSION = 2;

export interface ToolsState {
  /** 用户禁用的工具名集合 */
  disabled: string[];
  setDisabled: (name: string, disabled: boolean) => void;
}

interface PersistedToolsState {
  disabled?: unknown;
}

function withDefaultDisabled(disabled: readonly string[]): string[] {
  const next = new Set(disabled);
  for (const name of DEFAULT_DISABLED_TOOLS) {
    next.add(name);
  }
  return Array.from(next);
}

// v1.3:删 `isEnabled(name)` 内部函数,改用 `useToolEnabled(name)` selector hook
// —— 旧实现是 O(n) 遍历,且让 store 多了一个无意义的方法

export const useToolsStore = create<ToolsState>()(
  persist(
    (set) => ({
      disabled: [...DEFAULT_DISABLED_TOOLS],

      setDisabled: (name, disabled) =>
        set((s) => {
          const next = new Set(s.disabled);
          if (disabled) next.add(name);
          else next.delete(name);
          return { disabled: Array.from(next) };
        }),
    }),
    {
      name: 'claw.tools.v1',
      version: STORAGE_VERSION,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as PersistedToolsState;
        const disabled = Array.isArray(state.disabled)
          ? state.disabled.filter((name): name is string => typeof name === 'string')
          : [];

        return {
          disabled: version < STORAGE_VERSION ? withDefaultDisabled(disabled) : disabled,
        };
      },
      partialize: (s) => ({ disabled: s.disabled }),
    },
  ),
);
