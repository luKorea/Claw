vi.mock('@/hooks/useConversations', () => ({
  useConversations: vi.fn(),
}));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationList } from '@/components/sidebar/ConversationList';
import { useConversations } from '@/hooks/useConversations';
import { useChatStore } from '@/stores/chat';
import type { Conversation } from '@/types/conversation';

const mockedUseConversations = vi.mocked(useConversations);

function makeConversation(id: string, title: string): Conversation {
  return {
    id,
    title,
    model: 'MiniMax-M2.7',
    system_prompt: null,
    thinking_enabled: 0,
    thinking_budget: null,
    created_at: 0,
    updated_at: 0,
  };
}

describe('ConversationList', () => {
  const removeMany = vi.fn();

  beforeEach(() => {
    removeMany.mockReset();
    useChatStore.setState({ isStreaming: false });
    mockedUseConversations.mockReturnValue({
      list: [makeConversation('a', '会话 A'), makeConversation('b', '会话 B')],
      currentId: 'a',
      selectConversation: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      removeMany,
    } as unknown as ReturnType<typeof useConversations>);
  });

  it('选择多条会话后确认批量删除', async () => {
    render(<ConversationList />);

    fireEvent.click(screen.getByRole('button', { name: '选择' }));
    fireEvent.click(screen.getByText('会话 A'));
    fireEvent.click(screen.getByText('会话 B'));
    fireEvent.click(screen.getByRole('button', { name: '删除 2' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('删除 2 个会话')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(removeMany).toHaveBeenCalledWith(['a', 'b']);
    });
  });

  it('流式生成中禁用选择模式入口', () => {
    useChatStore.setState({ isStreaming: true });
    render(<ConversationList />);

    expect(screen.getByRole('button', { name: '选择' })).toBeDisabled();
  });
});
