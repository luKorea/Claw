/**
 * PromptsPanel 测试 (v1.2 Bug 4 强约束补)
 */

vi.mock('@/hooks/usePrompts', () => ({
  usePrompts: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { PromptsPanel } from '@/components/prompts/PromptsPanel';
import { usePrompts } from '@/hooks/usePrompts';

const mockedUsePrompts = vi.mocked(usePrompts);

const fakeList = [
  { id: 'b1', name: '通用助手', content: '通用助手内容', builtin: 1, created_at: 0 },
  { id: 'b2', name: '代码审查', content: '代码审查内容', builtin: 1, created_at: 0 },
  { id: 'u1', name: '我的预设', content: '我的内容', builtin: 0, created_at: 0 },
];

describe('components/prompts/PromptsPanel', () => {
  beforeEach(() => {
    mockedUsePrompts.mockReset();
  });

  it('渲染内置 + 自定义预设列表', () => {
    mockedUsePrompts.mockReturnValue({
      list: fakeList,
      refresh: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<PromptsPanel />);
    expect(screen.getByText('通用助手')).toBeDefined();
    expect(screen.getByText('代码审查')).toBeDefined();
    expect(screen.getByText('我的预设')).toBeDefined();
  });

  it('点击预设 → 触发 onApplyPreset(id)', () => {
    const onApply = vi.fn();
    mockedUsePrompts.mockReturnValue({
      list: fakeList,
      refresh: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<PromptsPanel onApplyPreset={onApply} />);
    fireEvent.click(screen.getByText('通用助手'));
    expect(onApply).toHaveBeenCalledWith('b1');
  });

  it('activePresetId 匹配时高亮(用 className 表达)', () => {
    mockedUsePrompts.mockReturnValue({
      list: fakeList,
      refresh: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<PromptsPanel activePresetId="b1" />);
    // 用 getAllByText 因为右侧详情区也展示 name
    // 选中:包含 "bg-accent text-accent-foreground"(空格分隔 = 真 active)
    const matches = screen.getAllByText('通用助手');
    const activeBtn = matches[0]?.closest('button');
    expect(activeBtn?.className).toContain('bg-accent text-accent-foreground');
    // 未选中:不含这两个相邻的 token(只可能有 hover:bg-accent)
    const otherMatches = screen.getAllByText('代码审查');
    const otherBtn = otherMatches[0]?.closest('button');
    expect(otherBtn?.className).not.toContain('bg-accent text-accent-foreground');
  });

  it('空 list 渲染空列表 + "新建" 按钮可点', () => {
    mockedUsePrompts.mockReturnValue({
      list: [],
      refresh: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });
    render(<PromptsPanel />);
    // 至少 1 个 button 渲染(标题旁的 + 新建按钮)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
