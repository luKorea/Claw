import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiKeyState } from '@/hooks/useSettings';
import type { ProviderId } from '@/types/providers';
import { ALL_PROVIDER_IDS } from '@/types/providers';

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
}));

vi.mock('@/components/sidebar/Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar" />,
}));

vi.mock('@/components/chat/ChatLayout', () => ({
  ChatLayout: () => <main data-testid="chat-layout" />,
}));

vi.mock('@/components/settings/SettingsDialog', () => ({
  SettingsDialog: ({ open }: { open: boolean }) => (
    <div data-testid="settings-dialog" data-open={String(open)} />
  ),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}));

vi.mock('@/hooks/useConversations', () => ({
  useConversations: vi.fn(),
}));

vi.mock('@/hooks/useModels', () => ({
  LISTABLE_PROVIDERS_FRONTEND: ['deepseek', 'openai'],
  useModels: vi.fn(),
}));

import App from '@/App';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { useModels } from '@/hooks/useModels';
import { resetCustomProvidersStoreForTest, useCustomProvidersStore } from '@/stores/customProviders';

const mockedUseSettings = vi.mocked(useSettings);
const mockedUseConversations = vi.mocked(useConversations);
const mockedUseModels = vi.mocked(useModels);

const readyMissingKey: ApiKeyState = {
  configured: false,
  preview: null,
  metadataKnown: true,
  loading: false,
  saving: false,
  error: null,
};

function makeKeys(configured: ProviderId[]) {
  return Object.fromEntries(
    ALL_PROVIDER_IDS.map((provider) => [
      provider,
      {
        ...readyMissingKey,
        configured: configured.includes(provider),
      },
    ]),
  ) as Record<ProviderId, ApiKeyState>;
}

describe('App startup API Key guidance', () => {
  const setDefaultModel = vi.fn();

  beforeEach(() => {
    resetCustomProvidersStoreForTest();
    useCustomProvidersStore.setState({ hydrated: true });
    setDefaultModel.mockReset();
    mockedUseConversations.mockReturnValue({
      current: null,
      createNew: vi.fn(),
      update: vi.fn(),
    } as never);
    mockedUseModels.mockReturnValue({
      fetchProvider: vi.fn(),
    } as never);
  });

  it('默认 MiniMax 未配置但 Anthropic 已配置时自动 fallback,不打开设置', async () => {
    mockedUseSettings.mockReturnValue({
      settings: {
        defaultModel: 'MiniMax-M2.7',
        setDefaultModel,
      },
      keys: makeKeys(['anthropic']),
      configuredProviders: new Set<ProviderId>(['anthropic']),
    } as never);

    render(<App />);

    await waitFor(() => expect(setDefaultModel).toHaveBeenCalledWith('claude-opus-4-8'));
    expect(screen.getByTestId('settings-dialog')).toHaveAttribute('data-open', 'false');
  });

  it('没有任何 Provider Key 时打开设置', async () => {
    mockedUseSettings.mockReturnValue({
      settings: {
        defaultModel: 'MiniMax-M2.7',
        setDefaultModel,
      },
      keys: makeKeys([]),
      configuredProviders: new Set<ProviderId>(),
    } as never);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('settings-dialog')).toHaveAttribute('data-open', 'true'),
    );
    expect(setDefaultModel).not.toHaveBeenCalled();
  });

  it('自动打开设置后配置非默认 Provider 会 fallback 并关闭自动引导', async () => {
    let settingsState = {
      settings: {
        defaultModel: 'MiniMax-M2.7',
        setDefaultModel,
      },
      keys: makeKeys([]),
      configuredProviders: new Set<ProviderId>(),
    };
    mockedUseSettings.mockImplementation(() => settingsState as never);

    const { rerender } = render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('settings-dialog')).toHaveAttribute('data-open', 'true'),
    );

    settingsState = {
      settings: {
        defaultModel: 'MiniMax-M2.7',
        setDefaultModel,
      },
      keys: makeKeys(['anthropic']),
      configuredProviders: new Set<ProviderId>(['anthropic']),
    };
    rerender(<App />);

    await waitFor(() => expect(setDefaultModel).toHaveBeenCalledWith('claude-opus-4-8'));

    settingsState = {
      settings: {
        defaultModel: 'claude-opus-4-8',
        setDefaultModel,
      },
      keys: makeKeys(['anthropic']),
      configuredProviders: new Set<ProviderId>(['anthropic']),
    };
    rerender(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('settings-dialog')).toHaveAttribute('data-open', 'false'),
    );
  });
});
