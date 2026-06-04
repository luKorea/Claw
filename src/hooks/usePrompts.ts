import { useCallback, useEffect } from 'react';

import { usePromptsStore } from '@/stores/prompts';
import { promptApi, seedBuiltinPresets } from '@/lib/prompts';

/**
 * 提示词预设 hook。
 *
 * 设计要点(v1.3 重构):
 * - 拆 selector 订阅 `usePromptsStore`,逐字段拿,避免整 store 订阅导致 re-render 风暴
 * - `refresh` / `create` / `update` / `remove` 只依赖稳定 setter,deps 列表干净
 * - 挂载副作用:`seedBuiltinPresets`(幂等)+ `refresh`,StrictMode 下也只跑一次
 */
export function usePrompts() {
  const list = usePromptsStore((s) => s.list);
  const setList = usePromptsStore((s) => s.setList);
  const upsert = usePromptsStore((s) => s.upsert);
  const removeAction = usePromptsStore((s) => s.remove);

  const refresh = useCallback(async () => {
    const next = await promptApi.list();
    setList(next);
  }, [setList]);

  useEffect(() => {
    (async () => {
      await seedBuiltinPresets();
      await refresh();
    })();
    // refresh 引用稳定,effect 只在 mount 跑一次
  }, [refresh]);

  const create = useCallback(
    async (input: { name: string; content: string }) => {
      const preset = await promptApi.create({
        name: input.name,
        content: input.content,
        builtin: false,
      });
      upsert({ ...preset, builtin: 0 });
      return preset;
    },
    [upsert],
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; content?: string }) => {
      await promptApi.update({ id, ...patch });
      const next = await promptApi.list();
      setList(next);
    },
    [setList],
  );

  const remove = useCallback(
    async (id: string) => {
      await promptApi.remove(id);
      removeAction(id);
    },
    [removeAction],
  );

  return { list, refresh, create, update, remove };
}
