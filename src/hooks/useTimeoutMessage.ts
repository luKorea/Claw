import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 在 `delayMs` 后自动消失的临时消息。
 *
 * @param delayMs 默认 2000ms
 * @returns `[msg, show, clear]`
 *   - `msg`:当前显示的字符串(无时为 `null`)
 *   - `show(msg)`:显示一条新消息,会自动替换并重置计时器
 *   - `clear()`:手动清空
 */
export function useTimeoutMessage(delayMs = 2000) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setMsg(null);
  }, []);

  const show = useCallback(
    (next: string) => {
      if (timer.current !== null) clearTimeout(timer.current);
      setMsg(next);
      timer.current = setTimeout(() => {
        setMsg(null);
        timer.current = null;
      }, delayMs);
    },
    [delayMs],
  );

  // 卸载时清理
  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  return [msg, show, clear] as const;
}
