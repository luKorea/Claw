import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { now, uuid } from '@/lib/utils';
import type { CustomProviderId, ModelInfo } from '@/types/providers';

export type CustomProviderProtocol = 'openai-compatible' | 'anthropic-compatible';

export interface CustomProvider {
  id: CustomProviderId;
  name: string;
  protocol: CustomProviderProtocol;
  baseUrl: string;
  modelId: string;
  enabled: boolean;
  supportsThinking: boolean;
  supportsTools: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CustomProviderInput {
  name: string;
  protocol: CustomProviderProtocol;
  baseUrl: string;
  modelId: string;
  supportsThinking: boolean;
  supportsTools: boolean;
}

interface CustomProvidersState {
  providers: CustomProvider[];
  createProvider: (input: CustomProviderInput) => CustomProvider;
  updateProvider: (
    id: CustomProviderId,
    patch: Partial<CustomProviderInput> & { enabled?: boolean },
  ) => void;
  removeProvider: (id: CustomProviderId) => void;
}

const STORAGE_KEY = 'claw.custom-providers.v1';

export function makeCustomProviderId(): CustomProviderId {
  return `custom:${uuid()}`;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function validateCustomProviderInput(input: CustomProviderInput): string | null {
  if (!input.name.trim()) return '模型名称不能为空';
  if (!input.modelId.trim()) return 'Model ID 不能为空';
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

function normalizeInput(input: CustomProviderInput): CustomProviderInput {
  return {
    ...input,
    name: input.name.trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    modelId: input.modelId.trim(),
  };
}

export function customProviderToModelInfo(provider: CustomProvider): ModelInfo {
  return {
    id: provider.id,
    provider: provider.id,
    label: provider.name,
    family: provider.protocol,
    supportsThinking: provider.supportsThinking,
    groupLabel: '自定义',
  };
}

export const useCustomProvidersStore = create<CustomProvidersState>()(
  persist(
    (set) => ({
      providers: [],
      createProvider: (raw) => {
        const input = normalizeInput(raw);
        const error = validateCustomProviderInput(input);
        if (error) throw new Error(error);
        const timestamp = now();
        const provider: CustomProvider = {
          id: makeCustomProviderId(),
          ...input,
          enabled: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        set((state) => ({ providers: [...state.providers, provider] }));
        return provider;
      },
      updateProvider: (id, patch) => {
        set((state) => ({
          providers: state.providers.map((provider) => {
            if (provider.id !== id) return provider;
            const next = {
              ...provider,
              ...patch,
              baseUrl:
                patch.baseUrl !== undefined
                  ? normalizeBaseUrl(patch.baseUrl)
                  : provider.baseUrl,
              name: patch.name !== undefined ? patch.name.trim() : provider.name,
              modelId:
                patch.modelId !== undefined ? patch.modelId.trim() : provider.modelId,
              updatedAt: now(),
            };
            const error = validateCustomProviderInput(next);
            if (error) throw new Error(error);
            return next;
          }),
        }));
      },
      removeProvider: (id) =>
        set((state) => ({
          providers: state.providers.filter((provider) => provider.id !== id),
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ providers: state.providers }),
    },
  ),
);

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

