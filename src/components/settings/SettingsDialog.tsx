/**
 * SettingsDialog (v1.3 重构)
 *
 * 纯框架:Dialog + sidebar + 5 个 tab 组件(各自独立文件)。
 * 业务逻辑见 ApiKeyTab / DefaultTab / AboutTab / PromptsTab / ToolsTab。
 */

import {
  InfoIcon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  SlidersHorizontalIcon,
  WrenchIcon,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ApiKeyTab } from '@/components/settings/ApiKeyTab';
import { DefaultTab } from '@/components/settings/DefaultTab';
import { CustomProvidersTab } from '@/components/settings/CustomProvidersTab';
import { AboutTab } from '@/components/settings/AboutTab';
import { PromptsTab } from '@/components/settings/PromptsTab';
import { ToolsTab } from '@/components/settings/ToolsTab';
import type { AvailableUpdate } from '@/lib/updater';

export type SettingsTab = 'apikey' | 'models' | 'prompts' | 'tools' | 'about';

const SETTINGS_NAV_ITEMS: Array<{
  value: SettingsTab;
  label: string;
  description: string;
  icon: typeof KeyRoundIcon;
}> = [
  {
    value: 'apikey',
    label: 'API Key',
    description: 'Provider 密钥',
    icon: KeyRoundIcon,
  },
  {
    value: 'models',
    label: '模型',
    description: '默认模型与自定义 Provider',
    icon: SlidersHorizontalIcon,
  },
  {
    value: 'prompts',
    label: '提示词',
    description: '预设与管理',
    icon: MessageSquareTextIcon,
  },
  {
    value: 'tools',
    label: '工具',
    description: '内置工具与 MCP',
    icon: WrenchIcon,
  },
  {
    value: 'about',
    label: '关于',
    description: '版本与项目',
    icon: InfoIcon,
  },
];

function SettingsContent({
  activeTab,
  onUpdateAvailable,
}: {
  activeTab: SettingsTab;
  onUpdateAvailable?: (update: AvailableUpdate) => void;
}) {
  if (activeTab === 'apikey') return <ApiKeyTab />;
  if (activeTab === 'models') {
    return (
      <>
        <DefaultTab />
        <div className="my-5 h-px bg-border" />
        <CustomProvidersTab />
      </>
    );
  }
  if (activeTab === 'prompts') return <PromptsTab />;
  if (activeTab === 'tools') return <ToolsTab />;
  return <AboutTab onUpdateAvailable={onUpdateAvailable} />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: SettingsTab;
  onActiveTabChange: (tab: SettingsTab) => void;
  onUpdateAvailable?: (update: AvailableUpdate) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  activeTab,
  onActiveTabChange,
  onUpdateAvailable,
}: Props) {
  const activeItem =
    SETTINGS_NAV_ITEMS.find((item) => item.value === activeTab) ?? SETTINGS_NAV_ITEMS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="sr-only">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            Claw 把你的 API Key 写入本机配置文件,不会上传任何服务端。
          </DialogDescription>
        </DialogHeader>
        <div
          className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)]"
          data-testid="settings-layout"
        >
          <aside className="border-r bg-muted/30 p-4">
            <div className="mb-5">
              <h2 className="text-lg font-semibold">设置</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                本机配置与模型能力
              </p>
            </div>
            <nav className="space-y-1" aria-label="设置功能">
              {SETTINGS_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.value === activeTab;
                return (
                  <Button
                    key={item.value}
                    type="button"
                    variant="ghost"
                    className={cn(
                      'h-auto w-full justify-start gap-3 px-3 py-2 text-left',
                      active && 'bg-accent text-accent-foreground',
                    )}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onActiveTabChange(item.value)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </nav>
          </aside>
          <main
            className="min-h-0 min-w-0 overflow-y-auto px-6 py-5"
            data-testid="settings-content-scroll"
          >
            <div className="mb-5">
              <h3 className="text-xl font-semibold">{activeItem.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeItem.description}
              </p>
            </div>
            <SettingsContent
              activeTab={activeTab}
              onUpdateAvailable={onUpdateAvailable}
            />
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
