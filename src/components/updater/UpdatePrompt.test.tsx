import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdatePrompt } from '@/components/updater/UpdatePrompt';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  relaunchForUpdate,
  type AvailableUpdate,
} from '@/lib/updater';

vi.mock('@/lib/updater', async () => {
  return {
    checkForUpdate: vi.fn(),
    downloadAndInstallUpdate: vi.fn(),
    relaunchForUpdate: vi.fn(),
  };
});

const mockedCheckForUpdate = vi.mocked(checkForUpdate);
const mockedDownloadAndInstallUpdate = vi.mocked(downloadAndInstallUpdate);
const mockedRelaunchForUpdate = vi.mocked(relaunchForUpdate);

function makeUpdate(version = '0.2.0'): AvailableUpdate {
  return {
    version,
    date: '2026-06-12',
    body: 'Release notes',
    raw: {
      version,
      date: '2026-06-12',
      body: 'Release notes',
      downloadAndInstall: vi.fn(),
    },
  };
}

describe('UpdatePrompt', () => {
  beforeEach(() => {
    mockedCheckForUpdate.mockReset();
    mockedDownloadAndInstallUpdate.mockReset();
    mockedRelaunchForUpdate.mockReset();
    mockedRelaunchForUpdate.mockResolvedValue(undefined);
  });

  it('启动检查发现新版本时展示更新弹窗', async () => {
    mockedCheckForUpdate.mockResolvedValue({
      status: 'available',
      update: makeUpdate('0.3.0'),
    });

    render(<UpdatePrompt startupDelayMs={0} />);

    expect(await screen.findByRole('heading', { name: '发现新版本' })).toBeInTheDocument();
    expect(screen.getByText('v0.3.0')).toBeInTheDocument();
  });

  it('启动检查失败时不展示弹窗', async () => {
    mockedCheckForUpdate.mockResolvedValue({
      status: 'error',
      message: 'network down',
    });

    render(<UpdatePrompt startupDelayMs={0} />);

    await waitFor(() => expect(mockedCheckForUpdate).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: '发现新版本' })).not.toBeInTheDocument();
  });

  it('点击稍后不会下载更新', () => {
    render(<UpdatePrompt externalUpdate={makeUpdate()} />);

    fireEvent.click(screen.getByRole('button', { name: '稍后' }));

    expect(mockedDownloadAndInstallUpdate).not.toHaveBeenCalled();
  });

  it('点击立即更新后展示进度并提示重启', async () => {
    mockedDownloadAndInstallUpdate.mockImplementation(async (_update, onProgress) => {
      onProgress({ downloaded: 50, contentLength: 100, percent: 50 });
      return { status: 'ready-to-restart' };
    });

    render(<UpdatePrompt externalUpdate={makeUpdate()} />);
    fireEvent.click(screen.getByRole('button', { name: /立即更新/ }));

    expect(await screen.findByRole('button', { name: /重启应用/ })).toBeInTheDocument();
    expect(screen.getByText('更新已安装,重启后生效。')).toBeInTheDocument();
  });

  it('安装失败时展示错误', async () => {
    mockedDownloadAndInstallUpdate.mockResolvedValue({
      status: 'error',
      message: 'signature mismatch',
    });

    render(<UpdatePrompt externalUpdate={makeUpdate()} />);
    fireEvent.click(screen.getByRole('button', { name: /立即更新/ }));

    expect(await screen.findByText('signature mismatch')).toBeInTheDocument();
  });

  it('安装完成后可触发重启', async () => {
    mockedDownloadAndInstallUpdate.mockResolvedValue({ status: 'ready-to-restart' });

    render(<UpdatePrompt externalUpdate={makeUpdate()} />);
    fireEvent.click(screen.getByRole('button', { name: /立即更新/ }));
    fireEvent.click(await screen.findByRole('button', { name: /重启应用/ }));

    expect(mockedRelaunchForUpdate).toHaveBeenCalledTimes(1);
  });
});
