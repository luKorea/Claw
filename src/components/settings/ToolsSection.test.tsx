import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToolsSection } from '@/components/settings/ToolsSection';
import { DEFAULT_DISABLED_TOOLS, useToolsStore } from '@/stores/tools';

describe('ToolsSection', () => {
  beforeEach(() => {
    useToolsStore.setState({ disabled: [...DEFAULT_DISABLED_TOOLS] });
  });

  it('write_file 显示危险标签并使用 destructive 文案颜色', () => {
    render(<ToolsSection />);

    const writeFile = screen.getByText('write_file').closest('[data-slot="card"]');
    expect(writeFile).not.toBeNull();
    expect(writeFile).toHaveClass('border-destructive/30');
    expect(writeFile).toHaveClass('bg-destructive/5');

    const dangerousBadge = within(writeFile as HTMLElement).getByText('危险');
    expect(dangerousBadge.closest('[data-slot="badge"]')).toHaveClass(
      'text-destructive-foreground',
    );

    const description = within(writeFile as HTMLElement).getByText(/危险操作/);
    expect(description).toHaveClass('text-destructive');
  });

  it('read_file 和 list_dir 不显示危险标签', () => {
    render(<ToolsSection />);

    const readFile = screen.getByText('read_file').closest('[data-slot="card"]');
    const listDir = screen.getByText('list_dir').closest('[data-slot="card"]');

    expect(readFile).not.toBeNull();
    expect(listDir).not.toBeNull();
    expect(within(readFile as HTMLElement).queryByText('危险')).not.toBeInTheDocument();
    expect(within(listDir as HTMLElement).queryByText('危险')).not.toBeInTheDocument();
  });
});
