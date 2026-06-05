/**
 * useGroupedModels hook 测试 (v1.3 重构)
 */

// 必须放在所有 import 之前(vitest 会 hoist)
vi.mock('@/hooks/useModels', () => ({
  useModels: vi.fn(),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useGroupedModels } from '@/hooks/useGroupedModels';
import * as useModelsModule from '@/hooks/useModels';
import * as useSettingsModule from '@/hooks/useSettings';
import { useCustomProvidersStore } from '@/stores/customProviders';
import { useModelsStore } from '@/stores/models';
import { ALL_PROVIDER_IDS, type StaticProviderId } from '@/types/providers';

const mockedUseModels = vi.mocked(useModelsModule.useModels);
const mockedUseSettings = vi.mocked(useSettingsModule.useSettings);

function freshByProvider() {
  return Object.fromEntries(
    ALL_PROVIDER_IDS.map((p) => [
      p,
      { ids: [], loading: false, error: null, fetchedAt: null },
    ]),
  );
}

describe('hooks/useGroupedModels', () => {
  beforeEach(() => {
    useModelsStore.setState({ byProvider: freshByProvider() as never });
    useCustomProvidersStore.setState({ providers: [] });
    mockedUseModels.mockReturnValue({
      ids: () => [],
      loading: () => false,
      error: () => null,
      fetchProvider: vi.fn(),
      retry: vi.fn(),
      clearError: vi.fn(),
      isModelKnown: () => false,
      mergedByProvider: Object.fromEntries(
        ALL_PROVIDER_IDS.map((p) => [p, [] as string[]]),
      ) as Record<StaticProviderId, string[]>,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('空配置:无任何 provider 已配 → 返回空 grouped', () => {
    mockedUseSettings.mockReturnValue({
      configuredProviders: new Set<StaticProviderId>(),
    } as never);

    const { result } = renderHook(() => useGroupedModels());
    expect(result.current.grouped).toEqual({});
  });

  it('只配 anthropic:grouped["Anthropic"] 含全部 anthropic 硬编码模型', () => {
    mockedUseSettings.mockReturnValue({
      configuredProviders: new Set<StaticProviderId>(['anthropic']),
    } as never);

    const { result } = renderHook(() => useGroupedModels());
    const anthropicGroup = result.current.grouped['Anthropic'] ?? [];
    expect(anthropicGroup.length).toBeGreaterThanOrEqual(3);
    expect(anthropicGroup.some((m) => m.id === 'claude-opus-4-8')).toBe(true);
    expect(anthropicGroup.some((m) => m.id === 'claude-sonnet-4-6')).toBe(true);
    // 其他 provider 不应出现
    expect(result.current.grouped['OpenAI']).toBeUndefined();
    expect(result.current.grouped['DeepSeek']).toBeUndefined();
  });

  it('配 openai:grouped["OpenAI"] 含 gpt-5 / gpt-4o', () => {
    mockedUseSettings.mockReturnValue({
      configuredProviders: new Set<StaticProviderId>(['openai']),
    } as never);

    const { result } = renderHook(() => useGroupedModels());
    const openaiGroup = result.current.grouped['OpenAI'] ?? [];
    expect(openaiGroup.some((m) => m.id === 'gpt-5')).toBe(true);
    expect(openaiGroup.some((m) => m.id === 'gpt-4o')).toBe(true);
  });

  it('动态拉取到不存在的 id(仅 API 返回):归到同 provider 的 group', () => {
    mockedUseSettings.mockReturnValue({
      configuredProviders: new Set<StaticProviderId>(['openai']),
    } as never);
    // 模拟动态拉取到 gpt-99-from-api(不在 ALL_MODELS)
    mockedUseModels.mockReturnValue({
      ids: () => [],
      loading: () => false,
      error: () => null,
      fetchProvider: vi.fn(),
      retry: vi.fn(),
      clearError: vi.fn(),
      isModelKnown: (id: string) => id === 'gpt-99-from-api',
      mergedByProvider: {
        anthropic: [],
        deepseek: [],
        openai: ['gpt-99-from-api'],
        minimaxi: [],
      },
    });

    const { result } = renderHook(() => useGroupedModels());
    const openaiGroup = result.current.grouped['OpenAI'] ?? [];
    const dynamic = openaiGroup.find((m) => m.id === 'gpt-99-from-api');
    expect(dynamic).toBeDefined();
    expect(dynamic!.label).toBe('gpt-99-from-api'); // 动态用 id 当 label
    expect(dynamic!.provider).toBe('openai');
    expect(dynamic!.groupLabel).toBe('OpenAI');
  });

  it('动态 + 硬编码混合:同一 provider 既有硬编码又有动态,都进同 group + 去重', () => {
    mockedUseSettings.mockReturnValue({
      configuredProviders: new Set<StaticProviderId>(['openai']),
    } as never);
    mockedUseModels.mockReturnValue({
      ids: () => [],
      loading: () => false,
      error: () => null,
      fetchProvider: vi.fn(),
      retry: vi.fn(),
      clearError: vi.fn(),
      isModelKnown: () => true,
      mergedByProvider: {
        anthropic: [],
        deepseek: [],
        openai: ['gpt-5', 'gpt-99-from-api'], // gpt-5 是硬编码,gpt-99-from-api 是动态
        minimaxi: [],
      },
    });

    const { result } = renderHook(() => useGroupedModels());
    const openaiGroup = result.current.grouped['OpenAI'] ?? [];
    const gpt5 = openaiGroup.filter((m) => m.id === 'gpt-5');
    expect(gpt5.length).toBe(1); // 去重:硬编码 gpt-5 出现 1 次
    expect(openaiGroup.some((m) => m.id === 'gpt-99-from-api')).toBe(true);
  });

  it('启用的自定义 provider 会进入自定义分组', () => {
    mockedUseSettings.mockReturnValue({
      configuredProviders: new Set<StaticProviderId>(),
    } as never);
    useCustomProvidersStore.getState().createProvider({
      name: '本地模型',
      protocol: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      modelId: 'llama3',
      supportsThinking: false,
      supportsTools: false,
    });

    const { result } = renderHook(() => useGroupedModels());
    const customGroup = result.current.grouped['自定义'] ?? [];
    expect(customGroup).toHaveLength(1);
    expect(customGroup[0]).toMatchObject({
      label: '本地模型',
      provider: expect.stringMatching(/^custom:/),
      groupLabel: '自定义',
    });
  });
});
