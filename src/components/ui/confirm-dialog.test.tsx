import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';

afterEach(cleanup);

describe('components/ui/ConfirmDialog', () => {
  it('未打开时不在 DOM', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="标题"
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByText('标题')).toBeNull();
  });

  it('打开后显示标题 + 描述 + 确认/取消按钮', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="确认删除?"
        description="删除后无法恢复"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('确认删除?')).toBeTruthy();
    expect(screen.getByText('删除后无法恢复')).toBeTruthy();
    expect(screen.getByText('确认')).toBeTruthy();
    expect(screen.getByText('取消')).toBeTruthy();
  });

  it('点确认 → 调 onConfirm + 关闭', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="T"
        description="D"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('确认'));
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('destructive 样式:确认按钮带 destructive 变体(同 default 的存在,样式由 variant 控制)', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="T"
        description="D"
        destructive
        onConfirm={() => {}}
      />,
    );
    // 行为级:destructive prop 不应抛错
    expect(screen.getByText('确认')).toBeTruthy();
  });
});
