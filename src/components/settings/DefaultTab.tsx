/**
 * DefaultTab (v1.3 重构,从 SettingsDialog 拆出)
 *
 * 默认模型 / 默认思考模式 / 默认思考预算。
 */

import { useEffect } from 'react';

import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { useGroupedModels } from '@/hooks/useGroupedModels';
import { getCustomProvider, useCustomProvidersStore } from '@/stores/customProviders';
import { getProviderOfModel, isCustomProviderId, resolveConfiguredModel } from '@/types/providers';
import { DEFAULT_THINKING_BUDGET } from '@/types/claude';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function DefaultTab() {
  const { settings, configuredProviders } = useSettings();
  const conv = useConversations();
  const { grouped: groupedModels } = useGroupedModels();
  const customProviders = useCustomProvidersStore((state) => state.providers);
  const enabledCustomProviders = customProviders.filter((provider) => provider.enabled);
  const defaultCustomConfigured =
    isCustomProviderId(settings.defaultModel) &&
    enabledCustomProviders.some((provider) => provider.id === settings.defaultModel);
  const selectedModel =
    (defaultCustomConfigured
      ? settings.defaultModel
      : resolveConfiguredModel(settings.defaultModel, configuredProviders) ??
        enabledCustomProviders[0]?.id) ?? settings.defaultModel;
  const customProvider = isCustomProviderId(selectedModel)
    ? getCustomProvider(selectedModel)
    : null;
  const hasAvailableModels =
    configuredProviders.size > 0 || enabledCustomProviders.length > 0;

  useEffect(() => {
    if (selectedModel !== settings.defaultModel && hasAvailableModels) {
      settings.setDefaultModel(selectedModel);
    }
  }, [hasAvailableModels, selectedModel, settings]);

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>默认模型</Label>
        {!hasAvailableModels && (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
            无可用模型,请先配置 Provider API Key 或添加自定义模型。
          </p>
        )}
        <Select
          value={selectedModel}
          onValueChange={(v) => settings.setDefaultModel(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择默认模型" />
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
        <p className="text-xs text-muted-foreground">
          当前默认 Provider:{' '}
          {customProvider?.name ?? getProviderOfModel(selectedModel) ?? '-'}
        </p>
        <p className="text-xs text-muted-foreground">
          此设置只影响新会话;当前会话的模型请在左侧当前模型中切换。
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="space-y-0.5">
          <Label>默认启用思考模式</Label>
          <p className="text-xs text-muted-foreground">
            新会话默认开启 extended thinking / reasoning(仅对支持的模型生效)
          </p>
        </div>
        <Switch
          checked={settings.defaultThinkingEnabled}
          onCheckedChange={settings.setDefaultThinkingEnabled}
        />
      </div>

      <div className="space-y-2">
        <Label>默认思考预算(tokens)</Label>
        <Input
          type="number"
          min={1024}
          max={64000}
          step={1024}
          value={settings.defaultThinkingBudget}
          onChange={(e) =>
            settings.setDefaultThinkingBudget(Number(e.target.value) || DEFAULT_THINKING_BUDGET)
          }
        />
        <p className="text-xs text-muted-foreground">
          较大的预算可让模型思考更久。Anthropic 实际 max_tokens 会按 2× 预算 + 4096 取大值。
        </p>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        会话数:{conv.list.length} · 已配置 Provider:{' '}
        {[...configuredProviders].join(', ') || '无'} · 自定义模型:{' '}
        {enabledCustomProviders.length}
      </div>
    </div>
  );
}
