import { useMemo, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  MessageSquarePlusIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SunIcon,
} from 'lucide-react';

import { useConversations } from '@/hooks/useConversations';
import { cancelActiveChatStream } from '@/hooks/useChat';
import { useModelSelection } from '@/hooks/useModelSelection';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import type { ModelInfo } from '@/types/providers';

import { ConversationList } from './ConversationList';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
          cancelActiveChatStream();
          await conv.createNew();
        }}
      />
    </aside>
  );
}

function SidebarModelPicker({ onOpenSettings }: SidebarProps) {
  const {
    grouped,
    hasAvailableModels,
    invalidModelId,
    selectedLabel,
    selectedModelId,
    selectModel,
  } = useModelSelection();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredGrouped = useMemo(
    () => filterGroupedModels(grouped, query),
    [grouped, query],
  );
  const hasFilteredModels = Object.values(filteredGrouped).some((models) => models.length > 0);

  const handleSelect = (modelId: string) => {
    selectModel(modelId);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="min-w-0 rounded-md border bg-background/70 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground">当前模型</div>
          <div className="truncate text-sm font-semibold" title={selectedLabel}>
            {selectedLabel}
          </div>
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={!hasAvailableModels}
            className="h-8 w-full min-w-0 justify-between gap-2 overflow-hidden bg-background px-3 font-normal"
          >
            <span className="min-w-0 truncate text-left">
              {selectedModelId ? selectedLabel : '选择模型'}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-2">
          <div className="relative mb-2">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索模型"
              className="h-8 pl-8"
              autoComplete="off"
            />
          </div>
          <div
            data-testid="sidebar-model-list"
            className="max-h-72 overflow-y-auto overscroll-contain pr-1"
          >
            <div className="space-y-2">
              {hasFilteredModels ? (
                Object.entries(filteredGrouped).map(([group, models]) =>
                  models.length > 0 ? (
                    <div key={group} className="space-y-1">
                      <div className="px-2 text-xs font-medium text-muted-foreground">
                        {group}
                      </div>
                      {models.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            'flex h-8 w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                            item.id === selectedModelId && 'bg-accent text-accent-foreground',
                          )}
                          onClick={() => handleSelect(item.id)}
                        >
                          <span className="min-w-0 flex-1 truncate" title={item.label}>
                            {item.label}
                          </span>
                          {item.supportsThinking && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              thinking
                            </span>
                          )}
                          {item.id === selectedModelId && (
                            <CheckIcon className="size-3.5 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null,
                )
              ) : (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  没有匹配模型
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <div
        className={cn(
          'mt-2 min-w-0 truncate rounded-sm px-2 py-1 text-[11px]',
          Object.keys(grouped).length > 0
            ? 'bg-primary/5 text-primary'
            : 'bg-muted text-muted-foreground',
        )}
        title={invalidModelId ? `当前会话模型不可用: ${invalidModelId}` : undefined}
      >
        {invalidModelId
          ? `当前会话模型不可用: ${invalidModelId}`
          : Object.keys(grouped).length > 0
            ? '已按可用 Provider 过滤'
            : '请先配置 API Key'}
      </div>
    </div>
  );
}

function filterGroupedModels(
  grouped: Record<string, ModelInfo[]>,
  rawQuery: string,
): Record<string, ModelInfo[]> {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return grouped;
  return Object.fromEntries(
    Object.entries(grouped).map(([group, models]) => [
      group,
      models.filter((model) =>
        `${model.label} ${model.id} ${model.provider}`
          .toLocaleLowerCase()
          .includes(query),
      ),
    ]),
  );
}
