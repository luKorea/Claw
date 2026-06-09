import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/customProviders', () => ({
  listCustomProviders: vi.fn(),
  createCustomProvider: vi.fn(),
  updateCustomProvider: vi.fn(),
  deleteCustomProvider: vi.fn(),
}));

import {
  customProviderToModelInfo,
  normalizeBaseUrl,
  resetCustomProvidersStoreForTest,
  useCustomProvidersStore,
  validateCustomProviderInput,
  type CustomProvider,
  type CustomProviderInput,
} from '@/stores/customProviders';
import {
  createCustomProvider,
  deleteCustomProvider,
  listCustomProviders,
  updateCustomProvider,
} from '@/lib/customProviders';
import type { CustomProviderId } from '@/types/providers';

const VALID_INPUT: CustomProviderInput = {
  name: '公司网关',
  protocol: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1/',
  modelIds: ['gpt-test'],
  selectedModelId: 'gpt-test',
  supportsThinking: true,
  supportsTools: false,
  streamMode: 'auto',
};

function makeProvider(
  input: CustomProviderInput,
  id: CustomProviderId = 'custom:mock_provider',
): CustomProvider {
  return {
    id,
    ...input,
    name: input.name.trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

const mockedListCustomProviders = vi.mocked(listCustomProviders);
const mockedCreateCustomProvider = vi.mocked(createCustomProvider);
const mockedUpdateCustomProvider = vi.mocked(updateCustomProvider);
const mockedDeleteCustomProvider = vi.mocked(deleteCustomProvider);

describe('stores/customProviders', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCustomProvidersStoreForTest();
    mockedListCustomProviders.mockReset();
    mockedCreateCustomProvider.mockReset();
    mockedUpdateCustomProvider.mockReset();
    mockedDeleteCustomProvider.mockReset();
    mockedListCustomProviders.mockResolvedValue([]);
    mockedCreateCustomProvider.mockImplementation(async (input) =>
      makeProvider(input, input.id ?? 'custom:mock_provider'),
    );
    mockedUpdateCustomProvider.mockImplementation(async (id, patch) => {
      const current = useCustomProvidersStore
        .getState()
        .providers.find((provider) => provider.id === id);
      if (!current) throw new Error('missing');
      return {
        ...current,
        ...patch,
        updatedAt: current.updatedAt + 1,
      } as CustomProvider;
    });
    mockedDeleteCustomProvider.mockResolvedValue(undefined);
  });

  it('normalizeBaseUrl 去掉尾部斜杠并保留路径', () => {
    expect(normalizeBaseUrl(' https://api.example.com/v1/// ')).toBe(
      'https://api.example.com/v1',
    );
  });

  it('validateCustomProviderInput 拒绝空名称和远程 http', () => {
    expect(validateCustomProviderInput({ ...VALID_INPUT, name: '' })).toBe('模型名称不能为空');
    expect(
      validateCustomProviderInput({
        ...VALID_INPUT,
        baseUrl: 'http://api.example.com/v1',
      }),
    ).toMatch(/https/);
  });

  it('validateCustomProviderInput 允许 localhost http', () => {
    expect(
      validateCustomProviderInput({
        ...VALID_INPUT,
        baseUrl: 'http://localhost:11434/v1',
      }),
    ).toBeNull();
  });

  it('createProvider 创建启用状态的 custom provider 并标准化字段', async () => {
    const provider = await useCustomProvidersStore.getState().createProvider({
      ...VALID_INPUT,
      name: ' 公司网关 ',
      modelIds: [' gpt-test ', 'gpt-test'],
      selectedModelId: ' gpt-test ',
    });

    expect(provider.id).toMatch(/^custom:/);
    expect(provider.name).toBe('公司网关');
    expect(provider.baseUrl).toBe('https://api.example.com/v1');
    expect(mockedCreateCustomProvider).toHaveBeenCalledWith({
      ...VALID_INPUT,
      name: '公司网关',
      baseUrl: 'https://api.example.com/v1',
      modelIds: ['gpt-test'],
      selectedModelId: 'gpt-test',
    });
    expect(provider.selectedModelId).toBe('gpt-test');
    expect(provider.enabled).toBe(true);
    expect(useCustomProvidersStore.getState().providers).toHaveLength(1);
  });

  it('updateProvider 可更新能力开关并保持 ModelInfo 映射正确', async () => {
    const provider = await useCustomProvidersStore.getState().createProvider(VALID_INPUT);

    await useCustomProvidersStore.getState().updateProvider(provider.id, {
      name: '新名称',
      supportsTools: true,
      enabled: false,
    });

    const updated = useCustomProvidersStore.getState().providers[0]!;
    expect(updated.name).toBe('新名称');
    expect(updated.supportsTools).toBe(true);
    expect(updated.enabled).toBe(false);
    expect(customProviderToModelInfo(updated)).toMatchObject({
      id: expect.stringMatching(/^custom-model:/),
      provider: updated.id,
      label: '新名称',
      groupLabel: '自定义',
    });
  });

  it('updateProvider 可切换聊天模式', async () => {
    const provider = await useCustomProvidersStore.getState().createProvider(VALID_INPUT);

    await useCustomProvidersStore.getState().updateProvider(provider.id, {
      streamMode: 'non-stream',
    });

    expect(useCustomProvidersStore.getState().providers[0]?.streamMode).toBe(
      'non-stream',
    );
    expect(mockedUpdateCustomProvider).toHaveBeenCalledWith(provider.id, {
      streamMode: 'non-stream',
    });
  });

  it('createProvider 支持一个 provider 暴露多个模型', async () => {
    const provider = await useCustomProvidersStore.getState().createProvider({
      ...VALID_INPUT,
      modelIds: ['gpt-test', 'gpt-test', 'gpt-other'],
      selectedModelId: 'gpt-other',
    });

    expect(provider.modelIds).toEqual(['gpt-test', 'gpt-other']);
    expect(provider.selectedModelId).toBe('gpt-other');
  });

  it('removeProvider 删除指定 provider', async () => {
    const provider = await useCustomProvidersStore.getState().createProvider(VALID_INPUT);
    await useCustomProvidersStore.getState().removeProvider(provider.id);
    expect(useCustomProvidersStore.getState().providers).toEqual([]);
    expect(mockedDeleteCustomProvider).toHaveBeenCalledWith(provider.id);
  });

  it('hydrate 从 SQLite 加载并迁移旧 localStorage 配置', async () => {
    mockedListCustomProviders.mockResolvedValueOnce([]);
    localStorage.setItem(
      'claw.custom-providers.v1',
      JSON.stringify({
        state: {
          providers: [
            {
              ...makeProvider(VALID_INPUT, 'custom:legacy_provider'),
              modelId: 'gpt-test',
            },
          ],
        },
        version: 2,
      }),
    );

    await useCustomProvidersStore.getState().hydrate();

    expect(mockedCreateCustomProvider).toHaveBeenCalledWith({
      id: 'custom:legacy_provider',
      ...VALID_INPUT,
      baseUrl: 'https://api.example.com/v1',
    });
    expect(useCustomProvidersStore.getState().providers[0]?.id).toBe(
      'custom:legacy_provider',
    );
    expect(localStorage.getItem('claw.custom-providers.v1')).toBeNull();
  });
});
