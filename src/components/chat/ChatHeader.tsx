import { useState } from 'react';
import { BrainIcon } from 'lucide-react';

import { useConversations } from '@/hooks/useConversations';
import { getCustomProvider } from '@/stores/customProviders';
import { useSettingsStore } from '@/stores/settings';
import { getModelInfo, isCustomProviderId } from '@/types/providers';
import { cn } from '@/lib/utils';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ChatHeader() {
  const conv = useConversations();
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const defaultThinkingEnabled = useSettingsStore((s) => s.defaultThinkingEnabled);
  const defaultThinkingBudget = useSettingsStore((s) => s.defaultThinkingBudget);

  const current = conv.current;

  // 临时覆盖:当前会话的值优先
  const model = current?.model ?? defaultModel;
  const thinkingEnabled =
    current?.thinking_enabled !== undefined
      ? Boolean(current.thinking_enabled)
      : defaultThinkingEnabled;
  const thinkingBudget = current?.thinking_budget ?? defaultThinkingBudget;

  // v1.3:不再用 useEffect 同步外部值,改成"派生 + 派生时同步"。
  // useState 初始用 thinkingBudget(只在 mount 时读一次);外部变化时由 update 函数透传。
  const [budget, setBudget] = useState(thinkingBudget);

  const update = async (patch: Parameters<typeof conv.update>[0]) => {
    if (!current) return;
    await conv.update(patch);
  };

  const customProvider = isCustomProviderId(model) ? getCustomProvider(model) : null;
  const supportsThinking =
    customProvider?.supportsThinking ?? getModelInfo(model)?.supportsThinking ?? false;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        {current?.title ?? '新会话'}
      </div>

      <div className="flex items-center gap-2">
        {supportsThinking && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1',
                  thinkingEnabled
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-muted/30',
                )}
              >
                <BrainIcon
                  className={cn(
                    'size-3.5',
                    thinkingEnabled ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                <Label className="text-xs">思考</Label>
                <Switch
                  checked={thinkingEnabled}
                  onCheckedChange={async (v) => {
                    await update({
                      id: current?.id ?? '',
                      thinking_enabled: v,
                    });
                  }}
                  className="scale-75"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>扩展思考 / reasoning(让模型思考更久)</TooltipContent>
          </Tooltip>
        )}

        {thinkingEnabled && supportsThinking && (
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">预算</Label>
            <Input
              type="number"
              min={1024}
              max={64000}
              step={1024}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
              onBlur={() => {
                const clamped = Math.max(1024, Math.min(64000, budget));
                setBudget(clamped);
                if (clamped !== thinkingBudget) {
                  update({ id: current?.id ?? '', thinking_budget: clamped });
                }
              }}
              className="h-8 w-20"
            />
          </div>
        )}
      </div>
    </header>
  );
}
