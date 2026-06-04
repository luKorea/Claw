import { useState } from 'react';
import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react';

import { usePrompts } from '@/hooks/usePrompts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

interface Props {
  /** 当前会话的 system prompt id（可空） */
  activePresetId?: string | null;
  /** 用户在编辑会话 system prompt 时的实时值 */
  draftSystemPrompt?: string;
  /** 用户选择预设时调用 */
  onApplyPreset?: (presetId: string | null) => void;
  className?: string;
}

export function PromptsPanel({
  activePresetId,
  draftSystemPrompt,
  onApplyPreset,
  className,
}: Props) {
  const prompts = usePrompts();
  const [selectedId, setSelectedId] = useState<string | null>(activePresetId ?? null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const selected = prompts.list.find((p) => p.id === selectedId);

  const startNew = () => {
    setSelectedId(null);
    setName('');
    setContent('');
    setEditing(true);
  };

  const startEdit = () => {
    if (!selected) return;
    setName(selected.name);
    setContent(selected.content);
    setEditing(true);
  };

  const save = async () => {
    if (!name.trim() || !content.trim()) return;
    if (selectedId) {
      await prompts.update(selectedId, { name: name.trim(), content });
    } else {
      const created = await prompts.create({ name: name.trim(), content });
      setSelectedId(created.id);
    }
    setEditing(false);
  };

  const remove = async () => {
    if (!selected || selected.builtin) return;
    await prompts.remove(selected.id);
    setSelectedId(null);
  };

  return (
    <div className={cn('flex h-full', className)}>
      {/* 左侧：预设列表 */}
      <div className="flex w-56 shrink-0 flex-col border-r">
        <div className="flex items-center gap-2 p-2">
          <span className="text-xs font-medium text-muted-foreground">系统提示词</span>
          <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={startNew}>
            <PlusIcon className="size-4" />
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="space-y-0.5 p-2">
            {prompts.list.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedId(p.id);
                  setEditing(false);
                  onApplyPreset?.(p.id);
                }}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                  selectedId === p.id && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="flex-1 truncate">{p.name}</span>
                {p.builtin ? (
                  <Badge variant="outline" className="px-1 text-[10px]">
                    内置
                  </Badge>
                ) : null}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* 右侧：编辑/预览 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {editing || (!selected && !activePresetId) ? (
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：代码审查"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col space-y-2">
              <Label>内容（支持 {'{{variable}}'} 占位）</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="你是一位…"
                className="flex-1 resize-none font-mono text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button onClick={save} disabled={!name.trim() || !content.trim()}>
                <SaveIcon className="size-4" />
                保存
              </Button>
            </div>
          </div>
        ) : selected ? (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-2 border-b p-3">
              <h3 className="font-medium">{selected.name}</h3>
              {selected.builtin ? (
                <Badge variant="outline" className="text-[10px]">
                  内置
                </Badge>
              ) : null}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={startEdit}>
                  编辑
                </Button>
                {!selected.builtin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmRemoveOpen(true)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <ScrollArea className="flex-1">
              <pre className="whitespace-pre-wrap p-4 font-mono text-sm">{selected.content}</pre>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-sm text-muted-foreground">
            选中左侧预设查看，或点击 + 新建
            {draftSystemPrompt && (
              <div className="mt-4 w-full max-w-2xl px-4">
                <Label className="text-xs">当前会话 system prompt 预览：</Label>
                <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs">
                  {draftSystemPrompt}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        title={`删除预设「${selected?.name ?? ''}」`}
        description="此操作不可撤销。"
        confirmText="删除"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
