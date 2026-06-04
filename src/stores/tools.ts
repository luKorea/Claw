import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ToolsState {
  /** 用户禁用的工具名集合 */
  disabled: string[];
  setDisabled: (name: string, disabled: boolean) => void;
}

// v1.3:删 `isEnabled(name)` 内部函数,改用 `useToolEnabled(name)` selector hook
// —— 旧实现是 O(n) 遍历,且让 store 多了一个无意义的方法

export const useToolsStore = create<ToolsState>()(
  persist(
    (set) => ({
      disabled: [],

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
      partialize: (s) => ({ disabled: s.disabled }),
    },
  ),
);
