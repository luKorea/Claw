import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, isModelKnown, useSettingsStore } from '@/stores/settings';
import { DEFAULT_THINKING_BUDGET } from '@/types/claude';
import { DEFAULT_MODEL_ID } from '@/types/providers';

const STORAGE_KEY = 'claw.settings.v2';
const LEGACY_KEY = 'claw.settings.v1';

describe('stores/settings', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    useSettingsStore.setState({
      theme: 'dark',
      defaultModel: DEFAULT_MODEL_ID,
      defaultThinkingEnabled: false,
      defaultThinkingBudget: DEFAULT_THINKING_BUDGET,
    });
  });

  describe('isModelKnown', () => {
    it('接受 ALL_MODELS 内的 id', () => {
      expect(isModelKnown('claude-opus-4-8')).toBe(true);
      expect(isModelKnown('MiniMax-M2.7')).toBe(true);
    });

    it('拒绝未知 id(不抛错)', () => {
      expect(isModelKnown('xxx')).toBe(false);
      expect(isModelKnown('')).toBe(false);
    });
  });

  describe('持久化 / 迁移(loadPersisted 内部函数,通过 resetModules 触发 module-scope 重新求值)', () => {
    /**
     * 关键:`@/stores/settings` 是 module-scope 创建 zustand store,`loadPersisted()` 只在模块首次求值时调用。
     * `vi.resetModules()` + 重新 `await import()` 拿到一份新的 module 实例,从而触发 `loadPersisted()` 重新读 localStorage。
     */
    async function loadFresh() {
      vi.resetModules();
      return import('@/stores/settings');
    }

    it('v2 有值时,store 从 localStorage 读取', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          theme: 'light',
          defaultModel: 'claude-sonnet-4-6',
          defaultThinkingEnabled: true,
          defaultThinkingBudget: 8_000,
        }),
      );
      const m = await loadFresh();
      const s = m.useSettingsStore.getState();
      expect(s.theme).toBe('light');
      expect(s.defaultModel).toBe('claude-sonnet-4-6');
      expect(s.defaultThinkingEnabled).toBe(true);
      expect(s.defaultThinkingBudget).toBe(8_000);
    });

    it('v1 → v2 迁移:写 v1 时,store 读 v1 并写回 v2', async () => {
      localStorage.setItem(
        LEGACY_KEY,
        JSON.stringify({
          theme: 'system',
          defaultModel: 'gpt-5',
          defaultThinkingEnabled: false,
          defaultThinkingBudget: 4_000,
        }),
      );
      const m = await loadFresh();
      const s = m.useSettingsStore.getState();
      expect(s.defaultModel).toBe('gpt-5');
      // 迁移后 v2 已被写入
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      const v2 = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(v2.defaultModel).toBe('gpt-5');
    });

    it('persisted 非法 modelId fallback 到 DEFAULT_MODEL_ID', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ defaultModel: 'unknown-model-xyz', theme: 'dark' }),
      );
      const m = await loadFresh();
      expect(m.useSettingsStore.getState().defaultModel).toBe(DEFAULT_MODEL_ID);
    });
  });

  describe('setters', () => {
    it('setDefaultModel 接受合法 id', () => {
      useSettingsStore.getState().setDefaultModel('claude-sonnet-4-6');
      expect(useSettingsStore.getState().defaultModel).toBe('claude-sonnet-4-6');
    });

    it('setDefaultModel 持久化到 localStorage(v1.2 Bug 2 回归保护)', () => {
      // 旧测试只校验内存 state,漏掉了 persist(get()) 写盘这一步
      useSettingsStore.getState().setDefaultModel('claude-haiku-4-5-20251001');
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(persisted.defaultModel).toBe('claude-haiku-4-5-20251001');
    });

    it('setDefaultModel 拒绝未知 id(静默,不更新不抛错)', () => {
      const before = useSettingsStore.getState().defaultModel;
      useSettingsStore.getState().setDefaultModel('xxx');
      expect(useSettingsStore.getState().defaultModel).toBe(before);
    });

    it('setDefaultThinkingEnabled / setDefaultThinkingBudget 持久化', () => {
      useSettingsStore.getState().setDefaultThinkingEnabled(true);
      useSettingsStore.getState().setDefaultThinkingBudget(16_000);
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(persisted.defaultThinkingEnabled).toBe(true);
      expect(persisted.defaultThinkingBudget).toBe(16_000);
    });
  });

  describe('applyTheme', () => {
    it('light 移除 dark,加 light class', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    it('dark 移除 light,加 dark class', () => {
      document.documentElement.classList.add('light');
      applyTheme('dark');
      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('system 跟随 prefers-color-scheme', () => {
      // jsdom 默认没有 matchMedia,补一个 stub
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
      applyTheme('system');
      // 跟随 mock 返回 false → 'light'
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });
  });
});
