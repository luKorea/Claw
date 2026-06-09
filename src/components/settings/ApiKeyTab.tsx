/**
 * ApiKeyTab + ProviderKeyCard (v1.3 重构,从 SettingsDialog 拆出)
 *
 * 渲染每个 provider 的 Key 输入卡片。
 * v1.3:删 window.confirm,改用统一的 ConfirmDialog。
 */

import { useState } from 'react';
import {
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';

import { useSettings } from '@/hooks/useSettings';
import type { ApiKeyState } from '@/hooks/useSettings';
import { LISTABLE_PROVIDERS_FRONTEND, useModels } from '@/hooks/useModels';
import { ALL_PROVIDER_IDS, PROVIDERS, type StaticProviderId } from '@/types/providers';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function ApiKeyTab() {
  const { keys, saveKey, removeKey, refreshOne, syncOne } = useSettings();

  return (
    <div className="space-y-4 pt-2">
      {ALL_PROVIDER_IDS.map((provider) => (
        <ProviderKeyCard
          key={provider}
          provider={provider}
          state={keys[provider]}
          onSave={(k) => saveKey(provider, k)}
          onRemove={() => removeKey(provider)}
          onRefresh={() => refreshOne(provider)}
          onSync={() => syncOne(provider)}
        />
      ))}
    </div>
  );
}

interface ProviderKeyCardProps {
  provider: StaticProviderId;
  state: ApiKeyState;
  onSave: (key: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onSync: () => Promise<void>;
}

export function ProviderKeyCard({
  provider,
  state,
  onSave,
  onRemove,
  onRefresh,
  onSync,
}: ProviderKeyCardProps) {
  const meta = PROVIDERS[provider];
  const [input, setInput] = useState('');
  const [show, setShow] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // v1.2 Bug 3.2:保存 Key 成功后,触发该 provider 的动态模型拉取
  // v1.3:retry 暴露给 ApiKeyTab,错误状态可手动重试
  const { fetchProvider, retry, resetProvider } = useModels();

  const handleSave = async () => {
    if (!input.trim()) return;
    try {
      await onSave(input.trim());
      setInput('');
      if (LISTABLE_PROVIDERS_FRONTEND.includes(provider)) {
        await fetchProvider(provider, { force: true });
      }
    } catch {
      // error 在 state 里
    }
  };

  const handleRemove = async () => {
    await onRemove();
    resetProvider(provider);
  };

  const handleSync = async () => {
    try {
      await onSync();
    } catch {
      // error 在 state 里
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        {state.configured ? (
          <>
            <CheckCircle2Icon className="size-4 text-green-600" />
            <span className="text-sm font-medium">{meta.label} Key</span>
          </>
        ) : (
          <>
            <span className="size-4 rounded-full border-2 border-muted-foreground" />
            <span className="text-sm font-medium">{meta.label} Key</span>
          </>
        )}
        {state.preview && (
          <code className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">{state.preview}</code>
        )}
        {!state.metadataKnown && !state.loading && (
          <span className="ml-auto rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
            可导入旧 Key
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? 'text' : 'password'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={meta.keyPlaceholder}
            className="pr-10"
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
            onClick={() => setShow((s) => !s)}
          >
            {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </Button>
        </div>
        <Button
          onClick={handleSave}
          disabled={state.saving || !input.trim()}
          size="sm"
        >
          {state.saving && <Spinner size="sm" className="mr-1" />}
          保存
        </Button>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          从{' '}
          <a
            className="text-primary underline"
            href={meta.keyHelpUrl}
            target="_blank"
            rel="noreferrer"
          >
            {meta.keyHelpLabel}
          </a>{' '}
          获取。Key 以 <code>{provider === 'minimaxi' ? 'sk-cp-' : 'sk-'}</code> 开头。
          保存到本机 Claw 配置文件。
        </span>
        <div className="flex items-center gap-1">
          {!state.metadataKnown && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSync()}
              disabled={state.loading || state.saving}
            >
              {state.loading ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
              导入旧 Key
            </Button>
          )}
          {state.configured && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={state.saving}
            >
              <Trash2Icon className="size-3.5" />
              清除
            </Button>
          )}
        </div>
      </div>

      {state.error && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <span className="flex-1 truncate">{state.error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await onRefresh();
              if (LISTABLE_PROVIDERS_FRONTEND.includes(provider)) {
                await retry(provider);
              }
            }}
          >
            重试
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`删除 ${meta.label} API Key`}
        description="确认删除已保存的 API Key?此操作不可撤销。"
        confirmText="删除"
        destructive
        onConfirm={handleRemove}
      />
    </div>
  );
}
