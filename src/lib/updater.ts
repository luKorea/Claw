import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

export type UpdateCheckStatus = 'available' | 'not-available' | 'error';
export type UpdateInstallStatus = 'ready-to-restart' | 'error';

export interface UpdateProgress {
  downloaded: number;
  contentLength: number | null;
  percent: number | null;
}

type UpdaterDownloadEvent =
  | {
      event: 'Started';
      data: {
        contentLength?: number;
      };
    }
  | {
      event: 'Progress';
      data: {
        chunkLength: number;
      };
    }
  | {
      event: 'Finished';
      data?: unknown;
    };

interface PluginUpdate {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (onEvent?: (event: UpdaterDownloadEvent) => void) => Promise<void>;
}

export interface AvailableUpdate {
  version: string;
  date: string | null;
  body: string | null;
  raw: PluginUpdate;
}

export interface CheckForUpdateOptions {
  silent: boolean;
}

export type UpdateCheckResult =
  | {
      status: 'available';
      update: AvailableUpdate;
      message?: string;
    }
  | {
      status: 'not-available';
      message: string;
    }
  | {
      status: 'error';
      message: string;
    };

export type UpdateInstallResult =
  | {
      status: 'ready-to-restart';
    }
  | {
      status: 'error';
      message: string;
    };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return '检查更新失败,请稍后重试。';
}

function normalizeUpdate(raw: PluginUpdate): AvailableUpdate {
  return {
    version: raw.version,
    date: raw.date ?? null,
    body: raw.body ?? null,
    raw,
  };
}

/**
 * Checks the configured updater endpoint and normalizes plugin results for UI code.
 */
export async function checkForUpdate(
  _options: CheckForUpdateOptions,
): Promise<UpdateCheckResult> {
  try {
    const update = (await check()) as PluginUpdate | null;
    if (!update) {
      return {
        status: 'not-available',
        message: '已是最新版本。',
      };
    }

    return {
      status: 'available',
      update: normalizeUpdate(update),
    };
  } catch (error) {
    return {
      status: 'error',
      message: getErrorMessage(error),
    };
  }
}

/**
 * Downloads and installs a checked update while reporting byte progress.
 */
export async function downloadAndInstallUpdate(
  update: AvailableUpdate,
  onProgress: (progress: UpdateProgress) => void,
): Promise<UpdateInstallResult> {
  let downloaded = 0;
  let contentLength: number | null = null;

  try {
    await update.raw.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        downloaded = 0;
        contentLength = event.data.contentLength ?? null;
        onProgress({ downloaded, contentLength, percent: null });
        return;
      }

      if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        const percent =
          contentLength && contentLength > 0
            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
            : null;
        onProgress({ downloaded, contentLength, percent });
      }
    });

    return { status: 'ready-to-restart' };
  } catch (error) {
    return {
      status: 'error',
      message: getErrorMessage(error),
    };
  }
}

/**
 * Relaunches the app after an update has been installed.
 */
export async function relaunchForUpdate(): Promise<void> {
  await relaunch();
}
