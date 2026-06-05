import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatHeader } from '@/components/chat/ChatHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useConversations } from '@/hooks/useConversations';
import { useSettingsStore } from '@/stores/settings';
import { DEFAULT_THINKING_BUDGET } from '@/types/claude';

vi.mock('@/hooks/useConversations', () => ({
  useConversations: vi.fn(),
}));

const mockedUseConversations = vi.mocked(useConversations);

function renderHeader() {
  return render(
    <TooltipProvider>
      <ChatHeader />
    </TooltipProvider>,
  );
}

describe('ChatHeader', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      theme: 'light',
      defaultModel: 'MiniMax-M2.7',
      defaultThinkingEnabled: false,
      defaultThinkingBudget: DEFAULT_THINKING_BUDGET,
    });
  });

  it('顶部不再渲染模型下拉，避免和侧边栏当前模型重复', () => {
    mockedUseConversations.mockReturnValue({
      current: null,
      update: vi.fn(),
    } as unknown as ReturnType<typeof useConversations>);

    renderHeader();

    expect(screen.getByText('新会话')).toBeInTheDocument();
    expect(screen.queryByLabelText('模型')).not.toBeInTheDocument();
  });

  it('支持 thinking 的模型仍显示思考开关', () => {
    mockedUseConversations.mockReturnValue({
      current: {
        id: 'c1',
        title: 'Test',
        model: 'MiniMax-M2.7',
        system_prompt: null,
        thinking_enabled: 0,
        thinking_budget: null,
        created_at: 0,
        updated_at: 0,
      },
      update: vi.fn(),
    } as unknown as ReturnType<typeof useConversations>);

    renderHeader();

    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('思考')).toBeInTheDocument();
  });
});
