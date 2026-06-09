import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invoke } from '@tauri-apps/api/core';

import {
  deleteApiKey,
  getApiKey,
  getApiKeyStatus,
  listApiKeyStatuses,
  listConfiguredProviders,
  listProviderModels,
  setApiKey,
  syncApiKeyStatus,
} from '@/lib/keyring';
import { ALL_PROVIDER_IDS } from '@/types/providers';

const mockedInvoke = vi.mocked(invoke);

describe('lib/keyring', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  describe('wrapper invoke 参数', () => {
    it('getApiKeyStatus → invoke("get_api_key_status", { provider })', async () => {
      mockedInvoke.mockResolvedValueOnce({
        configured: true,
        preview: 'sk-…1234',
        metadataKnown: true,
      });
      const r = await getApiKeyStatus('anthropic');
      expect(r).toEqual({
        configured: true,
        preview: 'sk-…1234',
        metadataKnown: true,
      });
      expect(mockedInvoke).toHaveBeenCalledWith('get_api_key_status', { provider: 'anthropic' });
    });

    it('syncApiKeyStatus → invoke("sync_api_key_status", { provider })', async () => {
      mockedInvoke.mockResolvedValueOnce({
        configured: true,
        preview: 'sk-…5678',
        metadataKnown: true,
      });
      const r = await syncApiKeyStatus('deepseek');
      expect(r).toEqual({
        configured: true,
        preview: 'sk-…5678',
        metadataKnown: true,
      });
      expect(mockedInvoke).toHaveBeenCalledWith('sync_api_key_status', {
        provider: 'deepseek',
      });
    });

    it('listApiKeyStatuses → invoke("list_api_key_statuses") 并过滤未知 provider', async () => {
      mockedInvoke.mockResolvedValueOnce({
        anthropic: { configured: true, preview: 'sk-…1234', metadataKnown: true },
        unknown: { configured: true, preview: '…xxxx', metadataKnown: true },
      });
      const r = await listApiKeyStatuses();
      expect(r).toEqual({
        anthropic: { configured: true, preview: 'sk-…1234', metadataKnown: true },
      });
      expect(mockedInvoke).toHaveBeenCalledWith('list_api_key_statuses');
    });

    it('setApiKey → invoke("set_api_key", { provider, apiKey })', async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);
      await setApiKey('openai', 'sk-proj-abc');
      expect(mockedInvoke).toHaveBeenCalledWith('set_api_key', {
        provider: 'openai',
        apiKey: 'sk-proj-abc',
      });
    });

    it('deleteApiKey → invoke("delete_api_key", { provider })', async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);
      await deleteApiKey('deepseek');
      expect(mockedInvoke).toHaveBeenCalledWith('delete_api_key', { provider: 'deepseek' });
    });

    it('getApiKey → invoke("get_api_key", { provider }),返回明文', async () => {
      mockedInvoke.mockResolvedValueOnce('sk-ant-api03-xxx');
      const k = await getApiKey('anthropic');
      expect(k).toBe('sk-ant-api03-xxx');
    });
  });

  describe('listConfiguredProviders (含 minimaxi bug 修复验证)', () => {
    it('过滤未知 provider', async () => {
      mockedInvoke.mockResolvedValueOnce(['anthropic', 'unknown-xyz', 'openai']);
      const r = await listConfiguredProviders();
      expect(r).toEqual(['anthropic', 'openai']);
    });

    it('保留 minimaxi(回归保护 E1 bug fix)', async () => {
      // 旧实现会把 minimaxi 静默丢弃,新实现保留
      mockedInvoke.mockResolvedValueOnce(['minimaxi']);
      const r = await listConfiguredProviders();
      expect(r).toEqual(['minimaxi']);
    });

    it('所有 4 个 provider 都不过滤', async () => {
      mockedInvoke.mockResolvedValueOnce([...ALL_PROVIDER_IDS]);
      const r = await listConfiguredProviders();
      expect(r).toEqual([...ALL_PROVIDER_IDS]);
    });

    it('空列表', async () => {
      mockedInvoke.mockResolvedValueOnce([]);
      const r = await listConfiguredProviders();
      expect(r).toEqual([]);
    });
  });

  describe('listProviderModels (v1.2 Bug 3.2)', () => {
    it('调用 list_provider_models 并透传 provider + apiKey', async () => {
      mockedInvoke.mockResolvedValueOnce(['gpt-5', 'gpt-4o']);
      const r = await listProviderModels('openai', 'sk-test');
      expect(r).toEqual(['gpt-5', 'gpt-4o']);
      expect(mockedInvoke).toHaveBeenCalledWith('list_provider_models', {
        provider: 'openai',
        apiKey: 'sk-test',
      });
    });

    it('anthropic 调用会被 Rust 拒(返回 AppError)', async () => {
      // 不在前端做校验,直接转发给 Rust 决定
      mockedInvoke.mockRejectedValueOnce(
        new Error('provider anthropic 不支持 /v1/models 列表'),
      );
      await expect(listProviderModels('anthropic', 'sk-x')).rejects.toThrow(
        /anthropic/,
      );
    });
  });
});
