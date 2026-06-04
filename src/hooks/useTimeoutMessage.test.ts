import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimeoutMessage } from '@/hooks/useTimeoutMessage';

describe('hooks/useTimeoutMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('show(msg) → 立即返回 msg;delayMs 后变 null', () => {
    const { result } = renderHook(() => useTimeoutMessage(1000));
    const [, show] = result.current;

    act(() => {
      show('hello');
    });
    expect(result.current[0]).toBe('hello');

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current[0]).toBe('hello');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current[0]).toBeNull();
  });

  it('重复 show 重置计时器(后一次的延迟覆盖前一次)', () => {
    const { result } = renderHook(() => useTimeoutMessage(1000));
    const [, show] = result.current;

    act(() => {
      show('a');
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    act(() => {
      show('b');
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    // 'a' 的 1000ms 计时器被 'b' 覆盖,此时 'b' 才过 800ms,不应消失
    expect(result.current[0]).toBe('b');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current[0]).toBeNull();
  });

  it('clear() 立即清空 + 取消计时器', () => {
    const { result } = renderHook(() => useTimeoutMessage(1000));
    const [, show, clear] = result.current;

    act(() => {
      show('x');
    });
    act(() => {
      clear();
    });
    expect(result.current[0]).toBeNull();

    // 即使时间流逝也不应再出现
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current[0]).toBeNull();
  });
});
