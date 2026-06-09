import { invoke } from '@tauri-apps/api/core';

import { isStaticProviderId, type ProviderId, type StaticProviderId } from '@/types/providers';
import type { CustomProviderProtocol } from '@/stores/customProviders';

export interface ApiKeyStatus {
  configured: boolean;
  preview: string | null;
  metadataKnown: boolean;
}

/**
 * 查询某 provider 的 API Key 配置状态。仅返回存在性 + 脱敏预览。
 * 旧版本 Keychain 状态需用户显式调用 syncApiKeyStatus 导入。
 */
export async function getApiKeyStatus(provider: ProviderId): Promise<ApiKeyStatus> {
  return invoke<ApiKeyStatus>('get_api_key_status', { provider });
}

/** 一次性读取所有内置 Provider 的 Key 配置状态。 */
export async function listApiKeyStatuses(): Promise<Partial<Record<StaticProviderId, ApiKeyStatus>>> {
  const statuses = await invoke<Record<string, ApiKeyStatus>>('list_api_key_statuses');
  return Object.fromEntries(
    Object.entries(statuses).filter(([provider]) => isStaticProviderId(provider)),
  ) as Partial<Record<StaticProviderId, ApiKeyStatus>>;
}

/**
 * 显式从旧 Keychain 导入某 provider 的 Key。
 * 会读取一次系统 Keychain,仅用于用户手动迁移旧版本已保存的 Key。
 */
export async function syncApiKeyStatus(provider: ProviderId): Promise<ApiKeyStatus> {
  return invoke<ApiKeyStatus>('sync_api_key_status', { provider });
}

/**
 * 设置某 provider 的 API Key(写入本机 SQLite 配置文件)。
 */
export async function setApiKey(provider: ProviderId, apiKey: string): Promise<void> {
  return invoke('set_api_key', { provider, apiKey });
}

/** 删除某 provider 的 API Key */
export async function deleteApiKey(provider: ProviderId): Promise<void> {
  return invoke('delete_api_key', { provider });
}

/**
 * 从本机 SQLite 配置文件取出明文 Key。
 * 警告:返回的明文 Key 仅用于当前请求,不应在前端持久化。
 */
export async function getApiKey(provider: ProviderId): Promise<string> {
  return invoke<string>('get_api_key', { provider });
}

/** 启动时调用,从本机配置列出所有已配置 key 的静态 provider id(供设置面板显示) */
export async function listConfiguredProviders(): Promise<StaticProviderId[]> {
  const list = await invoke<string[]>('list_configured_providers');
  // 防御性过滤:后端只返回已知 provider,但前端不能完全信任
  return list.filter((p): p is StaticProviderId => isStaticProviderId(p));
}

/**
 * 调 provider 的 /v1/models 拉取动态模型列表(v1.2 Bug 3.2)。
 * **调用前先调 `getApiKey(provider)`** 拿本机配置中的明文 key,这里直接用现成 key 透传。
 * Anthropic / 未知 provider 由 Rust 端拒绝,前端无需判断。
 */
export async function listProviderModels(
  provider: StaticProviderId,
  apiKey: string,
): Promise<string[]> {
  return invoke<string[]>('list_provider_models', { provider, apiKey });
}

export interface ListCustomProviderModelsInput {
  protocol: CustomProviderProtocol;
  baseUrl: string;
  apiKey: string;
}

/** 拉取自定义 OpenAI/Anthropic 兼容网关暴露的模型列表。 */
export async function listCustomProviderModels(
  input: ListCustomProviderModelsInput,
): Promise<string[]> {
  return invoke<string[]>('list_custom_provider_models', { input });
}
