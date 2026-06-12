import { beforeEach, describe, expect, it, vi } from 'vitest';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

import {
  checkForUpdate,
  downloadAndInstallUpdate,
  relaunchForUpdate,
  type AvailableUpdate,
} from '@/lib/updater';

const mockedCheck = vi.mocked(check);
const mockedRelaunch = vi.mocked(relaunch);

function makeRawUpdate() {
  return {
    version: '0.2.0',
    date: '2026-06-12',
    body: '更新说明',
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
  };
}

describe('updater lib', () => {
  beforeEach(() => {
    mockedCheck.mockReset();
    mockedRelaunch.mockReset();
    mockedRelaunch.mockResolvedValue(undefined);
  });

  it('检查到新版本时返回 normalized update', async () => {
    const rawUpdate = makeRawUpdate();
    mockedCheck.mockResolvedValue(rawUpdate as never);

    const result = await checkForUpdate({ silent: false });

    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.update.version).toBe('0.2.0');
      expect(result.update.body).toBe('更新说明');
      expect(result.update.raw).toBe(rawUpdate);
    }
  });

  it('没有新版本时返回 not-available', async () => {
    mockedCheck.mockResolvedValue(null);

    const result = await checkForUpdate({ silent: false });

    expect(result).toEqual({
      status: 'not-available',
      message: '已是最新版本。',
    });
  });

  it('检查失败时返回 error', async () => {
    mockedCheck.mockRejectedValue(new Error('network down'));

    const result = await checkForUpdate({ silent: true });

    expect(result).toEqual({
      status: 'error',
      message: 'network down',
    });
  });

  it('下载并安装时上报进度', async () => {
    const rawUpdate = makeRawUpdate();
    rawUpdate.downloadAndInstall.mockImplementation(async (onEvent) => {
      onEvent?.({ event: 'Started', data: { contentLength: 100 } });
      onEvent?.({ event: 'Progress', data: { chunkLength: 25 } });
      onEvent?.({ event: 'Progress', data: { chunkLength: 75 } });
    });
    const update: AvailableUpdate = {
      version: '0.2.0',
      date: null,
      body: null,
      raw: rawUpdate,
    };
    const onProgress = vi.fn();

    const result = await downloadAndInstallUpdate(update, onProgress);

    expect(result).toEqual({ status: 'ready-to-restart' });
    expect(onProgress).toHaveBeenLastCalledWith({
      downloaded: 100,
      contentLength: 100,
      percent: 100,
    });
  });

  it('安装失败时返回 error', async () => {
    const rawUpdate = makeRawUpdate();
    rawUpdate.downloadAndInstall.mockRejectedValue(new Error('signature mismatch'));
    const update: AvailableUpdate = {
      version: '0.2.0',
      date: null,
      body: null,
      raw: rawUpdate,
    };

    const result = await downloadAndInstallUpdate(update, vi.fn());

    expect(result).toEqual({
      status: 'error',
      message: 'signature mismatch',
    });
  });

  it('重启应用时调用 process plugin relaunch', async () => {
    await relaunchForUpdate();

    expect(mockedRelaunch).toHaveBeenCalledTimes(1);
  });
});
