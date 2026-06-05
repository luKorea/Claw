import { invoke } from '@tauri-apps/api/core';

import { isStaticProviderId, type ProviderId, type StaticProviderId } from '@/types/providers';

export interface ApiKeyStatus {
  configured: boolean;
  preview: string | null;
}

/**
 * 查询某 provider 的 API Key 是否已配置。仅返回存在性 + 脱敏预览。
 * 旧 v1.0 的 `anthropic-api-key` account 会被自动识别为 `anthropic` provider。
 */
export async function getApiKeyStatus(provider: ProviderId): Promise<ApiKeyStatus> {
  return invoke<ApiKeyStatus>('get_api_key_status', { provider });
}

/**
 * 设置某 provider 的 API Key(写入 OS Keychain)。
 * 首次写入 anthropic 时会自动删除旧 v1.0 LEGACY_ACCOUNT。
 */
export async function setApiKey(provider: ProviderId, apiKey: string): Promise<void> {
  return invoke('set_api_key', { provider, apiKey });
}

/** 删除某 provider 的 API Key */
export async function deleteApiKey(provider: ProviderId): Promise<void> {
  return invoke('delete_api_key', { provider });
}

/**
 * 从 Keychain 取出明文 Key。
 * 警告:返回的明文 Key 仅用于当前请求,不应在内存中持久化。
 * 旧 v1.0 legacy account 也会被读取(仅对 anthropic)。
 */
export async function getApiKey(provider: ProviderId): Promise<string> {
  return invoke<string>('get_api_key', { provider });
}

/** 启动时调用,列出所有已配置 key 的 provider id(供设置面板显示) */
export async function listConfiguredProviders(): Promise<StaticProviderId[]> {
  const list = await invoke<string[]>('list_configured_providers');
  // 防御性过滤:后端只返回已知 provider,但前端不能完全信任
  return list.filter((p): p is StaticProviderId => isStaticProviderId(p));
}

/**
 * 调 provider 的 /v1/models 拉取动态模型列表(v1.2 Bug 3.2)。
 * **调用前先调 `getApiKey(provider)`** 拿明文 key,这里直接用现成 key 透传。
 * Anthropic / 未知 provider 由 Rust 端拒绝,前端无需判断。
 */
export async function listProviderModels(
  provider: StaticProviderId,
  apiKey: string,
): Promise<string[]> {
  return invoke<string[]>('list_provider_models', { provider, apiKey });
}
