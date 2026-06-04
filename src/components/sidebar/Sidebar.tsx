import { useState } from 'react';
import { MessageSquarePlusIcon, SettingsIcon } from 'lucide-react';

import { useConversations } from '@/hooks/useConversations';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';

import { ConversationList } from './ConversationList';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface SidebarProps {
  onOpenSettings: () => void;
}

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
    <aside className="bg-sidebar text-sidebar-foreground flex h-full w-64 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2 px-3 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="flex-1 justify-start gap-2"
              onClick={() => void handleNew()}
            >
              <MessageSquarePlusIcon className="size-4" />
              新建会话
            </Button>
          </TooltipTrigger>
          <TooltipContent>新建会话（⌘+N）</TooltipContent>
        </Tooltip>
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
          {theme === 'dark' ? '🌙' : '☀️'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onOpenSettings}
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
