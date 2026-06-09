import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import {
  createCustomProvider,
  deleteCustomProvider,
  listCustomProviders,
  testCustomProviderChat,
  updateCustomProvider,
} from '@/lib/customProviders';
import type { CustomProvider } from '@/stores/customProviders';

const mockedInvoke = vi.mocked(invoke);

const provider: CustomProvider = {
  id: 'custom:test',
  name: '测试网关',
  protocol: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  modelIds: ['model-a'],
  selectedModelId: 'model-a',
  enabled: true,
  supportsThinking: false,
  supportsTools: true,
  streamMode: 'auto',
  createdAt: 1,
  updatedAt: 1,
};

describe('lib/customProviders', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('listCustomProviders 调用 list_custom_providers', async () => {
    mockedInvoke.mockResolvedValueOnce([provider]);

    await expect(listCustomProviders()).resolves.toEqual([provider]);
    expect(mockedInvoke).toHaveBeenCalledWith('list_custom_providers');
  });

  it('createCustomProvider 透传 input', async () => {
    mockedInvoke.mockResolvedValueOnce(provider);
    const input = {
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      modelIds: provider.modelIds,
      selectedModelId: provider.selectedModelId,
      supportsThinking: provider.supportsThinking,
      supportsTools: provider.supportsTools,
      streamMode: provider.streamMode,
    };

    await expect(createCustomProvider(input)).resolves.toEqual(provider);
    expect(mockedInvoke).toHaveBeenCalledWith('create_custom_provider', { input });
  });

  it('updateCustomProvider 透传 id 和 patch', async () => {
    mockedInvoke.mockResolvedValueOnce({ ...provider, enabled: false });
    const patch = { enabled: false };

    await expect(updateCustomProvider(provider.id, patch)).resolves.toMatchObject(patch);
    expect(mockedInvoke).toHaveBeenCalledWith('update_custom_provider', {
      id: provider.id,
      patch,
    });
  });

  it('deleteCustomProvider 调用 delete_custom_provider', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);

    await deleteCustomProvider(provider.id);
    expect(mockedInvoke).toHaveBeenCalledWith('delete_custom_provider', {
      id: provider.id,
    });
  });

  it('testCustomProviderChat 调用 test_custom_provider_chat', async () => {
    mockedInvoke.mockResolvedValueOnce({
      endpoint: 'https://api.example.com/v1/chat/completions',
      streamMode: 'auto',
      hasText: true,
      hasThinking: false,
      preview: 'OK',
    });

    const input = {
      protocol: 'openai-compatible' as const,
      streamMode: 'auto' as const,
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'model-a',
    };

    await expect(testCustomProviderChat(input)).resolves.toMatchObject({ hasText: true });
    expect(mockedInvoke).toHaveBeenCalledWith('test_custom_provider_chat', { input });
  });
});
