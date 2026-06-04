import { useCallback, useEffect, useRef, useState } from 'react';
import { SendHorizontalIcon, SquareIcon } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';

import { useChat } from '@/hooks/useChat';
import { useConversations } from '@/hooks/useConversations';
import { usePrompts } from '@/hooks/usePrompts';
import { useTimeoutMessage } from '@/hooks/useTimeoutMessage';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PresetDropdown } from '@/components/chat/PresetDropdown';
import { cn } from '@/lib/utils';

interface Props {
  onSend?: () => void;
  className?: string;
}

const MAX_ROWS = 12;

export function MessageInput({ onSend, className }: Props) {
  const [text, setText] = useState('');
  const [toast, showToast] = useTimeoutMessage(2000);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { send, cancel, isStreaming, error } = useChat();
  // v1.2 Bug 4:读当前会话的 system_prompt(预设被应用后会写入这里),并在 send 时透传
  const { current, update: updateConv } = useConversations();
  // v1.2 Bug 4:消息输入框旁加 [预设] 按钮,列出全部预设
  const { list: prompts, refresh: refreshPrompts } = usePrompts();

  useEffect(() => {
    void refreshPrompts();
  }, [refreshPrompts]);

  const submit = useCallback(async () => {
    const value = text.trim();
    if (!value || isStreaming) return;
    setText('');
    try {
      // v1.2 Bug 4:把当前会话的 system_prompt 透传给 useChat
      await send({
        text: value,
        system: current?.system_prompt ?? null,
      });
      onSend?.();
    } catch (e) {
      console.warn('send failed', e);
    }
  }, [text, isStreaming, send, onSend, current?.system_prompt]);

  // v1.2 Bug 4:点选预设 → 写入当前会话 system_prompt
  const applyPreset = useCallback(
    async (presetId: string) => {
      const preset = prompts.find((p) => p.id === presetId);
      if (!preset || !current) {
        showToast('无法应用预设(无当前会话)');
        return;
      }
      try {
        await updateConv({ id: current.id, system_prompt: preset.content });
        showToast(`已应用预设:${preset.name}`);
      } catch (e) {
        showToast('应用预设失败');
        console.warn('apply preset failed', e);
      }
    },
    [prompts, current, updateConv, showToast],
  );

  useHotkeys(
    'mod+enter',
    (e) => {
      e.preventDefault();
      submit();
    },
    { enableOnFormTags: ['TEXTAREA'] },
    [submit],
  );

  useHotkeys(
    'escape',
    () => {
      if (isStreaming) cancel();
    },
    { enableOnFormTags: ['TEXTAREA'] },
    [isStreaming, cancel],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 20;
    const maxHeight = lineHeight * MAX_ROWS + 16;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  return (
    <div className={cn('border-t bg-background/80 px-4 py-3 backdrop-blur sm:px-6', className)}>
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={cn(
            'flex items-end gap-2 rounded-2xl border bg-background px-3 py-2 shadow-sm transition-colors',
            'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
            error && 'border-destructive/50',
          )}
        >
          {/* v1.3:抽出 PresetDropdown,组件只负责展示 + 选择,逻辑外置 */}
          <PresetDropdown
            presets={prompts}
            disabled={isStreaming || !current}
            onApply={(id) => void applyPreset(id)}
          />

          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="发消息给 Claude（Enter 发送，Shift+Enter 换行）"
            rows={1}
            className="min-h-9 flex-1 border-0 bg-transparent px-1 py-1.5 text-sm shadow-none focus-visible:ring-0"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="destructive"
                  onClick={cancel}
                  className="size-8 shrink-0"
                >
                  <SquareIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>停止生成（Esc）</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  onClick={submit}
                  disabled={!text.trim()}
                  className="size-8 shrink-0"
                >
                  <SendHorizontalIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>发送（⌘+Enter）</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {toast ?? 'Claude 可能会产生错误，请核实重要信息。'}
        </p>
      </div>
    </div>
  );
}
