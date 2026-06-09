import { create } from 'zustand';

import { now, uuid } from '@/lib/utils';
import {
  createCustomProvider as createCustomProviderConfig,
  deleteCustomProvider as deleteCustomProviderConfig,
  listCustomProviders as listCustomProviderConfigs,
  updateCustomProvider as updateCustomProviderConfig,
} from '@/lib/customProviders';
import {
  isCustomModelId,
  isCustomProviderId,
  makeCustomModelId,
  parseCustomModelId,
  type CustomModelId,
  type CustomProviderId,
  type ModelInfo,
} from '@/types/providers';

export type CustomProviderProtocol = 'openai-compatible' | 'anthropic-compatible';
export type CustomProviderStreamMode = 'auto' | 'stream' | 'non-stream';

export interface CustomProvider {
  id: CustomProviderId;
  name: string;
  protocol: CustomProviderProtocol;
  baseUrl: string;
  modelIds: string[];
  selectedModelId: string;
  enabled: boolean;
  supportsThinking: boolean;
  supportsTools: boolean;
  streamMode: CustomProviderStreamMode;
  createdAt: number;
  updatedAt: number;
}

export interface CustomProviderInput {
  name: string;
  protocol: CustomProviderProtocol;
  baseUrl: string;
  modelIds: string[];
  selectedModelId: string;
  supportsThinking: boolean;
  supportsTools: boolean;
  streamMode: CustomProviderStreamMode;
}

export type CustomProviderPatch = Partial<CustomProviderInput> & { enabled?: boolean };

interface CustomProvidersState {
  providers: CustomProvider[];
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  hydrate: (options?: { force?: boolean }) => Promise<void>;
  createProvider: (input: CustomProviderInput) => Promise<CustomProvider>;
  updateProvider: (id: CustomProviderId, patch: CustomProviderPatch) => Promise<void>;
  removeProvider: (id: CustomProviderId) => Promise<void>;
}

const STORAGE_KEY = 'claw.custom-providers.v1';

interface LegacyCustomProvider
  extends Omit<CustomProvider, 'modelIds' | 'selectedModelId' | 'streamMode'> {
  modelId?: string;
  modelIds?: string[];
  selectedModelId?: string;
  streamMode?: CustomProviderStreamMode;
}

interface PersistedCustomProviders {
  providers?: CustomProvider[];
}

export function makeCustomProviderId(): CustomProviderId {
  return `custom:${uuid()}`;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function validateCustomProviderInput(input: CustomProviderInput): string | null {
  if (!input.name.trim()) return '模型名称不能为空';
  if (input.modelIds.length === 0) return '至少需要一个 Model ID';
  if (!input.selectedModelId.trim()) return '默认 Model ID 不能为空';
  if (!input.modelIds.includes(input.selectedModelId.trim())) {
    return '默认 Model ID 必须在模型列表中';
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (!baseUrl) return 'API Base URL 不能为空';

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return 'API Base URL 格式不正确';
  }

  const isLocalHttp =
    parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    return 'API Base URL 必须使用 https，或本地 localhost http';
  }

  return null;
}

function normalizeModelIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function normalizeInput(input: CustomProviderInput): CustomProviderInput {
  const modelIds = normalizeModelIds(input.modelIds);
  const selectedModelId = input.selectedModelId.trim() || modelIds[0] || '';
  return {
    ...input,
    name: input.name.trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    modelIds,
    selectedModelId,
    streamMode: input.streamMode ?? 'auto',
  };
}

function inputFromProvider(provider: CustomProvider): CustomProviderInput {
  return {
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    modelIds: provider.modelIds,
    selectedModelId: provider.selectedModelId,
    supportsThinking: provider.supportsThinking,
    supportsTools: provider.supportsTools,
    streamMode: provider.streamMode,
  };
}

function normalizePatch(patch: CustomProviderPatch): CustomProviderPatch {
  const next: CustomProviderPatch = {};
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.protocol !== undefined) next.protocol = patch.protocol;
  if (patch.baseUrl !== undefined) next.baseUrl = normalizeBaseUrl(patch.baseUrl);
  if (patch.modelIds !== undefined) next.modelIds = normalizeModelIds(patch.modelIds);
  if (patch.selectedModelId !== undefined) {
    next.selectedModelId = patch.selectedModelId.trim();
  }
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.supportsThinking !== undefined) {
    next.supportsThinking = patch.supportsThinking;
  }
  if (patch.supportsTools !== undefined) next.supportsTools = patch.supportsTools;
  if (patch.streamMode !== undefined) next.streamMode = patch.streamMode;
  return next;
}

function mergePatch(provider: CustomProvider, patch: CustomProviderPatch): CustomProvider {
  const normalizedPatch = normalizePatch(patch);
  const modelIds = normalizedPatch.modelIds ?? provider.modelIds;
  const selectedModelId =
    normalizedPatch.selectedModelId !== undefined
      ? normalizedPatch.selectedModelId
      : modelIds.includes(provider.selectedModelId)
        ? provider.selectedModelId
        : modelIds[0] ?? '';
  return {
    ...provider,
    ...normalizedPatch,
    modelIds,
    selectedModelId,
    updatedAt: now(),
  };
}

export function customProviderToModelInfos(provider: CustomProvider): ModelInfo[] {
  return provider.modelIds.map((modelId) => ({
    id: makeCustomModelId(provider.id, modelId),
    provider: provider.id,
    label:
      provider.modelIds.length === 1 ? provider.name : `${provider.name} · ${modelId}`,
    family: provider.protocol,
    supportsThinking: provider.supportsThinking,
    groupLabel: '自定义',
  }));
}

export function customProviderToModelInfo(provider: CustomProvider): ModelInfo {
  return (
    customProviderToModelInfos(provider).find(
      (model) => model.id === makeCustomModelId(provider.id, provider.selectedModelId),
    ) ?? customProviderToModelInfos(provider)[0]!
  );
}

function migrateProvider(raw: LegacyCustomProvider): CustomProvider | null {
  if (!isCustomProviderId(raw.id)) return null;
  const fromLegacy = raw.modelId ? [raw.modelId] : [];
  const modelIds = normalizeModelIds(raw.modelIds ?? fromLegacy);
  if (modelIds.length === 0) return null;
  const selectedModelId =
    raw.selectedModelId && modelIds.includes(raw.selectedModelId)
      ? raw.selectedModelId
      : modelIds[0]!;
  return {
    ...raw,
    id: raw.id,
    modelIds,
    selectedModelId,
    streamMode: raw.streamMode ?? 'auto',
  };
}

function migratePersistedState(persistedState: unknown): PersistedCustomProviders {
  if (!persistedState || typeof persistedState !== 'object') return { providers: [] };
  const state = persistedState as PersistedCustomProviders;
  return {
    providers: (state.providers ?? [])
      .map(migrateProvider)
      .filter((provider): provider is CustomProvider => provider !== null),
  };
}

function readLegacyProviders(): CustomProvider[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { state?: unknown };
    return migratePersistedState(parsed.state ?? parsed).providers ?? [];
  } catch {
    return [];
  }
}

let hydrateInFlight: Promise<void> | null = null;

export const useCustomProvidersStore = create<CustomProvidersState>((set, get) => ({
  providers: [],
  hydrated: false,
  loading: false,
  error: null,

  hydrate: async (options) => {
    if (!options?.force && get().hydrated) return;
    if (hydrateInFlight) return hydrateInFlight;

    hydrateInFlight = (async () => {
      set({ loading: true, error: null });
      try {
        const remote = await listCustomProviderConfigs();
        const existing = new Set(remote.map((provider) => provider.id));
        const migrated: CustomProvider[] = [];

        for (const legacy of readLegacyProviders()) {
          if (existing.has(legacy.id)) continue;
          const created = await createCustomProviderConfig({
            id: legacy.id,
            ...inputFromProvider(legacy),
          });
          migrated.push(created);
        }

        if (migrated.length > 0 && typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }

        const providers = [...remote, ...migrated].sort(
          (a, b) => a.createdAt - b.createdAt,
        );
        set({ providers, hydrated: true, loading: false, error: null });
      } catch (err) {
        set({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    })().finally(() => {
      hydrateInFlight = null;
    });

    return hydrateInFlight;
  },

  createProvider: async (raw) => {
    const input = normalizeInput(raw);
    const error = validateCustomProviderInput(input);
    if (error) throw new Error(error);
    const provider = await createCustomProviderConfig(input);
    set((state) => ({
      providers: [...state.providers.filter((item) => item.id !== provider.id), provider],
      hydrated: true,
      error: null,
    }));
    return provider;
  },

  updateProvider: async (id, patch) => {
    const current = get().providers.find((provider) => provider.id === id);
    if (!current) throw new Error('自定义 Provider 不存在');
    const next = mergePatch(current, patch);
    const error = validateCustomProviderInput(inputFromProvider(next));
    if (error) throw new Error(error);
    const updated = await updateCustomProviderConfig(id, normalizePatch(patch));
    set((state) => ({
      providers: state.providers.map((provider) =>
        provider.id === id ? updated : provider,
      ),
      error: null,
    }));
  },

  removeProvider: async (id) => {
    await deleteCustomProviderConfig(id);
    set((state) => ({
      providers: state.providers.filter((provider) => provider.id !== id),
      error: null,
    }));
  },
}));

export function resetCustomProvidersStoreForTest(): void {
  hydrateInFlight = null;
  useCustomProvidersStore.setState({
    providers: [],
    hydrated: false,
    loading: false,
    error: null,
  });
}

export function getCustomProvider(id: string): CustomProvider | null {
  return (
    useCustomProvidersStore
      .getState()
      .providers.find((provider) => provider.id === id) ?? null
  );
}

export function listEnabledCustomProviders(): CustomProvider[] {
  return useCustomProvidersStore
    .getState()
    .providers.filter((provider) => provider.enabled);
}

export interface ResolvedCustomModel {
  provider: CustomProvider;
  providerId: CustomProviderId;
  rawModelId: string;
  modelId: CustomModelId;
}

export function resolveCustomModelSelection(id: string): ResolvedCustomModel | null {
  if (isCustomModelId(id)) {
    const parsed = parseCustomModelId(id);
    if (!parsed) return null;
    const provider = getCustomProvider(parsed.providerId);
    if (!provider || !provider.enabled) return null;
    if (!provider.modelIds.includes(parsed.rawModelId)) return null;
    return {
      provider,
      providerId: provider.id,
      rawModelId: parsed.rawModelId,
      modelId: id,
    };
  }

  if (isCustomProviderId(id)) {
    const provider = getCustomProvider(id);
    if (!provider || !provider.enabled) return null;
    return {
      provider,
      providerId: provider.id,
      rawModelId: provider.selectedModelId,
      modelId: makeCustomModelId(provider.id, provider.selectedModelId),
    };
  }

  return null;
}

export function getFirstEnabledCustomModel(): ResolvedCustomModel | null {
  const provider = listEnabledCustomProviders().find(
    (item) => item.modelIds.length > 0 && item.selectedModelId,
  );
  if (!provider) return null;
  return {
    provider,
    providerId: provider.id,
    rawModelId: provider.selectedModelId,
    modelId: makeCustomModelId(provider.id, provider.selectedModelId),
  };
}
