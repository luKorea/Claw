import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useToolEnabled } from '@/hooks/useToolEnabled';
import { DEFAULT_DISABLED_TOOLS, useToolsStore } from '@/stores/tools';

beforeEach(() => {
  act(() => {
    useToolsStore.setState({ disabled: [...DEFAULT_DISABLED_TOOLS] });
  });
});

describe('hooks/useToolEnabled', () => {
  it('默认 read_file 启用', () => {
    const { result } = renderHook(() => useToolEnabled('read_file'));
    expect(result.current).toBe(true);
  });

  it('默认 write_file 禁用', () => {
    act(() => {
      useToolsStore.setState({ disabled: [...DEFAULT_DISABLED_TOOLS] });
    });
    const { result } = renderHook(() => useToolEnabled('write_file'));
    expect(result.current).toBe(false);
  });

  it('setDisabled(name, true) → 该工具视为禁用', () => {
    const { result } = renderHook(() => useToolEnabled('write_file'));
    act(() => {
      useToolsStore.getState().setDisabled('write_file', true);
    });
    expect(result.current).toBe(false);
  });

  it('setDisabled(name, false) 重新启用', () => {
    act(() => {
      useToolsStore.setState({ disabled: ['read_file'] });
    });
    const { result } = renderHook(() => useToolEnabled('read_file'));
    expect(result.current).toBe(false);
    act(() => {
      useToolsStore.getState().setDisabled('read_file', false);
    });
    expect(result.current).toBe(true);
  });
});
