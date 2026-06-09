import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleEngineEvent } from '@/hooks/useChat';
import { useChatStore } from '@/stores/chat';

describe('hooks/useChat handleEngineEvent', () => {
  beforeEach(() => {
    useChatStore.getState().clear();
  });

  it('error 事件结束最近的 assistant streaming 并写入错误', async () => {
    useChatStore.getState().appendMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: [],
      streaming: true,
      createdAt: 1,
    });

    await handleEngineEvent(
      { type: 'error', message: '代理请求失败', recoverable: true },
      {
        onToolResult: vi.fn(),
        onPersist: vi.fn(),
      },
    );

    expect(useChatStore.getState().messages[0]?.streaming).toBe(false);
    expect(useChatStore.getState().error).toBe('代理请求失败');
  });
});
