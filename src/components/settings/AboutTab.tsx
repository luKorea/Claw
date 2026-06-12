/**
 * AboutTab (v1.3 重构,从 SettingsDialog 拆出)
 */

import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { RefreshCwIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type AvailableUpdate, checkForUpdate } from '@/lib/updater';

const BRAND_ICON_SRC = '/brand/final/claw-ui-mark.svg';

interface AboutTabProps {
  onUpdateAvailable?: (update: AvailableUpdate) => void;
}

export function AboutTab({ onUpdateAvailable }: AboutTabProps) {
  const [version, setVersion] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateMessageTone, setUpdateMessageTone] = useState<'muted' | 'destructive'>(
    'muted',
  );

  useEffect(() => {
    let mounted = true;

    void getVersion()
      .then((appVersion) => {
        if (mounted) setVersion(appVersion);
      })
      .catch(() => {
        if (mounted) setVersion(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateMessage(null);

    const result = await checkForUpdate({ silent: false });
    setCheckingUpdate(false);

    if (result.status === 'available') {
      setUpdateMessage(`发现新版本 v${result.update.version}`);
      setUpdateMessageTone('muted');
      onUpdateAvailable?.(result.update);
      return;
    }

    setUpdateMessage(result.message);
    setUpdateMessageTone(result.status === 'error' ? 'destructive' : 'muted');
  };

  return (
    <div className="space-y-3 pt-2 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F4F8FF]">
          <img
            src={BRAND_ICON_SRC}
            alt="Claw"
            className="size-8"
            draggable={false}
          />
        </div>
        <div>
          <p>
            <strong>Claw</strong> {version ? `v${version}` : 'v...'}
          </p>
          <p className="text-xs text-muted-foreground">多 Provider AI 桌面客户端</p>
        </div>
      </div>
      <p className="text-muted-foreground">
        支持 Anthropic / DeepSeek / OpenAI / MiniMax。
        本地存储所有数据,API Key 保存在本机 Claw 配置文件中。
      </p>
      <p className="text-muted-foreground">
        使用 Tauri 2 + React 19 + TypeScript 构建。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleCheckUpdate()}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? (
            <Spinner size="sm" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
          检查更新
        </Button>
        {updateMessage && (
          <span
            className={
              updateMessageTone === 'destructive'
                ? 'text-xs text-destructive'
                : 'text-xs text-muted-foreground'
            }
          >
            {updateMessage}
          </span>
        )}
      </div>
      <p className="text-muted-foreground">
        仓库:<a className="text-primary underline" href="https://github.com/luKorea/Claw">https://github.com/luKorea/Claw</a>
      </p>
    </div>
  );
}
