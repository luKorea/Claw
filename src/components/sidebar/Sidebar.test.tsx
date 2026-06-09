import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '@/components/sidebar/Sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useConversations } from '@/hooks/useConversations';
import { useModelSelection } from '@/hooks/useModelSelection';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';

vi.mock('@/hooks/useConversations', () => ({
  useConversations: vi.fn(),
}));

vi.mock('@/hooks/useModelSelection', () => ({
  useModelSelection: vi.fn(),
}));

vi.mock('@/components/sidebar/ConversationList', () => ({
  ConversationList: () => <div data-testid="conversation-list" />,
}));

const mockedUseConversations = vi.mocked(useConversations);
const mockedUseModelSelection = vi.mocked(useModelSelection);

function renderSidebar() {
  return render(
    <TooltipProvider>
      <Sidebar onOpenSettings={() => {}} />
    </TooltipProvider>,
  );
}

describe('Sidebar', () => {
  const createNew = vi.fn();
  const selectModel = vi.fn();

  beforeEach(() => {
    createNew.mockReset();
    selectModel.mockReset();
    useChatStore.setState({ isStreaming: false, error: null });
    useSettingsStore.setState({
      theme: 'light',
      defaultModel: 'MiniMax-M2.7',
      defaultThinkingEnabled: false,
      defaultThinkingBudget: 4_000,
    });
    mockedUseConversations.mockReturnValue({
      current: null,
      createNew,
      update: vi.fn(),
    } as unknown as ReturnType<typeof useConversations>);
    mockedUseModelSelection.mockReturnValue({
      grouped: {
        MiniMax: [
          {
            id: 'MiniMax-M2.7',
            label: 'MiniMax M2.7',
            provider: 'minimaxi',
            family: 'm2',
            supportsThinking: true,
            groupLabel: 'MiniMax',
          },
        ],
        自定义: [
          {
            id: 'custom-model:llm:Coding-Doubao-Seed-2.0',
            label: 'LLM · Coding-Doubao-Seed-2.0-Coding',
            provider: 'custom:llm',
            family: 'openai-compatible',
            supportsThinking: false,
            groupLabel: '自定义',
          },
        ],
      },
      flat: [],
      configuredProviders: new Set(['minimaxi']),
      hasAvailableModels: true,
      firstModelId: 'MiniMax-M2.7',
      isModelAvailable: () => true,
      getModelLabel: () => 'MiniMax M2.7',
      requestedModelId: 'MiniMax-M2.7',
      selectedModelId: 'MiniMax-M2.7',
      selectedLabel: 'MiniMax M2.7',
      invalidModelId: null,
      selectModel,
    } as unknown as ReturnType<typeof useModelSelection>);
  });

  it('侧边栏品牌位使用 Claw logo 资源', () => {
    renderSidebar();

    expect(screen.getByAltText('Claw')).toHaveAttribute(
      'src',
      '/brand/final/claw-ui-mark.svg',
    );
  });

  it('模型选项不额外渲染手动选中勾', () => {
    renderSidebar();

    expect(screen.queryByTestId('sidebar-selected-model-check')).not.toBeInTheDocument();
  });

  it('流式中确认新建会话会中断当前回复并创建新会话', async () => {
    useChatStore.setState({ isStreaming: true });
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /新建会话/ }));
    fireEvent.click(await screen.findByRole('button', { name: '继续' }));

    await waitFor(() => {
      expect(createNew).toHaveBeenCalledTimes(1);
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  it('模型下拉支持搜索长模型名', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /MiniMax M2.7/ }));
    fireEvent.change(screen.getByPlaceholderText('搜索模型'), {
      target: { value: 'Doubao' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Coding-Doubao/ }));

    expect(selectModel).toHaveBeenCalledWith('custom-model:llm:Coding-Doubao-Seed-2.0');
  });

  it('模型列表使用可滚动视口，避免模型较多时被截断', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /MiniMax M2.7/ }));

    const modelList = screen.getByTestId('sidebar-model-list');
    expect(modelList).toHaveClass('max-h-72', 'overflow-y-auto');
    expect(screen.getByRole('button', { name: /Coding-Doubao/ })).toBeInTheDocument();
  });
});
