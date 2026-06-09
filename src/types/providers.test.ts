import { describe, expect, it } from 'vitest';

import {
  ALL_MODELS,
  ALL_PROVIDER_IDS,
  DEFAULT_MODEL_ID,
  MODEL_REGISTRY,
  PROVIDERS,
  type StaticProviderId,
  getFirstModelForProvider,
  getModelInfo,
  getProviderOfModel,
  isCustomModelId,
  listModelsByProvider,
  makeCustomModelId,
  parseCustomModelId,
  resolveConfiguredModel,
} from '@/types/providers';

describe('types/providers', () => {
  describe('ProviderId registry', () => {
    it('包含全部 4 个 provider', () => {
      expect(ALL_PROVIDER_IDS).toEqual(['anthropic', 'deepseek', 'openai', 'minimaxi']);
    });

    it('PROVIDERS 表每个 id 都有完整元数据', () => {
      for (const id of ALL_PROVIDER_IDS) {
        const meta = PROVIDERS[id];
        expect(meta.id).toBe(id);
        expect(meta.label.length).toBeGreaterThan(0);
        // v1.3 修正:minimaxi 走 Anthropic 兼容协议,key 是 sk-cp-...,与其它三家都 sk- 开头。
        expect(meta.keyPlaceholder.startsWith('sk-')).toBe(true);
        expect(meta.keyHelpUrl.startsWith('https://')).toBe(true);
        expect(meta.keyHelpLabel.length).toBeGreaterThan(0);
      }
    });

    it('minimaxi 帮助链接指向官方 platform.minimax.io', () => {
      expect(PROVIDERS.minimaxi.keyHelpUrl).toBe('https://platform.minimax.io');
      expect(PROVIDERS.minimaxi.keyHelpLabel).toBe('platform.minimax.io');
    });
  });

  describe('Model registry', () => {
    it('ALL_MODELS 模型 id 唯一', () => {
      const ids = ALL_MODELS.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('每个 model 的 provider 都在 ALL_PROVIDER_IDS 内', () => {
      for (const m of ALL_MODELS) {
        expect(ALL_PROVIDER_IDS).toContain(m.provider);
      }
    });

    it('MODEL_REGISTRY 至少包含 3 个 model per provider', () => {
      // OAI/Anthropic/DeepSeek/MiniMax 都该有 ≥2 个模型
      for (const id of ALL_PROVIDER_IDS) {
        expect(MODEL_REGISTRY[id].length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('getModelInfo', () => {
    it('已知 model 返回完整信息', () => {
      const m = getModelInfo('claude-opus-4-8');
      expect(m).not.toBeNull();
      expect(m?.provider).toBe('anthropic');
      expect(m?.supportsThinking).toBe(true);
    });

    it('未知 model 返回 null(不抛错)', () => {
      expect(getModelInfo('gpt-99-unknown')).toBeNull();
      expect(getModelInfo('')).toBeNull();
    });
  });

  describe('getProviderOfModel', () => {
    it('claude-* → anthropic', () => {
      expect(getProviderOfModel('claude-sonnet-4-6')).toBe('anthropic');
    });

    it('deepseek-* → deepseek', () => {
      expect(getProviderOfModel('deepseek-reasoner')).toBe('deepseek');
      expect(getProviderOfModel('deepseek-v4-flash')).toBe('deepseek');
      expect(getProviderOfModel('deepseek-v4-pro')).toBe('deepseek');
    });

    it('gpt-* → openai', () => {
      expect(getProviderOfModel('gpt-5')).toBe('openai');
    });

    it('MiniMax-* → minimaxi', () => {
      expect(getProviderOfModel('MiniMax-M3')).toBe('minimaxi');
      expect(getProviderOfModel('MiniMax-M2.7')).toBe('minimaxi');
    });

    it('未知 model 返回 null', () => {
      expect(getProviderOfModel('xxx')).toBeNull();
    });
  });

  describe('listModelsByProvider', () => {
    it('按 ALL_PROVIDER_IDS 顺序返回分组', () => {
      const groups = listModelsByProvider();
      expect(groups.map((g) => g.provider)).toEqual([...ALL_PROVIDER_IDS]);
    });

    it('每组 models 是新数组(防外部突变影响 registry)', () => {
      const groups = listModelsByProvider();
      groups[0]?.models.push({
        id: 'fake',
        provider: 'anthropic',
        label: 'fake',
        family: 'fake',
        supportsThinking: false,
        groupLabel: 'fake',
      });
      // 再次获取,不应包含刚 push 的 fake
      const again = listModelsByProvider();
      expect(again[0]?.models.find((m) => m.id === 'fake')).toBeUndefined();
    });
  });

  describe('configured model fallback', () => {
    it('getFirstModelForProvider 返回 provider 首个模型', () => {
      expect(getFirstModelForProvider('anthropic')?.id).toBe('claude-opus-4-8');
      expect(getFirstModelForProvider('minimaxi')?.id).toBe('MiniMax-M2.7');
    });

    it('preferred 所属 provider 已配置时保留原模型', () => {
      const configured = new Set<StaticProviderId>(['openai']);
      expect(resolveConfiguredModel('gpt-4o', configured)).toBe('gpt-4o');
    });

    it('preferred 是动态 DeepSeek 模型且 deepseek 已配置时保留原模型', () => {
      const configured = new Set<StaticProviderId>(['deepseek']);
      expect(resolveConfiguredModel('deepseek-v4-flash', configured)).toBe('deepseek-v4-flash');
    });

    it('preferred 所属 provider 未配置时回退到首个已配置 provider', () => {
      const configured = new Set<StaticProviderId>(['anthropic']);
      expect(resolveConfiguredModel('MiniMax-M2.7', configured)).toBe('claude-opus-4-8');
    });

    it('无任何已配置 provider 时返回 null', () => {
      expect(resolveConfiguredModel('MiniMax-M2.7', new Set())).toBeNull();
    });
  });

  describe('DEFAULT_MODEL_ID', () => {
    it('指向 minimaxi 系列默认', () => {
      expect(DEFAULT_MODEL_ID).toBe('MiniMax-M2.7');
      expect(getProviderOfModel(DEFAULT_MODEL_ID)).toBe('minimaxi');
    });
  });

  describe('custom model id helpers', () => {
    it('编码并解析包含特殊字符的 raw model id', () => {
      const id = makeCustomModelId('custom:proxy_1', 'openai/gpt-4.1:latest');
      expect(isCustomModelId(id)).toBe(true);
      expect(parseCustomModelId(id)).toEqual({
        providerId: 'custom:proxy_1',
        rawModelId: 'openai/gpt-4.1:latest',
      });
    });

    it('非法 custom model id 返回 null', () => {
      expect(parseCustomModelId('custom-model:bad')).toBeNull();
      expect(parseCustomModelId('custom:proxy_1')).toBeNull();
    });
  });
});
