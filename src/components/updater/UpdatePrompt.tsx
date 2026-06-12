import { useEffect, useRef, useState } from 'react';
import { DownloadIcon, RefreshCcwIcon, RotateCwIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  type AvailableUpdate,
  type UpdateProgress,
  checkForUpdate,
  downloadAndInstallUpdate,
  relaunchForUpdate,
} from '@/lib/updater';

const DEFAULT_STARTUP_DELAY_MS = 3000;

type PromptStatus = 'available' | 'downloading' | 'ready-to-restart' | 'error';

interface UpdatePromptProps {
  startupDelayMs?: number;
  externalUpdate?: AvailableUpdate | null;
  onExternalUpdateConsumed?: () => void;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatProgress(progress: UpdateProgress | null): string {
  if (!progress) return '准备下载...';
  if (progress.contentLength) {
    return `${formatBytes(progress.downloaded)} / ${formatBytes(progress.contentLength)}`;
  }
  return `${formatBytes(progress.downloaded)} 已下载`;
}

export function UpdatePrompt({
  startupDelayMs = DEFAULT_STARTUP_DELAY_MS,
  externalUpdate = null,
  onExternalUpdateConsumed,
}: UpdatePromptProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PromptStatus>('available');
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkedOnStartupRef = useRef(false);

  useEffect(() => {
    if (!externalUpdate) return;
    setUpdate(externalUpdate);
    setStatus('available');
    setProgress(null);
    setError(null);
    setOpen(true);
    onExternalUpdateConsumed?.();
  }, [externalUpdate, onExternalUpdateConsumed]);

  useEffect(() => {
    if (checkedOnStartupRef.current) return;
    checkedOnStartupRef.current = true;

    const timer = window.setTimeout(() => {
      void checkForUpdate({ silent: true }).then((result) => {
        if (result.status !== 'available') return;
        setUpdate(result.update);
        setStatus('available');
        setProgress(null);
        setError(null);
        setOpen(true);
      });
    }, startupDelayMs);

    return () => window.clearTimeout(timer);
  }, [startupDelayMs]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (status === 'downloading') return;
    setOpen(nextOpen);
  };

  const handleInstall = async () => {
    if (!update || status === 'downloading') return;
    setStatus('downloading');
    setProgress(null);
    setError(null);

    const result = await downloadAndInstallUpdate(update, setProgress);
    if (result.status === 'ready-to-restart') {
      setStatus('ready-to-restart');
      return;
    }

    setStatus('error');
    setError(result.message);
  };

  const handleRelaunch = async () => {
    try {
      await relaunchForUpdate();
    } catch (relaunchError) {
      setStatus('error');
      setError(
        relaunchError instanceof Error && relaunchError.message
          ? relaunchError.message
          : '重启失败,请手动重新打开应用。',
      );
    }
  };

  if (!update) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {status === 'ready-to-restart' ? '更新已安装' : '发现新版本'}
          </DialogTitle>
          <DialogDescription>
            Claw v{update.version} 已可用。更新前可以继续使用当前版本。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">最新版本</span>
              <span className="text-primary">v{update.version}</span>
            </div>
            {update.date && (
              <p className="mt-1 text-xs text-muted-foreground">发布日期: {update.date}</p>
            )}
          </div>

          {update.body && (
            <div className="max-h-32 overflow-y-auto rounded-md border p-3 text-muted-foreground">
              {update.body}
            </div>
          )}

          {status === 'downloading' && (
            <div className="space-y-2" role="status" aria-label="更新下载进度">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress?.percent ?? 8}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {progress?.percent != null ? `${progress.percent}% · ` : ''}
                {formatProgress(progress)}
              </p>
            </div>
          )}

          {status === 'ready-to-restart' && (
            <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-primary">
              更新已安装,重启后生效。
            </p>
          )}

          {status === 'error' && error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          {status === 'available' && (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                稍后
              </Button>
              <Button onClick={() => void handleInstall()}>
                <DownloadIcon className="size-4" />
                立即更新
              </Button>
            </>
          )}
          {status === 'downloading' && (
            <Button disabled>
              <Spinner size="sm" />
              正在更新
            </Button>
          )}
          {status === 'ready-to-restart' && (
            <Button onClick={() => void handleRelaunch()}>
              <RefreshCcwIcon className="size-4" />
              重启应用
            </Button>
          )}
          {status === 'error' && (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                关闭
              </Button>
              <Button onClick={() => void handleInstall()}>
                <RotateCwIcon className="size-4" />
                重试
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
