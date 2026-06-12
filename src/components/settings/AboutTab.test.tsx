import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVersion } from '@tauri-apps/api/app';

import { AboutTab } from '@/components/settings/AboutTab';
import { checkForUpdate, type AvailableUpdate } from '@/lib/updater';

const mockedGetVersion = vi.mocked(getVersion);
const mockedCheckForUpdate = vi.mocked(checkForUpdate);

vi.mock('@/lib/updater', async () => {
  return {
    checkForUpdate: vi.fn(),
  };
});

function makeUpdate(): AvailableUpdate {
  return {
    version: '0.2.0',
    date: null,
    body: null,
    raw: {
      version: '0.2.0',
      downloadAndInstall: vi.fn(),
    },
  };
}

describe('AboutTab', () => {
  beforeEach(() => {
    mockedGetVersion.mockReset();
    mockedGetVersion.mockResolvedValue('0.1.2');
    mockedCheckForUpdate.mockReset();
    mockedCheckForUpdate.mockResolvedValue({
      status: 'not-available',
      message: '已是最新版本。',
    });
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

  it('手动检查无更新时展示已是最新版本', async () => {
    render(<AboutTab />);

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));

    expect(await screen.findByText('已是最新版本。')).toBeInTheDocument();
    expect(mockedCheckForUpdate).toHaveBeenCalledWith({ silent: false });
  });

  it('手动检查发现新版本时通知父组件', async () => {
    const update = makeUpdate();
    const onUpdateAvailable = vi.fn();
    mockedCheckForUpdate.mockResolvedValueOnce({
      status: 'available',
      update,
    });

    render(<AboutTab onUpdateAvailable={onUpdateAvailable} />);
    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));

    expect(await screen.findByText('发现新版本 v0.2.0')).toBeInTheDocument();
    expect(onUpdateAvailable).toHaveBeenCalledWith(update);
  });

  it('手动检查失败时展示错误文案', async () => {
    mockedCheckForUpdate.mockResolvedValueOnce({
      status: 'error',
      message: 'network down',
    });

    render(<AboutTab />);
    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));

    await waitFor(() => expect(screen.getByText('network down')).toBeInTheDocument());
    expect(screen.getByText('network down')).toHaveClass('text-destructive');
  });
});
