import { useEffect } from 'react';

import { useMcpServersStore } from '@/stores/mcpServers';

/**
 * 读取 MCP Server 设置状态，并在首次使用时从后端 SQLite hydrate。
 */
export function useMcpServers() {
  const store = useMcpServersStore();

  useEffect(() => {
    if (!store.hydrated && !store.loading) {
      void store.hydrate();
    }
  }, [store]);

  return store;
}
