import { invoke } from '@tauri-apps/api/core';

import type {
  CustomProvider,
  CustomProviderInput,
  CustomProviderPatch,
  CustomProviderProtocol,
  CustomProviderStreamMode,
} from '@/stores/customProviders';
import type { CustomProviderId } from '@/types/providers';

export interface CreateCustomProviderPayload extends CustomProviderInput {
  id?: CustomProviderId;
}

/** 从本机 SQLite 配置读取所有自定义 Provider。 */
export async function listCustomProviders(): Promise<CustomProvider[]> {
  return invoke<CustomProvider[]>('list_custom_providers');
}

/** 创建自定义 Provider 配置。 */
export async function createCustomProvider(
  input: CreateCustomProviderPayload,
): Promise<CustomProvider> {
  return invoke<CustomProvider>('create_custom_provider', { input });
}

/** 更新自定义 Provider 配置。 */
export async function updateCustomProvider(
  id: CustomProviderId,
  patch: CustomProviderPatch,
): Promise<CustomProvider> {
  return invoke<CustomProvider>('update_custom_provider', { id, patch });
}

/** 删除自定义 Provider 配置,并清理对应 API Key。 */
export async function deleteCustomProvider(id: CustomProviderId): Promise<void> {
  await invoke('delete_custom_provider', { id });
}

export interface TestCustomProviderChatInput {
  protocol: CustomProviderProtocol;
  streamMode: CustomProviderStreamMode;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface TestCustomProviderChatResult {
  endpoint: string;
  protocol: CustomProviderProtocol;
  streamMode: CustomProviderStreamMode;
  hasText: boolean;
  hasThinking: boolean;
  preview: string | null;
}

/** 用当前配置发起一条短消息,验证自定义 Provider 聊天链路。 */
export async function testCustomProviderChat(
  input: TestCustomProviderChatInput,
): Promise<TestCustomProviderChatResult> {
  return invoke<TestCustomProviderChatResult>('test_custom_provider_chat', { input });
}
