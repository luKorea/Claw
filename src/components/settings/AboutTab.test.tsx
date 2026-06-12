import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVersion } from '@tauri-apps/api/app';

import { AboutTab } from '@/components/settings/AboutTab';

const mockedGetVersion = vi.mocked(getVersion);

describe('AboutTab', () => {
  beforeEach(() => {
    mockedGetVersion.mockReset();
    mockedGetVersion.mockResolvedValue('0.1.2');
  });

  it('关于页展示 Claw logo 资源', async () => {
    render(<AboutTab />);

    expect(await screen.findByText(/v0\.1\.2/)).toBeInTheDocument();
    expect(screen.getByAltText('Claw')).toHaveAttribute(
      'src',
      '/brand/final/claw-ui-mark.svg',
    );
  });

  it('关于页版本号读取 Tauri 应用版本', async () => {
    mockedGetVersion.mockResolvedValueOnce('1.2.3');

    render(<AboutTab />);

    expect(await screen.findByText(/v1\.2\.3/)).toBeInTheDocument();
    expect(mockedGetVersion).toHaveBeenCalledTimes(1);
  });
});
