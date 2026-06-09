vi.mock('@/lib/keyring', () => ({
  getApiKeyStatus: vi.fn(),
  listApiKeyStatuses: vi.fn(),
  syncApiKeyStatus: vi.fn(),
  setApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetProviderKeysStoreForTest,
  useProviderKeysStore,
} from '@/stores/providerKeys';
import {
  deleteApiKey,
  getApiKeyStatus,
  listApiKeyStatuses,
  setApiKey,
  syncApiKeyStatus,
} from '@/lib/keyring';
import type { StaticProviderId } from '@/types/providers';

const mockedGetApiKeyStatus = vi.mocked(getApiKeyStatus);
const mockedListApiKeyStatuses = vi.mocked(listApiKeyStatuses);
const mockedSyncApiKeyStatus = vi.mocked(syncApiKeyStatus);
const mockedSetApiKey = vi.mocked(setApiKey);
const mockedDeleteApiKey = vi.mocked(deleteApiKey);

function statusFor(provider: StaticProviderId) {
  return {
    configured: provider === 'deepseek',
    preview: provider === 'deepseek' ? '…seek' : null,
    metadataKnown: true,
  };
}

describe('stores/providerKeys', () => {
  beforeEach(() => {
    resetProviderKeysStoreForTest();
    mockedGetApiKeyStatus.mockReset();
    mockedListApiKeyStatuses.mockReset();
    mockedSyncApiKeyStatus.mockReset();
    mockedSetApiKey.mockReset();
    mockedDeleteApiKey.mockReset();
  });

  it('refreshAll 写入所有 provider 的配置状态', async () => {
    mockedListApiKeyStatuses.mockResolvedValue(
      Object.fromEntries(
        (['anthropic', 'deepseek', 'openai', 'minimaxi'] as StaticProviderId[]).map(
          (provider) => [provider, statusFor(provider)],
        ),
      ),
    );

    await useProviderKeysStore.getState().refreshAll();

    const state = useProviderKeysStore.getState();
    expect(state.initialized).toBe(true);
    expect(state.keys.deepseek).toMatchObject({
      configured: true,
      preview: '…seek',
      metadataKnown: true,
      loading: false,
    });
    expect(state.keys.openai.configured).toBe(false);
    expect(mockedGetApiKeyStatus).not.toHaveBeenCalled();
  });

  it('saveKey 和 removeKey 都会刷新对应 provider 状态', async () => {
    mockedGetApiKeyStatus.mockResolvedValue({
      configured: true,
      preview: '…1234',
      metadataKnown: true,
    });

    await useProviderKeysStore.getState().saveKey('openai', 'sk-test');
    expect(mockedSetApiKey).toHaveBeenCalledWith('openai', 'sk-test');
    expect(useProviderKeysStore.getState().keys.openai.configured).toBe(true);

    mockedGetApiKeyStatus.mockResolvedValueOnce({
      configured: false,
      preview: null,
      metadataKnown: true,
    });
    await useProviderKeysStore.getState().removeKey('openai');
    expect(mockedDeleteApiKey).toHaveBeenCalledWith('openai');
    expect(useProviderKeysStore.getState().keys.openai.configured).toBe(false);
  });

  it('syncOne 显式同步旧 Keychain 状态', async () => {
    mockedSyncApiKeyStatus.mockResolvedValueOnce({
      configured: true,
      preview: '…sync',
      metadataKnown: true,
    });

    await useProviderKeysStore.getState().syncOne('anthropic');

    expect(mockedSyncApiKeyStatus).toHaveBeenCalledWith('anthropic');
    expect(useProviderKeysStore.getState().keys.anthropic).toMatchObject({
      configured: true,
      preview: '…sync',
      metadataKnown: true,
      loading: false,
    });
  });
});
