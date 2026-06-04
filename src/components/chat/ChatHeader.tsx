import { useEffect, useState } from 'react';
import { BrainIcon } from 'lucide-react';

import { useConversations } from '@/hooks/useConversations';
import { useSettings } from '@/hooks/useSettings';
import { useModels } from '@/hooks/useModels';
import { useSettingsStore } from '@/stores/settings';
import { ALL_MODELS, getModelInfo, type ProviderId } from '@/types/providers';
import { cn } from '@/lib/utils';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ChatHeader() {
  const conv = useConversations();
  const { configuredProviders } = useSettings();
  const { isModelKnown, mergedByProvider } = useModels();
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

  const [budget, setBudget] = useState(thinkingBudget);

  useEffect(() => {
    setBudget(thinkingBudget);
  }, [thinkingBudget]);

  const update = async (patch: Parameters<typeof conv.update>[0]) => {
    if (!current) return;
    await conv.update(patch);
  };

  const supportsThinking = getModelInfo(model)?.supportsThinking ?? false;

  // v1.2 Bug 3.1 + 3.2 + v1.3 重构:已配 Key 的 provider 硬编码 + 动态合并
  const allGrouped = mergedByProvider;
  const groupedModels = ALL_MODELS.filter((m) => configuredProviders.has(m.provider)).reduce<
    Record<string, typeof ALL_MODELS[number][]>
  >(
    (acc, m) => {
      (acc[m.groupLabel] ??= []).push(m);
      return acc;
    },
    {},
  );
  for (const [p, ids] of Object.entries(allGrouped) as [ProviderId, string[]][]) {
    if (!configuredProviders.has(p)) continue;
    for (const id of ids) {
      if (isModelKnown(id, p) && !groupedModels[p]) {
        const sameProvider = ALL_MODELS.find((m) => m.provider === p);
        const groupKey = sameProvider?.groupLabel ?? p;
        groupedModels[groupKey] ??= [];
        if (!groupedModels[groupKey].some((m) => m.id === id)) {
          const meta = ALL_MODELS.find((m) => m.id === id);
          groupedModels[groupKey].push(
            meta ?? {
              id,
              provider: p,
              label: id,
              family: id,
              supportsThinking: false,
              groupLabel: groupKey,
            },
          );
        }
      }
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        {current?.title ?? '新会话'}
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">模型</Label>
        <Select
          value={model}
          onValueChange={async (v) => {
            await update({ id: current?.id ?? '', model: v });
          }}
        >
          <SelectTrigger className="h-8 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(groupedModels).map(([group, models]) => (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      {m.label}
                      {m.supportsThinking && (
                        <span className="text-[10px] text-muted-foreground">thinking</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

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
