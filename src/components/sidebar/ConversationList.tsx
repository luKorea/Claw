import { useState } from 'react';
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';

import { useConversations } from '@/hooks/useConversations';
import { useChatStore } from '@/stores/chat';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString('zh-CN');
}

interface ItemProps {
  id: string;
  title: string;
  updatedAt: number;
  active: boolean;
  onSelect: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
}

function ConversationItem({
  title,
  updatedAt,
  active,
  onSelect,
  onRename,
  onDelete,
}: ItemProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);

  return (
    <div
      className={cn(
        'group/item relative flex items-center gap-1 rounded-md px-2 py-1.5 text-sm',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/60',
      )}
    >
      {editing ? (
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value.trim()) onRename(value.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (value.trim()) onRename(value.trim());
              setEditing(false);
            } else if (e.key === 'Escape') {
              setValue(title);
              setEditing(false);
            }
          }}
          className="h-7 text-sm"
        />
      ) : (
        <button
          onClick={onSelect}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <span className="w-full truncate">{title}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatTime(updatedAt)}
          </span>
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              'size-6 shrink-0 opacity-0 transition-opacity',
              'group-hover/item:opacity-100',
              active && 'opacity-100',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontalIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <PencilIcon className="size-3.5" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              if (window.confirm(`删除会话「${title}」？此操作不可撤销。`)) {
                onDelete();
              }
            }}
          >
            <Trash2Icon className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ConversationList() {
  const conv = useConversations();
  const chat = useChatStore();

  if (conv.list.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        还没有会话
        <br />
        点击上方"新建"开始
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-0.5 px-2">
        {conv.list.map((c) => (
          <ConversationItem
            key={c.id}
            id={c.id}
            title={c.title}
            updatedAt={c.updated_at}
            active={conv.currentId === c.id}
            onSelect={async () => {
              if (chat.isStreaming) {
                if (!window.confirm('正在生成回复中，切换会话会中断当前回复。继续？')) return;
              }
              await conv.selectConversation(c.id);
            }}
            onRename={(newTitle) => conv.update({ id: c.id, title: newTitle })}
            onDelete={() => conv.remove(c.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
