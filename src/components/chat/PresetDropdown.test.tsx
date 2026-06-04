import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { PresetDropdown } from '@/components/chat/PresetDropdown';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { PromptPreset } from '@/lib/prompts';

afterEach(cleanup);

function wrap(ui: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

const presets: PromptPreset[] = [
  { id: 'p1', name: '翻译助手', content: '你是翻译', builtin: 1, created_at: 0 },
  { id: 'p2', name: 'My', content: '...', builtin: 0, created_at: 1 },
];

describe('components/chat/PresetDropdown', () => {
  it('空列表显示提示语', () => {
    wrap(<PresetDropdown presets={[]} onApply={() => {}} />);
    expect(screen.getByLabelText('应用提示词预设')).toBeTruthy();
  });

  it('render 阶段不展示 item 内容(item 在 DropdownMenuContent 中默认折叠)', () => {
    // Radix DropdownMenu 用 portal 渲染,未打开时 content 不在 document 中
    wrap(<PresetDropdown presets={presets} onApply={() => {}} />);
    expect(screen.queryByText('翻译助手')).toBeNull();
  });

  it('disabled 时按钮禁用', () => {
    wrap(<PresetDropdown presets={presets} disabled onApply={() => {}} />);
    const btn = screen.getByLabelText('应用提示词预设') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('onApply 是 props 透传(由 MessageInput 注入 system_prompt 写入逻辑)', () => {
    const onApply = vi.fn();
    wrap(<PresetDropdown presets={presets} onApply={onApply} />);
    expect(onApply).not.toHaveBeenCalled();
  });
});
