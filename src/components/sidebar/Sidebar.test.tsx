import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '@/components/sidebar/Sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useConversations } from '@/hooks/useConversations';
import { useGroupedModels } from '@/hooks/useGroupedModels';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';

vi.mock('@/hooks/useConversations', () => ({
  useConversations: vi.fn(),
}));

vi.mock('@/hooks/useGroupedModels', () => ({
  useGroupedModels: vi.fn(),
}));

vi.mock('@/components/sidebar/ConversationList', () => ({
  ConversationList: () => <div data-testid="conversation-list" />,
}));

const mockedUseConversations = vi.mocked(useConversations);
const mockedUseGroupedModels = vi.mocked(useGroupedModels);

function renderSidebar() {
  return render(
    <TooltipProvider>
      <Sidebar onOpenSettings={() => {}} />
    </TooltipProvider>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    useChatStore.setState({ isStreaming: false, error: null });
    useSettingsStore.setState({
      theme: 'light',
      defaultModel: 'MiniMax-M2.7',
      defaultThinkingEnabled: false,
      defaultThinkingBudget: 4_000,
    });
    mockedUseConversations.mockReturnValue({
      current: null,
      createNew: vi.fn(),
      update: vi.fn(),
    } as unknown as ReturnType<typeof useConversations>);
    mockedUseGroupedModels.mockReturnValue({
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
      },
    } as unknown as ReturnType<typeof useGroupedModels>);
  });

  it('侧边栏品牌位使用 Claw logo 资源', () => {
    renderSidebar();

    expect(screen.getByAltText('Claw')).toHaveAttribute(
      'src',
      '/brand/final/claw-ui-mark.svg',
    );
  });
});
