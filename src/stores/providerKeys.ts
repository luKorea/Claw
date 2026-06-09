import { create } from 'zustand';

import {
  deleteApiKey,
  getApiKeyStatus,
  listApiKeyStatuses,
  setApiKey as keyringSetKey,
  syncApiKeyStatus,
} from '@/lib/keyring';
import { ALL_PROVIDER_IDS, type StaticProviderId } from '@/types/providers';

export interface ProviderKeyState {
  configured: boolean;
  preview: string | null;
  metadataKnown: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export type ProviderKeyStateMap = Record<StaticProviderId, ProviderKeyState>;

interface ProviderKeysStore {
  keys: ProviderKeyStateMap;
  initialized: boolean;
  refreshAll: (options?: { force?: boolean }) => Promise<void>;
  refreshOne: (provider: StaticProviderId) => Promise<void>;
  syncOne: (provider: StaticProviderId) => Promise<void>;
  saveKey: (provider: StaticProviderId, key: string) => Promise<void>;
  removeKey: (provider: StaticProviderId) => Promise<void>;
}

const initialKeyState: ProviderKeyState = {
  configured: false,
  preview: null,
  metadataKnown: false,
  loading: true,
  saving: false,
  error: null,
};

function makeInitialMap(): ProviderKeyStateMap {
  return Object.fromEntries(
    ALL_PROVIDER_IDS.map((provider) => [provider, { ...initialKeyState }]),
  ) as ProviderKeyStateMap;
}

let refreshAllInFlight: Promise<void> | null = null;

export const useProviderKeysStore = create<ProviderKeysStore>((set, get) => ({
  keys: makeInitialMap(),
  initialized: false,

  refreshAll: async (options) => {
    if (!options?.force && get().initialized) return;
    if (refreshAllInFlight) return refreshAllInFlight;

    refreshAllInFlight = (async () => {
      set((state) => {
        const next = { ...state.keys };
        for (const provider of ALL_PROVIDER_IDS) {
          next[provider] = { ...next[provider], loading: true, error: null };
        }
        return { keys: next };
      });

      try {
        const statuses = await listApiKeyStatuses();
        set((state) => {
          const next = { ...state.keys };
          for (const provider of ALL_PROVIDER_IDS) {
            const status = statuses[provider] ?? {
              configured: false,
              preview: null,
              metadataKnown: false,
            };
            next[provider] = {
              configured: status.configured,
              preview: status.preview,
              metadataKnown: status.metadataKnown,
              loading: false,
              saving: false,
              error: null,
            };
          }
          return { keys: next, initialized: true };
        });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set((state) => {
          const next = { ...state.keys };
          for (const provider of ALL_PROVIDER_IDS) {
            next[provider] = {
              ...next[provider],
              loading: false,
              saving: false,
              error: message,
            };
          }
          return { keys: next, initialized: true };
        });
      }
    })().finally(() => {
      refreshAllInFlight = null;
    });

    return refreshAllInFlight;
  },

  refreshOne: async (provider) => {
    set((state) => ({
      keys: {
        ...state.keys,
        [provider]: { ...state.keys[provider], loading: true, error: null },
      },
    }));
    try {
      const status = await getApiKeyStatus(provider);
      set((state) => ({
        keys: {
          ...state.keys,
          [provider]: {
            configured: status.configured,
            preview: status.preview,
            metadataKnown: status.metadataKnown,
            loading: false,
            saving: false,
            error: null,
          },
        },
        initialized: true,
      }));
    } catch (err) {
      set((state) => ({
        keys: {
          ...state.keys,
          [provider]: {
            ...state.keys[provider],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      }));
    }
  },

  syncOne: async (provider) => {
    set((state) => ({
      keys: {
        ...state.keys,
        [provider]: { ...state.keys[provider], loading: true, error: null },
      },
    }));
    try {
      const status = await syncApiKeyStatus(provider);
      set((state) => ({
        keys: {
          ...state.keys,
          [provider]: {
            configured: status.configured,
            preview: status.preview,
            metadataKnown: status.metadataKnown,
            loading: false,
            saving: false,
            error: null,
          },
        },
        initialized: true,
      }));
    } catch (err) {
      set((state) => ({
        keys: {
          ...state.keys,
          [provider]: {
            ...state.keys[provider],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      }));
      throw err;
    }
  },

  saveKey: async (provider, key) => {
    set((state) => ({
      keys: {
        ...state.keys,
        [provider]: { ...state.keys[provider], saving: true, error: null },
      },
    }));
    try {
      await keyringSetKey(provider, key);
      await get().refreshOne(provider);
    } catch (err) {
      set((state) => ({
        keys: {
          ...state.keys,
          [provider]: {
            ...state.keys[provider],
            saving: false,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      }));
      throw err;
    }
  },

  removeKey: async (provider) => {
    set((state) => ({
      keys: {
        ...state.keys,
        [provider]: { ...state.keys[provider], saving: true, error: null },
      },
    }));
    try {
      await deleteApiKey(provider);
      await get().refreshOne(provider);
    } catch (err) {
      set((state) => ({
        keys: {
          ...state.keys,
          [provider]: {
            ...state.keys[provider],
            saving: false,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      }));
      throw err;
    }
  },
}));

export function resetProviderKeysStoreForTest(): void {
  refreshAllInFlight = null;
  useProviderKeysStore.setState({ keys: makeInitialMap(), initialized: false });
}
