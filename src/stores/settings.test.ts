import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';

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
      theme: 'light',
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

    it('接受可反查 Provider 的动态模型 id', () => {
      expect(isModelKnown('deepseek-v4-flash')).toBe(true);
      expect(isModelKnown('deepseek-v4-pro')).toBe(true);
    });

    it('拒绝未知 id(不抛错)', () => {
      expect(isModelKnown('xxx')).toBe(false);
      expect(isModelKnown('')).toBe(false);
    });
  });

  describe('persist middleware', () => {
    it('新安装默认 light', () => {
      expect(useSettingsStore.getState().theme).toBe('light');
    });

    it('v2 有值时,rehydrate 后迁移到 v3 并强制 light', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: {
            theme: 'light',
            defaultModel: 'claude-sonnet-4-6',
            defaultThinkingEnabled: true,
            defaultThinkingBudget: 8_000,
          },
          version: 2,
        }),
      );
      await act(async () => {
        await useSettingsStore.persist.rehydrate();
      });
      const s = useSettingsStore.getState();
      expect(s.theme).toBe('light');
      expect(s.defaultModel).toBe('claude-sonnet-4-6');
      expect(s.defaultThinkingEnabled).toBe(true);
      expect(s.defaultThinkingBudget).toBe(8_000);
    });

    it('v1 → v3 迁移:rehydrate 时读 v1 key、强制 light 并删 v1', async () => {
      localStorage.setItem(
        LEGACY_KEY,
        JSON.stringify({
          theme: 'system',
          defaultModel: 'gpt-5',
          defaultThinkingEnabled: false,
          defaultThinkingBudget: 4_000,
        }),
      );
      await act(async () => {
        await useSettingsStore.persist.rehydrate();
      });
      const s = useSettingsStore.getState();
      expect(s.theme).toBe('light');
      expect(s.defaultModel).toBe('gpt-5');
      // 迁移后 v1 应被删除
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it('persisted 非法 modelId fallback 到 DEFAULT_MODEL_ID', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: { defaultModel: 'unknown-model-xyz', theme: 'dark' },
          version: 3,
        }),
      );
      await act(async () => {
        await useSettingsStore.persist.rehydrate();
      });
      expect(useSettingsStore.getState().defaultModel).toBe(DEFAULT_MODEL_ID);
    });

    it('persisted 动态模型 id rehydrate 后保留', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: { defaultModel: 'deepseek-v4-pro', theme: 'light' },
          version: 3,
        }),
      );
      await act(async () => {
        await useSettingsStore.persist.rehydrate();
      });
      expect(useSettingsStore.getState().defaultModel).toBe('deepseek-v4-pro');
    });
  });

  describe('setters', () => {
    it('setDefaultModel 接受合法 id', () => {
      useSettingsStore.getState().setDefaultModel('claude-sonnet-4-6');
      expect(useSettingsStore.getState().defaultModel).toBe('claude-sonnet-4-6');
    });

    it('setDefaultModel 接受动态模型 id', () => {
      useSettingsStore.getState().setDefaultModel('deepseek-v4-flash');
      expect(useSettingsStore.getState().defaultModel).toBe('deepseek-v4-flash');
    });

    it('setDefaultModel 持久化到 localStorage', async () => {
      useSettingsStore.getState().setDefaultModel('claude-haiku-4-5-20251001');
      // persist 中间件写入是同步的
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const persisted = JSON.parse(raw ?? '{}');
      // zustand persist 写入格式:{ state, version }
      const inner = persisted.state ?? persisted;
      expect(inner.defaultModel).toBe('claude-haiku-4-5-20251001');
    });

    it('setDefaultModel 拒绝未知 id(静默,不更新不抛错)', () => {
      const before = useSettingsStore.getState().defaultModel;
      useSettingsStore.getState().setDefaultModel('xxx');
      expect(useSettingsStore.getState().defaultModel).toBe(before);
    });

    it('setDefaultThinkingEnabled / setDefaultThinkingBudget 持久化', () => {
      useSettingsStore.getState().setDefaultThinkingEnabled(true);
      useSettingsStore.getState().setDefaultThinkingBudget(16_000);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const persisted = JSON.parse(raw ?? '{}');
      const inner = persisted.state ?? persisted;
      expect(inner.defaultThinkingEnabled).toBe(true);
      expect(inner.defaultThinkingBudget).toBe(16_000);
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
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });
  });
});
