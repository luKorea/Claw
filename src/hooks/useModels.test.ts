/**
 * useModels hook 测试 (v1.2 Bug 3.2)
 */

// 整模块 mock 必须放在所有 import 之前(vitest 会 hoist)
vi.mock('@/lib/keyring', () => ({
  getApiKey: vi.fn(),
  listProviderModels: vi.fn(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useModelsStore, type ProviderModelState } from '@/stores/models';
import { useModels } from '@/hooks/useModels';
import { ALL_PROVIDER_IDS, type ProviderId } from '@/types/providers';
import * as keyring from '@/lib/keyring';

const mockedGetApiKey = vi.mocked(keyring.getApiKey);
const mockedListProviderModels = vi.mocked(keyring.listProviderModels);

function freshByProvider(): Record<ProviderId, ProviderModelState> {
  return Object.fromEntries(
    ALL_PROVIDER_IDS.map((p) => [p, { ids: [], loading: false, error: null, fetchedAt: null }]),
  ) as unknown as Record<ProviderId, ProviderModelState>;
}

describe('hooks/useModels', () => {
  beforeEach(() => {
    localStorage.clear();
    useModelsStore.setState({ byProvider: freshByProvider() });
    mockedGetApiKey.mockReset();
    mockedListProviderModels.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('初始 store 全空', () => {
    const { result } = renderHook(() => useModels());
    expect(result.current.ids('deepseek')).toEqual([]);
    expect(result.current.loading('deepseek')).toBe(false);
    expect(result.current.error('deepseek')).toBeNull();
  });

  it('fetchProvider 成功:写 ids + loading false + error null + 持久化到 localStorage', async () => {
    mockedGetApiKey.mockResolvedValueOnce('sk-test');
    mockedListProviderModels.mockResolvedValueOnce(['gpt-5', 'gpt-4o']);

    const { result } = renderHook(() => useModels());
    await act(async () => {
      await result.current.fetchProvider('openai');
    });

    expect(mockedListProviderModels).toHaveBeenCalledWith('openai', 'sk-test');
    expect(result.current.ids('openai')).toEqual(['gpt-5', 'gpt-4o']);
    expect(result.current.error('openai')).toBeNull();

    // 持久化检查
    const persisted = JSON.parse(localStorage.getItem('claw.models.v1') ?? '{}');
    expect(persisted.state.byProvider.openai.ids).toEqual(['gpt-5', 'gpt-4o']);
  });

  it('fetchProvider 失败:写 error + 保留旧 ids(不覆盖)', async () => {
    // 预置旧 ids(注意:setIds 会同步设 fetchedAt,会触发 24h 缓存命中跳过,
    // 所以先 setIds 再手动把 fetchedAt 改到 25h 之前强制走 fetch 路径)
    act(() => {
      useModelsStore.setState((s) => ({
        ...s,
        byProvider: {
          ...s.byProvider,
          deepseek: {
            ids: ['deepseek-chat'],
            loading: false,
            error: null,
            fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25h ago,过期
          },
        },
      }));
    });
    expect(useModelsStore.getState().byProvider.deepseek.ids).toEqual(['deepseek-chat']);

    mockedGetApiKey.mockRejectedValueOnce(new Error('key not configured'));

    const { result } = renderHook(() => useModels());
    await act(async () => {
      await result.current.fetchProvider('deepseek');
    });

    // ids 保留旧值
    expect(result.current.ids('deepseek')).toEqual(['deepseek-chat']);
    // error 写入
    expect(result.current.error('deepseek')).toBe('key not configured');
  });

  it('24h 缓存命中:有 fetchedAt 且 ids 非空,跳过 fetch', async () => {
    // 预置 1 小时前拉过的 cache
    act(() => {
      useModelsStore.setState((s) => ({
        ...s,
        byProvider: {
          ...s.byProvider,
          openai: {
            ids: ['gpt-5'],
            loading: false,
            error: null,
            fetchedAt: Date.now() - 60 * 60 * 1000,
          },
        },
      }));
    });

    const { result } = renderHook(() => useModels());
    await act(async () => {
      await result.current.fetchProvider('openai');
    });

    expect(mockedListProviderModels).not.toHaveBeenCalled();
    expect(result.current.ids('openai')).toEqual(['gpt-5']);
  });

  it('fetchProvider force 会绕过 24h 缓存重新拉取', async () => {
    act(() => {
      useModelsStore.setState((s) => ({
        ...s,
        byProvider: {
          ...s.byProvider,
          openai: {
            ids: ['gpt-5'],
            loading: false,
            error: null,
            fetchedAt: Date.now(),
          },
        },
      }));
    });
    mockedGetApiKey.mockResolvedValueOnce('sk-test');
    mockedListProviderModels.mockResolvedValueOnce(['gpt-new']);

    const { result } = renderHook(() => useModels());
    await act(async () => {
      await result.current.fetchProvider('openai', { force: true });
    });

    expect(mockedListProviderModels).toHaveBeenCalledWith('openai', 'sk-test');
    expect(result.current.ids('openai')).toEqual(['gpt-new']);
  });

  it('isModelKnown:硬编码 ∪ 动态 ids', () => {
    act(() => {
      useModelsStore.getState().setIds('openai', ['gpt-5-from-api']);
    });

    const { result } = renderHook(() => useModels());
    expect(result.current.isModelKnown('gpt-5', 'openai')).toBe(true);
    expect(result.current.isModelKnown('gpt-5-from-api', 'openai')).toBe(true);
    expect(result.current.isModelKnown('gpt-99-unknown', 'openai')).toBe(false);
    expect(result.current.isModelKnown('gpt-5', 'anthropic')).toBe(false);
  });

  it('mergedByProvider:动态优先 + 硬编码 fallback + 去重', () => {
    act(() => {
      useModelsStore.getState().setIds('openai', ['gpt-5', 'gpt-new-from-api']);
    });

    const { result } = renderHook(() => useModels());
    const merged = result.current.mergedByProvider;
    expect(merged.openai).toContain('gpt-5');
    expect(merged.openai).toContain('gpt-new-from-api');
    expect(merged.openai).toContain('gpt-5-mini');
    expect(merged.openai).toContain('gpt-4o');
    expect(merged.openai.filter((id: string) => id === 'gpt-5').length).toBe(1);
    expect(merged.anthropic).toEqual(
      expect.arrayContaining([
        'claude-opus-4-8',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
      ]),
    );
  });

  it('retry:清空状态后重新 fetchProvider,真的再调一次 listProviderModels', async () => {
    // 预置 1h 内拉过的 cache(此时直接 fetchProvider 不会真发请求)
    act(() => {
      useModelsStore.setState((s) => ({
        ...s,
        byProvider: {
          ...s.byProvider,
          openai: {
            ids: ['gpt-5'],
            loading: false,
            error: null,
            fetchedAt: Date.now() - 60 * 60 * 1000,
          },
        },
      }));
    });

    mockedGetApiKey.mockResolvedValue('sk-test');
    mockedListProviderModels.mockResolvedValue(['gpt-5', 'gpt-4o-mini']);

    const { result } = renderHook(() => useModels());
    await act(async () => {
      await result.current.retry('openai');
    });

    // retry 必须真正调 listProviderModels(不命中 24h 缓存)
    expect(mockedListProviderModels).toHaveBeenCalledTimes(1);
    expect(result.current.ids('openai')).toEqual(['gpt-5', 'gpt-4o-mini']);
  });

  it('clearError:只清 error 字段,保留旧 ids 与 fetchedAt', () => {
    act(() => {
      useModelsStore.setState((s) => ({
        ...s,
        byProvider: {
          ...s.byProvider,
          openai: {
            ids: ['gpt-5'],
            loading: false,
            error: 'boom',
            fetchedAt: 1000,
          },
        },
      }));
    });

    const { result } = renderHook(() => useModels());
    act(() => {
      result.current.clearError('openai');
    });

    expect(result.current.error('openai')).toBeNull();
    expect(result.current.ids('openai')).toEqual(['gpt-5']);
  });

  it('resetProvider 清空指定 provider 的动态模型缓存', () => {
    act(() => {
      useModelsStore.getState().setIds('deepseek', ['deepseek-chat']);
    });

    const { result } = renderHook(() => useModels());
    act(() => {
      result.current.resetProvider('deepseek');
    });

    expect(result.current.ids('deepseek')).toEqual([]);
    expect(result.current.error('deepseek')).toBeNull();
  });
});
