import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useToolEnabled } from '@/hooks/useToolEnabled';
import { useToolsStore } from '@/stores/tools';

afterEach(() => {
  act(() => {
    useToolsStore.setState({ disabled: [] });
  });
});

describe('hooks/useToolEnabled', () => {
  it('默认禁用列表为空 → 工具启用', () => {
    const { result } = renderHook(() => useToolEnabled('read_file'));
    expect(result.current).toBe(true);
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
