/**
 * usePrompts hook 测试 (v1.2 Bug 4 强约束补 + v1.3 renderHook 死循环回归)
 *
 * 大部分 case 走 store + promptApi 集成(避开 v1.2 OOM);
 * v1.3 selector 化后,新增 1 个真 renderHook 用例验证 mount/unmount 不死循环。
 */

// 整模块 mock 必须在所有 import 之前(vitest hoist)
vi.mock('@/lib/prompts', async () => {
  const actual = await vi.importActual('@/lib/prompts');
  return {
    ...actual,
    promptApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    seedBuiltinPresets: vi.fn(),
  };
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePromptsStore } from '@/stores/prompts';
import { usePrompts } from '@/hooks/usePrompts';
import { applyPromptVariables, promptApi, seedBuiltinPresets } from '@/lib/prompts';

const mockedList = vi.mocked(promptApi.list);
const mockedCreate = vi.mocked(promptApi.create);
const mockedUpdate = vi.mocked(promptApi.update);
const mockedRemove = vi.mocked(promptApi.remove);
const mockedSeed = vi.mocked(seedBuiltinPresets);

describe('lib/prompts + stores/prompts (v1.2 Bug 4)', () => {
  beforeEach(() => {
    usePromptsStore.setState({ list: [] });
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedRemove.mockReset();
    mockedSeed.mockReset();
  });

  afterEach(() => {
    usePromptsStore.setState({ list: [] });
  });

  describe('promptApi 集成 + store 同步(usePrompts 等价行为)', () => {
    it('refresh 路径:promptApi.list 返回 → store.setList', async () => {
      mockedList.mockResolvedValueOnce([
        { id: 'p1', name: '通用助手', content: 'x', builtin: 1, created_at: 0 },
      ]);
      // 等价于 usePrompts.refresh
      const list = await promptApi.list();
      usePromptsStore.getState().setList(list);
      expect(usePromptsStore.getState().list).toHaveLength(1);
      expect(usePromptsStore.getState().list[0].name).toBe('通用助手');
    });

    it('create 路径:promptApi.create → store.upsert', async () => {
      mockedCreate.mockResolvedValueOnce({
        id: 'new',
        name: 'My Preset',
        content: 'c',
        builtin: 0,
        created_at: 1,
      });
      const created = await promptApi.create({
        name: 'My Preset',
        content: 'c',
        builtin: false,
      });
      usePromptsStore.getState().upsert({ ...created, builtin: 0 });
      expect(usePromptsStore.getState().list[0].id).toBe('new');
    });

    it('update 路径:promptApi.update → 重拉 list → setList', async () => {
      mockedUpdate.mockResolvedValueOnce(undefined);
      mockedList.mockResolvedValueOnce([
        { id: 'p1', name: 'Updated', content: 'new', builtin: 0, created_at: 0 },
      ]);
      await promptApi.update({ id: 'p1', name: 'Updated' });
      const list = await promptApi.list();
      usePromptsStore.getState().setList(list);
      expect(usePromptsStore.getState().list[0].name).toBe('Updated');
    });

    it('remove 路径:promptApi.remove → store.remove', async () => {
      usePromptsStore.setState({
        list: [
          { id: 'p1', name: 'A', content: 'a', builtin: 0, created_at: 0 },
          { id: 'p2', name: 'B', content: 'b', builtin: 0, created_at: 0 },
        ],
      });
      mockedRemove.mockResolvedValueOnce(undefined);
      await promptApi.remove('p1');
      usePromptsStore.getState().remove('p1');
      expect(usePromptsStore.getState().list.map((p) => p.id)).toEqual(['p2']);
    });
  });

  describe('applyPromptVariables(纯函数,强约束要求)', () => {
    it('替换 {{key}}', () => {
      expect(applyPromptVariables('hello {{name}}', { name: 'world' })).toBe('hello world');
    });

    it('未知 key 保留 {{key}}', () => {
      expect(applyPromptVariables('hello {{unknown}}', {})).toBe('hello {{unknown}}');
    });

    it('key 周围空白容错', () => {
      expect(applyPromptVariables('hi {{ name }}!', { name: 'x' })).toBe('hi x!');
    });

    it('多个 key 替换', () => {
      expect(
        applyPromptVariables('{{a}} and {{b}}', { a: '1', b: '2' }),
      ).toBe('1 and 2');
    });
  });

  describe('usePrompts renderHook 死循环回归 (v1.3)', () => {
    it('mount → unmount → mount:refresh 与 seed 各只 +1 次,不出现死循环', async () => {
      mockedSeed.mockResolvedValue(undefined);
      mockedList.mockResolvedValue([]);

      const { unmount } = renderHook(() => usePrompts());
      await act(async () => {});
      expect(mockedSeed).toHaveBeenCalledTimes(1);
      expect(mockedList).toHaveBeenCalledTimes(1);

      unmount();
      renderHook(() => usePrompts());
      await act(async () => {});

      // 第二次 mount 应该各再 +1 次(每次 mount 一次是合理行为)
      // 死循环的判定:seed / list 调用次数远大于 mount 次数(例如 > 3)
      expect(mockedSeed).toHaveBeenCalledTimes(2);
      expect(mockedList).toHaveBeenCalledTimes(2);
    });

    it('create 调用 promptApi.create 并 store.upsert', async () => {
      usePromptsStore.setState({ list: [] });
      mockedSeed.mockResolvedValue(undefined);
      mockedList.mockResolvedValue([]);

      const { result } = renderHook(() => usePrompts());
      await act(async () => {});

      mockedCreate.mockResolvedValueOnce({
        id: 'new',
        name: 'N',
        content: 'c',
        builtin: 0,
        created_at: 1,
      });

      await act(async () => {
        await result.current.create({ name: 'N', content: 'c' });
      });

      expect(mockedCreate).toHaveBeenCalledTimes(1);
      expect(usePromptsStore.getState().list.map((p) => p.id)).toEqual(['new']);
    });
  });
});
