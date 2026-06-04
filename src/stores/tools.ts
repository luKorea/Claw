import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ToolsState {
  /** 用户禁用的工具名集合 */
  disabled: string[];
  setDisabled: (name: string, disabled: boolean) => void;
  isEnabled: (name: string) => boolean;
}

export const useToolsStore = create<ToolsState>()(
  persist(
    (set, get) => ({
      disabled: [],

      setDisabled: (name, disabled) =>
        set((s) => {
          const next = new Set(s.disabled);
          if (disabled) next.add(name);
          else next.delete(name);
          return { disabled: Array.from(next) };
        }),

      isEnabled: (name) => !get().disabled.includes(name),
    }),
    {
      name: 'claw.tools.v1',
      partialize: (s) => ({ disabled: s.disabled }),
    },
  ),
);
