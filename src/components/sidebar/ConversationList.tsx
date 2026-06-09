import { useEffect, useMemo, useState } from 'react';
import {
  CheckSquareIcon,
  MessagesSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';

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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  selectionMode: boolean;
  selected: boolean;
  disabledSelection: boolean;
  onSelect: () => void;
  onToggleSelected: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
}

function ConversationItem({
  title,
  updatedAt,
  active,
  selectionMode,
  selected,
  disabledSelection,
  onSelect,
  onToggleSelected,
  onRename,
  onDelete,
}: ItemProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  return (
    <div
      className={cn(
        'group/item relative flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm',
        active
          ? 'border-primary/20 bg-sidebar-accent text-sidebar-accent-foreground'
          : 'border-transparent hover:bg-secondary',
      )}
    >
      {selectionMode && (
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
          disabled={disabledSelection}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelected();
          }}
        >
          {selected ? (
            <CheckSquareIcon className="size-4 text-primary" />
          ) : (
            <SquareIcon className="size-4" />
          )}
        </button>
      )}

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
          onClick={selectionMode ? onToggleSelected : onSelect}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <span className="w-full truncate">{title}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatTime(updatedAt)}
          </span>
        </button>
      )}

      {!selectionMode && (
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
            onSelect={() => setConfirmDeleteOpen(true)}
          >
            <Trash2Icon className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`删除会话「${title}」`}
        description="此操作不可撤销。"
        confirmText="删除"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}

export function ConversationList() {
  const conv = useConversations();
  // v1.3:selector 化,只订阅用到的 isStreaming,避免流式时整侧栏 re-render
  const isStreaming = useChatStore((s) => s.isStreaming);
  // 切换会话时的中断确认弹窗(单一 state 服务整侧栏,任一会话点击都会触发)
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const selectedList = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const allCurrentSelected =
    conv.list.length > 0 && conv.list.every((item) => selectedIds.has(item.id));

  useEffect(() => {
    setSelectedIds((prev) => {
      const existing = new Set(conv.list.map((item) => item.id));
      const next = new Set([...prev].filter((id) => existing.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [conv.list]);

  if (conv.list.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
        <div className="mb-3 flex size-10 items-center justify-center rounded-md border bg-background">
          <MessagesSquareIcon className="size-5" />
        </div>
        <div className="font-medium text-foreground">暂无对话</div>
        <div className="mt-1">从新建会话开始</div>
      </div>
    );
  }

  const requestSelect = (id: string) => {
    if (isStreaming) {
      setPendingSelect(id);
      setConfirmSwitchOpen(true);
      return;
    }
    void conv.selectConversation(id);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allCurrentSelected) return new Set();
      return new Set([...prev, ...conv.list.map((item) => item.id)]);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isStreaming}
          onClick={() => {
            setSelectionMode((value) => !value);
            setSelectedIds(new Set());
          }}
        >
          {selectionMode ? '取消' : '选择'}
        </Button>
        {selectionMode && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isStreaming}
              onClick={toggleSelectAll}
            >
              {allCurrentSelected ? '取消全选' : '全选'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs text-destructive hover:text-destructive"
              disabled={isStreaming || selectedIds.size === 0}
              onClick={() => setConfirmBulkDeleteOpen(true)}
            >
              <Trash2Icon className="size-3.5" />
              删除 {selectedIds.size}
            </Button>
          </>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 px-2">
          {conv.list.map((c) => (
            <ConversationItem
              key={c.id}
              id={c.id}
              title={c.title}
              updatedAt={c.updated_at}
              active={conv.currentId === c.id}
              selectionMode={selectionMode}
              selected={selectedIds.has(c.id)}
              disabledSelection={isStreaming}
              onSelect={() => requestSelect(c.id)}
              onToggleSelected={() => toggleSelected(c.id)}
              onRename={(newTitle) => conv.update({ id: c.id, title: newTitle })}
              onDelete={() => conv.remove(c.id)}
            />
          ))}
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={confirmSwitchOpen}
        onOpenChange={(o) => {
          setConfirmSwitchOpen(o);
          if (!o) setPendingSelect(null);
        }}
        title="中断当前回复?"
        description="正在生成回复中,切换会话会中断当前回复。继续?"
        confirmText="继续"
        onConfirm={async () => {
          if (pendingSelect) await conv.selectConversation(pendingSelect);
          setPendingSelect(null);
        }}
      />

      <ConfirmDialog
        open={confirmBulkDeleteOpen}
        onOpenChange={setConfirmBulkDeleteOpen}
        title={`删除 ${selectedIds.size} 个会话`}
        description="选中的会话和消息都会被删除，此操作不可撤销。"
        confirmText="删除"
        destructive
        onConfirm={async () => {
          await conv.removeMany(selectedList);
          setSelectedIds(new Set());
          setSelectionMode(false);
        }}
      />
    </div>
  );
}
