import { useState } from 'react';
import {
  CheckIcon,
  MessageSquarePlusIcon,
  MoonIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SunIcon,
} from 'lucide-react';

import { useConversations } from '@/hooks/useConversations';
import { useGroupedModels } from '@/hooks/useGroupedModels';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

import { ConversationList } from './ConversationList';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { SettingsTab } from '@/components/settings/SettingsDialog';

interface SidebarProps {
  onOpenSettings: (tab?: SettingsTab) => void;
}

const BRAND_ICON_SRC = '/brand/final/claw-ui-mark.svg';

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const conv = useConversations();
  const isStreaming = useChatStore((s) => s.isStreaming);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const [confirmInterruptOpen, setConfirmInterruptOpen] = useState(false);

  const handleNew = async () => {
    if (isStreaming) {
      setConfirmInterruptOpen(true);
      return;
    }
    await conv.createNew();
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#F4F8FF]">
          <img
            src={BRAND_ICON_SRC}
            alt="Claw"
            className="size-6"
            draggable={false}
          />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Claw</div>
          <div className="truncate text-[11px] text-muted-foreground">多 Provider AI 客户端</div>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-10 w-full justify-start gap-2"
              onClick={() => void handleNew()}
            >
              <MessageSquarePlusIcon className="size-4" />
              新建会话
            </Button>
          </TooltipTrigger>
          <TooltipContent>新建会话（⌘+N）</TooltipContent>
        </Tooltip>

        <SidebarModelPicker onOpenSettings={onOpenSettings} />
      </div>

      <Separator />

      <ConversationList />

      <Separator />

      <div className="flex items-center gap-1 px-2 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
        >
          {theme === 'dark' ? (
            <MoonIcon className="size-4" />
          ) : (
            <SunIcon className="size-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => onOpenSettings()}
        >
          <SettingsIcon className="size-4" />
          设置
        </Button>
      </div>

      <ConfirmDialog
        open={confirmInterruptOpen}
        onOpenChange={setConfirmInterruptOpen}
        title="中断当前回复?"
        description="正在生成回复中,新建会话会中断当前回复。继续?"
        confirmText="继续"
        onConfirm={async () => {
          await conv.createNew();
        }}
      />
    </aside>
  );
}

function SidebarModelPicker({ onOpenSettings }: SidebarProps) {
  const conv = useConversations();
  const { grouped } = useGroupedModels();
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const setDefaultModel = useSettingsStore((s) => s.setDefaultModel);
  const setChatError = useChatStore((s) => s.setError);
  const model = conv.current?.model ?? defaultModel;
  const modelLabel =
    Object.values(grouped)
      .flat()
      .find((item) => item.id === model)?.label ?? model;

  const handleChange = (value: string) => {
    setChatError(null);
    if (!conv.current) {
      setDefaultModel(value);
      return;
    }
    void conv.update({ id: conv.current.id, model: value }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      setChatError(`切换模型失败：${message}`);
    });
  };

  return (
    <div className="rounded-md border bg-background/70 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">当前模型</div>
          <div className="truncate text-sm font-semibold">{modelLabel}</div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenSettings('models')}>
              <SlidersHorizontalIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>配置模型</TooltipContent>
        </Tooltip>
      </div>
      <Select value={model} onValueChange={handleChange}>
        <SelectTrigger className="h-8 bg-background">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(grouped).map(([group, models]) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {models.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{item.label}</span>
                    {item.id === model && <CheckIcon className="size-3.5 text-primary" />}
                    {item.supportsThinking && (
                      <span className="text-[10px] text-muted-foreground">thinking</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <div
        className={cn(
          'mt-2 rounded-sm px-2 py-1 text-[11px]',
          Object.keys(grouped).length > 0
            ? 'bg-primary/5 text-primary'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {Object.keys(grouped).length > 0 ? '已按可用 Provider 过滤' : '请先配置 API Key'}
      </div>
    </div>
  );
}
