import { create } from 'zustand';

import {
  createMcpServer as createMcpServerConfig,
  deleteMcpServer as deleteMcpServerConfig,
  listMcpServers as listMcpServerConfigs,
  refreshMcpServerTools as refreshMcpServerToolConfigs,
  setMcpServerEnabled as setMcpServerEnabledConfig,
  testMcpServer as testMcpServerConfig,
  updateMcpServer as updateMcpServerConfig,
} from '@/lib/mcp';
import type {
  McpServer,
  McpServerInput,
  McpServerStatus,
  McpServerUpdateInput,
} from '@/types/mcp';

export interface McpServersState {
  servers: McpServer[];
  hydrated: boolean;
  loading: boolean;
  saving: boolean;
  testingIds: string[];
  error: string | null;
  hydrate: (options?: { force?: boolean }) => Promise<void>;
  createServer: (input: McpServerInput) => Promise<McpServer>;
  updateServer: (input: McpServerUpdateInput) => Promise<McpServer>;
  testServer: (id: string) => Promise<McpServerStatus>;
  refreshServer: (id: string) => Promise<McpServerStatus>;
  setServerEnabled: (id: string, enabled: boolean) => Promise<McpServer>;
  deleteServer: (id: string) => Promise<void>;
}

let hydrateInFlight: Promise<void> | null = null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeInput(input: McpServerInput): McpServerInput {
  return {
    ...input,
    name: input.name.trim(),
    command: input.command.trim(),
    args: input.args.map((arg) => arg.trim()).filter(Boolean),
    workingDirectory: input.workingDirectory?.trim() || undefined,
    env: Object.fromEntries(
      Object.entries(input.env)
        .map(([key, value]) => [key.trim(), value] as const)
        .filter(([key]) => key.length > 0),
    ),
  };
}

export function validateMcpServerInput(input: McpServerInput): string | null {
  if (!input.name.trim()) return 'MCP Server 名称不能为空';
  if (!input.command.trim()) return 'MCP 启动命令不能为空';
  if (input.transport !== 'local-command') return '当前仅支持本地命令 MCP Server';
  return null;
}

function replaceServer(servers: McpServer[], next: McpServer): McpServer[] {
  const exists = servers.some((server) => server.id === next.id);
  if (!exists) return [...servers, next].sort((a, b) => a.createdAt - b.createdAt);
  return servers.map((server) => (server.id === next.id ? next : server));
}

function applyStatus(servers: McpServer[], status: McpServerStatus): McpServer[] {
  return servers.map((server) =>
    server.id === status.serverId
      ? {
          ...server,
          status,
          tools:
            status.phase === 'ready'
              ? server.tools.map((tool) => ({
                  ...tool,
                  enabled: server.enabled,
                }))
              : [],
        }
      : server,
  );
}

export const useMcpServersStore = create<McpServersState>((set, get) => ({
  servers: [],
  hydrated: false,
  loading: false,
  saving: false,
  testingIds: [],
  error: null,

  hydrate: async (options) => {
    if (!options?.force && get().hydrated) return;
    if (hydrateInFlight) return hydrateInFlight;

    hydrateInFlight = (async () => {
      set({ loading: true, error: null });
      try {
        const servers = await listMcpServerConfigs();
        set({ servers, hydrated: true, loading: false, error: null });
      } catch (err) {
        set({ loading: false, error: errorMessage(err) });
        throw err;
      }
    })().finally(() => {
      hydrateInFlight = null;
    });

    return hydrateInFlight;
  },

  createServer: async (raw) => {
    const input = normalizeInput(raw);
    const validationError = validateMcpServerInput(input);
    if (validationError) throw new Error(validationError);

    set({ saving: true, error: null });
    try {
      const server = await createMcpServerConfig(input);
      set((state) => ({
        servers: replaceServer(state.servers, server),
        hydrated: true,
        saving: false,
        error: null,
      }));
      return server;
    } catch (err) {
      set({ saving: false, error: errorMessage(err) });
      throw err;
    }
  },

  updateServer: async (raw) => {
    const input = { ...normalizeInput(raw), id: raw.id };
    const validationError = validateMcpServerInput(input);
    if (validationError) throw new Error(validationError);

    set({ saving: true, error: null });
    try {
      const server = await updateMcpServerConfig(input);
      set((state) => ({
        servers: replaceServer(state.servers, server),
        saving: false,
        error: null,
      }));
      return server;
    } catch (err) {
      set({ saving: false, error: errorMessage(err) });
      throw err;
    }
  },

  testServer: async (id) => {
    set((state) => ({
      testingIds: Array.from(new Set([...state.testingIds, id])),
      error: null,
    }));
    try {
      const status = await testMcpServerConfig(id);
      const refreshed = await listMcpServerConfigs();
      set((state) => ({
        servers: refreshed.length > 0 ? refreshed : applyStatus(state.servers, status),
        testingIds: state.testingIds.filter((item) => item !== id),
        error: null,
      }));
      return status;
    } catch (err) {
      set((state) => ({
        testingIds: state.testingIds.filter((item) => item !== id),
        error: errorMessage(err),
      }));
      throw err;
    }
  },

  refreshServer: async (id) => {
    set((state) => ({
      testingIds: Array.from(new Set([...state.testingIds, id])),
      error: null,
    }));
    try {
      const status = await refreshMcpServerToolConfigs(id);
      const refreshed = await listMcpServerConfigs();
      set((state) => ({
        servers: refreshed.length > 0 ? refreshed : applyStatus(state.servers, status),
        testingIds: state.testingIds.filter((item) => item !== id),
        error: null,
      }));
      return status;
    } catch (err) {
      set((state) => ({
        testingIds: state.testingIds.filter((item) => item !== id),
        error: errorMessage(err),
      }));
      throw err;
    }
  },

  setServerEnabled: async (id, enabled) => {
    set({ saving: true, error: null });
    try {
      const server = await setMcpServerEnabledConfig(id, enabled);
      set((state) => ({
        servers: replaceServer(state.servers, server),
        saving: false,
        error: null,
      }));
      return server;
    } catch (err) {
      set({ saving: false, error: errorMessage(err) });
      throw err;
    }
  },

  deleteServer: async (id) => {
    set({ saving: true, error: null });
    try {
      await deleteMcpServerConfig(id);
      set((state) => ({
        servers: state.servers.filter((server) => server.id !== id),
        saving: false,
        error: null,
      }));
    } catch (err) {
      set({ saving: false, error: errorMessage(err) });
      throw err;
    }
  },
}));

/** 重置 MCP store，供单元测试隔离 Zustand 全局状态。 */
export function resetMcpServersStoreForTest() {
  hydrateInFlight = null;
  useMcpServersStore.setState({
    servers: [],
    hydrated: false,
    loading: false,
    saving: false,
    testingIds: [],
    error: null,
  });
}
