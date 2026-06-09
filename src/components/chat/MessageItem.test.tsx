import { render, screen } from '@testing-library/react';
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

  it('用户昵称不挤在消息气泡里', () => {
    render(<MessageItem message={makeMessage({ role: 'user' })} />);

    const label = screen.getByText('你');
    const text = screen.getByText('hello');
    const bubble = text.closest('.rounded-2xl');

    expect(bubble).not.toBeNull();
    expect(bubble).toHaveClass('rounded-tr-sm');
    expect(bubble).not.toContainElement(label);
  });

  it('助手消息左对齐', () => {
    const { container } = render(<MessageItem message={makeMessage({ role: 'assistant' })} />);
    const row = container.querySelector('[data-role="assistant"]');
    expect(row).not.toBeNull();
    expect(row).not.toHaveClass('flex-row-reverse');
    expect(row).toHaveClass('bg-muted/30');
  });

  it('只有思考过程没有正文时给出明确提示并展开内容', () => {
    render(
      <MessageItem
        message={makeMessage({
          role: 'assistant',
          content: [{ type: 'thinking', thinking: '内部分析' }],
          streaming: false,
        })}
      />,
    );

    expect(screen.getByText('模型只返回思考过程，未返回正文。')).toBeInTheDocument();
    expect(screen.getByText('内部分析')).toBeInTheDocument();
  });
});
