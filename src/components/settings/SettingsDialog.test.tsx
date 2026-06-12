import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  SettingsDialog,
  type SettingsTab,
} from '@/components/settings/SettingsDialog';

vi.mock('@/components/settings/ApiKeyTab', () => ({
  ApiKeyTab: () => <div>API Key Content</div>,
}));

vi.mock('@/components/settings/DefaultTab', () => ({
  DefaultTab: () => <div>Default Model Content</div>,
}));

vi.mock('@/components/settings/CustomProvidersTab', () => ({
  CustomProvidersTab: () => <div>Custom Provider Content</div>,
}));

vi.mock('@/components/settings/PromptsTab', () => ({
  PromptsTab: () => <div>Prompts Content</div>,
}));

vi.mock('@/components/settings/ToolsTab', () => ({
  ToolsTab: () => <div>Tools Content</div>,
}));

vi.mock('@/components/settings/AboutTab', () => ({
  AboutTab: () => <div>About Content</div>,
}));

function renderSettings(activeTab: SettingsTab = 'apikey') {
  const onActiveTabChange = vi.fn();
  render(
    <SettingsDialog
      open
      onOpenChange={vi.fn()}
      activeTab={activeTab}
      onActiveTabChange={onActiveTabChange}
    />,
  );
  return { onActiveTabChange };
}

describe('SettingsDialog', () => {
  it('使用左侧功能栏展示设置入口', () => {
    renderSettings();

    expect(screen.getByRole('navigation', { name: '设置功能' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /API Key/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: /模型/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /提示词/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /工具/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /关于/ })).toBeInTheDocument();
    expect(screen.getByText('API Key Content')).toBeInTheDocument();
  });

  it('点击侧栏入口时请求切换对应设置页', () => {
    const { onActiveTabChange } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /工具/ }));

    expect(onActiveTabChange).toHaveBeenCalledWith('tools');
  });

  it('右侧内容区渲染当前 activeTab', () => {
    renderSettings('models');

    expect(screen.getByRole('heading', { name: '模型' })).toBeInTheDocument();
    expect(screen.getByText('Default Model Content')).toBeInTheDocument();
    expect(screen.getByText('Custom Provider Content')).toBeInTheDocument();
  });

  it('右侧内容区使用独立滚动容器', () => {
    renderSettings('tools');

    expect(screen.getByRole('dialog')).toHaveClass(
      'flex',
      'h-[86vh]',
      'gap-0',
      'overflow-hidden',
    );
    expect(screen.getByTestId('settings-layout')).toHaveClass('min-h-0', 'flex-1');
    expect(screen.getByTestId('settings-content-scroll')).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
    );
  });
});
