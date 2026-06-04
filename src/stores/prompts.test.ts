/**
 * prompts store 测试 (v1.2 Bug 4 强约束补)
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { usePromptsStore, type PromptPreset } from '@/stores/prompts';

const preset = (id: string, name: string, builtin: 0 | 1 = 0): PromptPreset => ({
  id,
  name,
  content: `${name} content`,
  builtin,
  created_at: Date.now(),
});

describe('stores/prompts', () => {
  beforeEach(() => {
    usePromptsStore.setState({ list: [] });
  });

  it('setList 整体替换', () => {
    const list = [preset('a', 'A'), preset('b', 'B')];
    usePromptsStore.getState().setList(list);
    expect(usePromptsStore.getState().list).toEqual(list);
  });

  it('upsert 插入新预设到头部', () => {
    usePromptsStore.getState().upsert(preset('a', 'A'));
    usePromptsStore.getState().upsert(preset('b', 'B'));
    const list = usePromptsStore.getState().list;
    expect(list[0].id).toBe('b');
    expect(list[1].id).toBe('a');
  });

  it('upsert 覆盖已存在预设(按 id 匹配)', () => {
    usePromptsStore.getState().upsert(preset('a', 'A'));
    usePromptsStore.getState().upsert(preset('a', 'A-renamed', 1));
    const list = usePromptsStore.getState().list;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('A-renamed');
    expect(list[0].builtin).toBe(1);
  });

  it('remove 按 id 过滤', () => {
    usePromptsStore.getState().setList([preset('a', 'A'), preset('b', 'B'), preset('c', 'C')]);
    usePromptsStore.getState().remove('b');
    const list = usePromptsStore.getState().list;
    expect(list.map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('remove 未知 id:no-op,list 长度不变', () => {
    usePromptsStore.getState().setList([preset('a', 'A')]);
    usePromptsStore.getState().remove('xxx');
    expect(usePromptsStore.getState().list).toHaveLength(1);
  });
});
