import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProviderKeyCard } from '@/components/settings/ApiKeyTab';
import type { ApiKeyState } from '@/hooks/useSettings';

const modelMocks = vi.hoisted(() => ({
  fetchProvider: vi.fn(),
  retry: vi.fn(),
  resetProvider: vi.fn(),
}));

vi.mock('@/hooks/useModels', () => ({
  LISTABLE_PROVIDERS_FRONTEND: ['deepseek', 'openai'],
  useModels: () => ({
    fetchProvider: modelMocks.fetchProvider,
    retry: modelMocks.retry,
    resetProvider: modelMocks.resetProvider,
  }),
}));

const state: ApiKeyState = {
  configured: false,
  preview: null,
  metadataKnown: true,
  loading: false,
  saving: false,
  error: null,
};

describe('components/settings/ApiKeyTab ProviderKeyCard', () => {
  beforeEach(() => {
    modelMocks.fetchProvider.mockReset();
    modelMocks.retry.mockReset();
    modelMocks.resetProvider.mockReset();
  });

  it('MiniMax Key 提示使用 sk-cp- 前缀', () => {
    render(
      <ProviderKeyCard
        provider="minimaxi"
        state={state}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
        onSync={vi.fn()}
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
        onSync={vi.fn()}
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
        onSync={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('sk-proj-...'), {
      target: { value: 'sk-proj-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('sk-proj-test'));
    expect(modelMocks.fetchProvider).toHaveBeenCalledWith('openai', { force: true });
  });

  it('删除 Key 后清空对应 provider 模型缓存', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <ProviderKeyCard
        provider="deepseek"
        state={{ ...state, configured: true }}
        onSave={vi.fn()}
        onRemove={onRemove}
        onRefresh={vi.fn()}
        onSync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));

    await waitFor(() => expect(onRemove).toHaveBeenCalled());
    expect(modelMocks.resetProvider).toHaveBeenCalledWith('deepseek');
  });

  it('未知元数据状态时展示导入旧 Key 操作', async () => {
    const onSync = vi.fn().mockResolvedValue(undefined);
    render(
      <ProviderKeyCard
        provider="anthropic"
        state={{ ...state, metadataKnown: false }}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
        onSync={onSync}
      />,
    );

    expect(screen.getByText('可导入旧 Key')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '导入旧 Key' }));

    await waitFor(() => expect(onSync).toHaveBeenCalled());
  });
});
