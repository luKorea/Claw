import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MessageItem } from '@/components/chat/MessageItem';
import type { ChatMessage } from '@/types/claude';

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    content: [{ type: 'text', text: 'hello' }],
    createdAt: 0,
    ...overrides,
  };
}

describe('MessageItem', () => {
  it('用户消息右对齐', () => {
    const { container } = render(<MessageItem message={makeMessage({ role: 'user' })} />);
    const row = container.querySelector('[data-role="user"]');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('flex-row-reverse');
  });

  it('助手消息左对齐', () => {
    const { container } = render(<MessageItem message={makeMessage({ role: 'assistant' })} />);
    const row = container.querySelector('[data-role="assistant"]');
    expect(row).not.toBeNull();
    expect(row).not.toHaveClass('flex-row-reverse');
    expect(row).toHaveClass('bg-muted/30');
  });
});
