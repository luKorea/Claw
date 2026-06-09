import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import { CustomProvidersTab } from '@/components/settings/CustomProvidersTab';
import {
  resetCustomProvidersStoreForTest,
  useCustomProvidersStore,
  type CustomProvider,
  type CustomProviderInput,
} from '@/stores/customProviders';
import type { CustomProviderId } from '@/types/providers';

const mockedInvoke = vi.mocked(invoke);

function makeProvider(
  input: CustomProviderInput,
  id: CustomProviderId = 'custom:created_provider',
): CustomProvider {
  return {
    id,
    ...input,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function seedProvider(provider: CustomProvider) {
  useCustomProvidersStore.setState({
    providers: [provider],
    hydrated: true,
    loading: false,
    error: null,
  });
}

async function handleDefaultInvoke(command: string, args?: unknown) {
  if (command === 'list_custom_providers') {
    return [];
  }
  if (command === 'create_custom_provider') {
    const input = (args as { input: CustomProviderInput & { id?: CustomProviderId } })
      .input;
    return makeProvider(input, input.id ?? 'custom:created_provider');
  }
  if (command === 'update_custom_provider') {
    const { id, patch } = args as {
      id: CustomProviderId;
      patch: Partial<CustomProviderInput> & { enabled?: boolean };
    };
    const current = useCustomProvidersStore
      .getState()
      .providers.find((provider) => provider.id === id);
    return current ? { ...current, ...patch, updatedAt: current.updatedAt + 1 } : null;
  }
  if (command === 'delete_custom_provider') {
    return undefined;
  }
  if (command === 'get_api_key_status') {
    return { configured: false, preview: null, metadataKnown: false };
  }
  return undefined;
}

describe('CustomProvidersTab', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCustomProvidersStoreForTest();
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation(handleDefaultInvoke);
  });

  it('添加自定义模型并把 API Key 写入本机配置', async () => {
    render(<CustomProvidersTab />);

    fireEvent.change(screen.getByLabelText('显示名称'), {
      target: { value: '本地模型' },
    });
    fireEvent.change(screen.getByLabelText('API Base URL'), {
      target: { value: 'http://localhost:11434/v1' },
    });
    fireEvent.change(screen.getByLabelText('Model ID'), {
      target: { value: 'llama3' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-local' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加模型' }));

    await waitFor(() => {
      expect(useCustomProvidersStore.getState().providers).toHaveLength(1);
    });
    const provider = useCustomProvidersStore.getState().providers[0]!;
    expect(provider).toMatchObject({
      name: '本地模型',
      protocol: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      modelIds: ['llama3'],
      selectedModelId: 'llama3',
      enabled: true,
    });
    expect(mockedInvoke).toHaveBeenCalledWith('create_custom_provider', {
      input: {
        name: '本地模型',
        protocol: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1',
        modelIds: ['llama3'],
        selectedModelId: 'llama3',
        supportsThinking: false,
        supportsTools: false,
        streamMode: 'auto',
      },
    });
    expect(mockedInvoke).toHaveBeenCalledWith('set_api_key', {
      provider: provider.id,
      apiKey: 'sk-local',
    });
  });

  it('已有自定义模型会展示本机配置脱敏状态', async () => {
    const provider = makeProvider({
      name: '公司网关',
      protocol: 'anthropic-compatible',
      baseUrl: 'https://api.example.com/anthropic',
      modelIds: ['claude-compatible'],
      selectedModelId: 'claude-compatible',
      supportsThinking: true,
      supportsTools: true,
      streamMode: 'auto',
    });
    seedProvider(provider);
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_api_key_status') {
        expect(args).toEqual({ provider: provider.id });
        return { configured: true, preview: '…1234', metadataKnown: true };
      }
      return handleDefaultInvoke(command, args);
    });

    render(<CustomProvidersTab />);

    expect(await screen.findByText('…1234')).toBeInTheDocument();
    expect(screen.getByText('公司网关')).toBeInTheDocument();
    expect(screen.getAllByText(/Anthropic 兼容/).length).toBeGreaterThan(0);
  });

  it('可通过自定义 API 一键获取模型列表并选择默认模型', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_api_key_status') {
        return { configured: false, preview: null, metadataKnown: false };
      }
      if (command === 'list_custom_provider_models') {
        return ['model-a', 'model-b'];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<CustomProvidersTab />);

    fireEvent.change(screen.getByLabelText('显示名称'), {
      target: { value: '代理模型' },
    });
    fireEvent.change(screen.getByLabelText('API Base URL'), {
      target: { value: 'https://api.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-proxy' },
    });
    fireEvent.click(screen.getByRole('button', { name: '获取模型' }));

    await waitFor(() => {
      expect(screen.getAllByText('model-a').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('model-b')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '添加模型' }));

    await waitFor(() => {
      expect(useCustomProvidersStore.getState().providers).toHaveLength(1);
    });
    expect(useCustomProvidersStore.getState().providers[0]).toMatchObject({
      modelIds: ['model-a', 'model-b'],
      selectedModelId: 'model-a',
    });
    expect(mockedInvoke).toHaveBeenCalledWith('list_custom_provider_models', {
      input: {
        protocol: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-proxy',
      },
    });
  });

  it('编辑已有模型时优先使用输入框里的新 Key 获取并保存', async () => {
    const provider = makeProvider({
      name: '公司网关',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      modelIds: ['old-model'],
      selectedModelId: 'old-model',
      supportsThinking: false,
      supportsTools: false,
      streamMode: 'auto',
    });
    seedProvider(provider);
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_api_key_status') {
        return { configured: true, preview: '…old', metadataKnown: true };
      }
      if (command === 'get_api_key') {
        throw new Error('不应读取旧 Key');
      }
      if (command === 'list_custom_provider_models') {
        return ['new-model'];
      }
      return handleDefaultInvoke(command, args);
    });

    render(<CustomProvidersTab />);

    fireEvent.change(await screen.findByPlaceholderText('更新本机 API Key'), {
      target: { value: 'Bearer sk-new' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: '获取模型' })[1]!);

    await waitFor(() => {
      expect(screen.getAllByText('new-model').length).toBeGreaterThan(0);
      expect(screen.queryByText('old-model')).not.toBeInTheDocument();
    });
    expect(mockedInvoke).toHaveBeenCalledWith('list_custom_provider_models', {
      input: {
        protocol: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'Bearer sk-new',
      },
    });
    expect(mockedInvoke).toHaveBeenCalledWith('set_api_key', {
      provider: provider.id,
      apiKey: 'Bearer sk-new',
    });
  });

  it('已有自定义模型可测试聊天链路', async () => {
    const provider = makeProvider({
      name: '公司网关',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      modelIds: ['model-a'],
      selectedModelId: 'model-a',
      supportsThinking: false,
      supportsTools: false,
      streamMode: 'auto',
    });
    seedProvider(provider);
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_api_key_status') {
        return { configured: true, preview: '…test', metadataKnown: true };
      }
      if (command === 'get_api_key') {
        expect(args).toEqual({ provider: provider.id });
        return 'sk-saved';
      }
      if (command === 'test_custom_provider_chat') {
        return {
          endpoint: 'https://api.example.com/v1/chat/completions',
          protocol: 'openai-compatible',
          streamMode: 'auto',
          hasText: true,
          hasThinking: false,
          preview: 'OK',
        };
      }
      return handleDefaultInvoke(command, args);
    });

    render(<CustomProvidersTab />);

    fireEvent.click(await screen.findByRole('button', { name: '测试聊天' }));

    expect(await screen.findByText(/测试通过/)).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith('test_custom_provider_chat', {
      input: {
        protocol: 'openai-compatible',
        streamMode: 'auto',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-saved',
        model: 'model-a',
      },
    });
  });

  it('模型获取 401 时显示友好的鉴权错误', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_api_key_status') {
        return { configured: false, preview: null, metadataKnown: false };
      }
      if (command === 'list_custom_provider_models') {
        throw new Error(
          'Custom provider models HTTP 401 Unauthorized: {"error":{"message":"请提供请求API-Key"}}',
        );
      }
      return handleDefaultInvoke(command, args);
    });

    render(<CustomProvidersTab />);

    fireEvent.change(screen.getByLabelText('显示名称'), {
      target: { value: '代理模型' },
    });
    fireEvent.change(screen.getByLabelText('API Base URL'), {
      target: { value: 'https://api.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-proxy' },
    });
    fireEvent.click(screen.getByRole('button', { name: '获取模型' }));

    expect(await screen.findByText(/鉴权失败/)).toBeInTheDocument();
    expect(screen.queryByText(/请提供请求API-Key/)).not.toBeInTheDocument();
  });

  it('未知自定义 Key 元数据时可手动导入旧 Key', async () => {
    const provider = makeProvider({
      name: '旧网关',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      modelIds: ['old-model'],
      selectedModelId: 'old-model',
      supportsThinking: false,
      supportsTools: false,
      streamMode: 'auto',
    });
    seedProvider(provider);
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_api_key_status') {
        expect(args).toEqual({ provider: provider.id });
        return { configured: false, preview: null, metadataKnown: false };
      }
      if (command === 'sync_api_key_status') {
        expect(args).toEqual({ provider: provider.id });
        return { configured: true, preview: '…9999', metadataKnown: true };
      }
      return handleDefaultInvoke(command, args);
    });

    render(<CustomProvidersTab />);

    fireEvent.click(await screen.findByRole('button', { name: '导入旧 Key' }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('sync_api_key_status', {
        provider: provider.id,
      });
    });
    expect(await screen.findByText('…9999')).toBeInTheDocument();
  });

  it('未知自定义 Key 元数据且未输入 Key 时获取模型不会读取配置明文', async () => {
    const provider = makeProvider({
      name: '旧网关',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      modelIds: ['old-model'],
      selectedModelId: 'old-model',
      supportsThinking: false,
      supportsTools: false,
      streamMode: 'auto',
    });
    seedProvider(provider);
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_api_key_status') {
        expect(args).toEqual({ provider: provider.id });
        return { configured: false, preview: null, metadataKnown: false };
      }
      if (command === 'get_api_key') {
        throw new Error('不应读取明文 Key');
      }
      return handleDefaultInvoke(command, args);
    });

    render(<CustomProvidersTab />);

    fireEvent.click((await screen.findAllByRole('button', { name: '获取模型' }))[1]!);

    expect(
      await screen.findByText('请先填写 API Key，或点击导入旧 Key 后再获取模型'),
    ).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith('get_api_key', {
      provider: provider.id,
    });
  });
});
