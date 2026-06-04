import { useCallback, useEffect } from 'react';

import { usePromptsStore } from '@/stores/prompts';
import { promptApi, seedBuiltinPresets } from '@/lib/prompts';
import { uuid, now } from '@/lib/utils';

export function usePrompts() {
  const store = usePromptsStore();

  const refresh = useCallback(async () => {
    const list = await promptApi.list();
    store.setList(list);
  }, [store]);

  useEffect(() => {
    (async () => {
      await seedBuiltinPresets();
      await refresh();
    })();
  }, [refresh]);

  const create = useCallback(
    async (input: { name: string; content: string }) => {
      const preset = await promptApi.create({
        name: input.name,
        content: input.content,
        builtin: false,
      });
      store.upsert({ ...preset, builtin: 0 });
      return preset;
    },
    [store],
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; content?: string }) => {
      await promptApi.update({ id, ...patch });
      const list = await promptApi.list();
      store.setList(list);
    },
    [store],
  );

  const remove = useCallback(
    async (id: string) => {
      await promptApi.remove(id);
      store.remove(id);
    },
    [store],
  );

  return {
    list: store.list,
    refresh,
    create,
    update,
    remove,
  };
}

export { uuid, now };
