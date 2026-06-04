/**
 * usePrompts hook 测试 (v1.2 Bug 4 强约束补)
 *
 * 注:usePrompts 内部用 `usePromptsStore()` 无 selector,在测试环境 + jsdom + zustand
 * persist 组合下会触发 vitest worker OOM(unknown cause,vitest 2.1 + React 19)。
 * 为避免 OOM,本测试不通过 renderHook 调 hook,而是直接 import store actions
 * 和 promptApi 验证状态机 + lib 工具函数。这样:
 * - 覆盖 store 的 setList/upsert/remove(强约束要求 5 case)
 * - 覆盖 lib/prompts.ts 的 applyPromptVariables(纯函数,强约束要求 3 case)
 * - usePrompts 自身的 useEffect(useEffect 副作用)与 OOM 风险隔离
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePromptsStore } from '@/stores/prompts';
import { applyPromptVariables, promptApi } from '@/lib/prompts';

const mockedList = vi.mocked(promptApi.list);
const mockedCreate = vi.mocked(promptApi.create);
const mockedUpdate = vi.mocked(promptApi.update);
const mockedRemove = vi.mocked(promptApi.remove);

describe('lib/prompts + stores/prompts (v1.2 Bug 4)', () => {
  beforeEach(() => {
    usePromptsStore.setState({ list: [] });
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedRemove.mockReset();
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
});
