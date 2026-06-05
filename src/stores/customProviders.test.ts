import { beforeEach, describe, expect, it } from 'vitest';

import {
  customProviderToModelInfo,
  normalizeBaseUrl,
  useCustomProvidersStore,
  validateCustomProviderInput,
  type CustomProviderInput,
} from '@/stores/customProviders';

const VALID_INPUT: CustomProviderInput = {
  name: '公司网关',
  protocol: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1/',
  modelId: 'gpt-test',
  supportsThinking: true,
  supportsTools: false,
};

describe('stores/customProviders', () => {
  beforeEach(() => {
    localStorage.clear();
    useCustomProvidersStore.setState({ providers: [] });
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

  it('createProvider 创建启用状态的 custom provider 并标准化字段', () => {
    const provider = useCustomProvidersStore.getState().createProvider({
      ...VALID_INPUT,
      name: ' 公司网关 ',
      modelId: ' gpt-test ',
    });

    expect(provider.id).toMatch(/^custom:/);
    expect(provider.name).toBe('公司网关');
    expect(provider.baseUrl).toBe('https://api.example.com/v1');
    expect(provider.modelId).toBe('gpt-test');
    expect(provider.enabled).toBe(true);
    expect(useCustomProvidersStore.getState().providers).toHaveLength(1);
  });

  it('updateProvider 可更新能力开关并保持 ModelInfo 映射正确', () => {
    const provider = useCustomProvidersStore.getState().createProvider(VALID_INPUT);

    useCustomProvidersStore.getState().updateProvider(provider.id, {
      name: '新名称',
      supportsTools: true,
      enabled: false,
    });

    const updated = useCustomProvidersStore.getState().providers[0]!;
    expect(updated.name).toBe('新名称');
    expect(updated.supportsTools).toBe(true);
    expect(updated.enabled).toBe(false);
    expect(customProviderToModelInfo(updated)).toMatchObject({
      id: updated.id,
      provider: updated.id,
      label: '新名称',
      groupLabel: '自定义',
    });
  });

  it('removeProvider 删除指定 provider', () => {
    const provider = useCustomProvidersStore.getState().createProvider(VALID_INPUT);
    useCustomProvidersStore.getState().removeProvider(provider.id);
    expect(useCustomProvidersStore.getState().providers).toEqual([]);
  });
});
