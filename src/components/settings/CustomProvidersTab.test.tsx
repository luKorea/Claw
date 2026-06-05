import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import { CustomProvidersTab } from '@/components/settings/CustomProvidersTab';
import { useCustomProvidersStore } from '@/stores/customProviders';

const mockedInvoke = vi.mocked(invoke);

describe('CustomProvidersTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useCustomProvidersStore.setState({ providers: [] });
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'get_api_key_status') {
        return { configured: false, preview: null };
      }
      return undefined;
    });
  });

  it('添加自定义模型并把 API Key 写入 Keychain', async () => {
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
      modelId: 'llama3',
      enabled: true,
    });
    expect(mockedInvoke).toHaveBeenCalledWith('set_api_key', {
      provider: provider.id,
      apiKey: 'sk-local',
    });
  });

  it('已有自定义模型会展示 Keychain 脱敏状态', async () => {
    const provider = useCustomProvidersStore.getState().createProvider({
      name: '公司网关',
      protocol: 'anthropic-compatible',
      baseUrl: 'https://api.example.com/anthropic',
      modelId: 'claude-compatible',
      supportsThinking: true,
      supportsTools: true,
    });
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'get_api_key_status') {
        expect(args).toEqual({ provider: provider.id });
        return { configured: true, preview: '…1234' };
      }
      return undefined;
    });

    render(<CustomProvidersTab />);

    expect(await screen.findByText('…1234')).toBeInTheDocument();
    expect(screen.getByText('公司网关')).toBeInTheDocument();
    expect(screen.getAllByText(/Anthropic 兼容/).length).toBeGreaterThan(0);
  });
});
