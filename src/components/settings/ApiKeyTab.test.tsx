import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProviderKeyCard } from '@/components/settings/ApiKeyTab';
import type { ApiKeyState } from '@/hooks/useSettings';

const modelMocks = vi.hoisted(() => ({
  fetchProvider: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('@/hooks/useModels', () => ({
  LISTABLE_PROVIDERS_FRONTEND: ['deepseek', 'openai'],
  useModels: () => ({
    fetchProvider: modelMocks.fetchProvider,
    retry: modelMocks.retry,
  }),
}));

const state: ApiKeyState = {
  configured: false,
  preview: null,
  loading: false,
  saving: false,
  error: null,
};

describe('components/settings/ApiKeyTab ProviderKeyCard', () => {
  beforeEach(() => {
    modelMocks.fetchProvider.mockReset();
    modelMocks.retry.mockReset();
  });

  it('MiniMax Key 提示使用 sk-cp- 前缀', () => {
    render(
      <ProviderKeyCard
        provider="minimaxi"
        state={state}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText('sk-cp-...')).toBeInTheDocument();
    expect(screen.getByText('sk-cp-', { selector: 'code' })).toBeInTheDocument();
  });

  it('保存 MiniMax Key 后不拉取 /v1/models', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ProviderKeyCard
        provider="minimaxi"
        state={state}
        onSave={onSave}
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('sk-cp-...'), {
      target: { value: 'sk-cp-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('sk-cp-test'));
    expect(modelMocks.fetchProvider).not.toHaveBeenCalled();
  });

  it('保存 OpenAI Key 后拉取动态模型列表', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ProviderKeyCard
        provider="openai"
        state={state}
        onSave={onSave}
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('sk-proj-...'), {
      target: { value: 'sk-proj-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('sk-proj-test'));
    expect(modelMocks.fetchProvider).toHaveBeenCalledWith('openai');
  });
});
