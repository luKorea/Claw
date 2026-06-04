import { useState } from 'react';
import { EyeIcon, EyeOffIcon, Trash2Icon, CheckCircle2Icon } from 'lucide-react';

import { useSettings } from '@/hooks/useSettings';
import type { ApiKeyState } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { useModels } from '@/hooks/useModels';
import {
  ALL_PROVIDER_IDS,
  ALL_MODELS,
  PROVIDERS,
  getProviderOfModel,
  type ProviderId,
} from '@/types/providers';
import { DEFAULT_THINKING_BUDGET } from '@/types/claude';
import { PromptsPanel } from '@/components/prompts/PromptsPanel';
import { ToolsSection } from '@/components/settings/ToolsSection';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            Claw 把你的 API Key 写入操作系统的 Keychain,不会上传任何服务端。
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="apikey">
          <TabsList className="w-full">
            <TabsTrigger value="apikey" className="flex-1">
              API Key
            </TabsTrigger>
            <TabsTrigger value="default" className="flex-1">
              默认参数
            </TabsTrigger>
            <TabsTrigger value="prompts" className="flex-1">
              提示词
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex-1">
              工具
            </TabsTrigger>
            <TabsTrigger value="about" className="flex-1">
              关于
            </TabsTrigger>
          </TabsList>
          <TabsContent value="apikey" className="-mx-6 -mb-6 max-h-[60vh] overflow-y-auto px-6 pb-6 pt-2">
            <ApiKeyTab />
          </TabsContent>
          <TabsContent value="default" className="pt-2">
            <DefaultTab />
          </TabsContent>
          <TabsContent value="prompts" className="-mx-6 -mb-6 h-[420px] pt-2">
            <PromptsPanel />
          </TabsContent>
          <TabsContent value="tools" className="pt-2">
            <ToolsSection />
          </TabsContent>
          <TabsContent value="about" className="pt-2">
            <AboutTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeyTab() {
  const { keys, saveKey, removeKey, refreshOne } = useSettings();

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
        />
      ))}
    </div>
  );
}

function ProviderKeyCard({
  provider,
  state,
  onSave,
  onRemove,
}: {
  provider: ProviderId;
  state: ApiKeyState;
  onSave: (key: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const meta = PROVIDERS[provider];
  const [input, setInput] = useState('');
  const [show, setShow] = useState(false);
  // v1.2 Bug 3.2:保存 Key 成功后,触发该 provider 的动态模型拉取
  const { fetchProvider } = useModels();

  const handleSave = async () => {
    if (!input.trim()) return;
    try {
      await onSave(input.trim());
      setInput('');
      // 不 await:fetchProvider 自己有 24h 缓存,后台拉取不阻塞 UI
      void fetchProvider(provider);
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
          获取。Key 以 <code>sk-</code> 开头。
        </span>
        {state.configured && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (window.confirm(`确认删除已保存的 ${meta.label} API Key?`)) {
                await onRemove();
              }
            }}
            disabled={state.saving}
          >
            <Trash2Icon className="size-3.5" />
            清除
          </Button>
        )}
      </div>

      {state.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {state.error}
        </div>
      )}
    </div>
  );
}

function DefaultTab() {
  const { settings, configuredProviders } = useSettings();
  const conv = useConversations();
  // v1.2 Bug 3.2:用 useModels 合并(动态拉取 + 硬编码 fallback)
  const { isModelKnown, mergedModelsByProvider } = useModels();

  // v1.2 Bug 3.1:按 provider 分组前先 filter,只显示已配 Key 的 provider 的模型
  // Bug 3.2:用动态 + 硬编码 union;如果当前 defaultModel 不在合并集合内,仍保留(降级显示)
  const allGrouped = mergedModelsByProvider();
  const groupedModels = ALL_MODELS.filter((m) => configuredProviders.has(m.provider)).reduce<
    Record<string, typeof ALL_MODELS[number][]>
  >(
    (acc, m) => {
      (acc[m.groupLabel] ??= []).push(m);
      return acc;
    },
    {},
  );
  // 把动态 id 也并入(可能不在 ALL_MODELS 里,只来自 /v1/models)
  for (const p of Object.keys(allGrouped) as ProviderId[]) {
    if (!configuredProviders.has(p)) continue;
    for (const id of allGrouped[p]) {
      if (isModelKnown(id, p) && !groupedModels[p]) {
        // 合并到对应 group(找硬编码中同 provider 的 group,或建 'Custom' group)
        const sameProvider = ALL_MODELS.find((m) => m.provider === p);
        const groupKey = sameProvider?.groupLabel ?? p;
        groupedModels[groupKey] ??= [];
        if (!groupedModels[groupKey].some((m) => m.id === id)) {
          // 动态 id 暂时用 id 当 label,getModelInfo 找得到则用 label
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
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>默认模型</Label>
        {configuredProviders.size === 0 && (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
            无已配 Provider,请先在 API Key 标签页配置。
          </p>
        )}
        <Select
          value={settings.defaultModel}
          onValueChange={(v) => settings.setDefaultModel(v)}
        >
          <SelectTrigger>
            {/* v1.2 Bug 2:加 placeholder 提示当前无可选项;并包 span 让 Radix 稳定抓取 label 回显 */}
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
          {getProviderOfModel(settings.defaultModel) ?? '-'}
        </p>
        <p className="text-xs text-muted-foreground">
          此设置只影响新会话;当前会话的模型请在顶部下拉切换。
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
        {[...configuredProviders].join(', ') || '无'}
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-3 pt-2 text-sm">
      <p>
        <strong>Claw</strong> v0.2.0 — 多 Provider AI 桌面客户端
      </p>
      <p className="text-muted-foreground">
        支持 Anthropic / DeepSeek / OpenAI / MiniMax。
        本地存储所有数据,API Key 通过操作系统 Keychain 管理。
      </p>
      <p className="text-muted-foreground">
        使用 Tauri 2 + React 19 + TypeScript 构建。
      </p>
      <p className="text-muted-foreground">
        仓库:<a className="text-primary underline" href="#">github.com/yourname/claw-client</a>
      </p>
    </div>
  );
}
