import { memo, useMemo, useState } from 'react';
import { BotIcon, CheckCircle2Icon, ChevronDownIcon, ChevronRightIcon, UserIcon, XCircleIcon } from 'lucide-react';

import type { ChatMessage } from '@/types/claude';

import { Markdown } from './Markdown';
import { ThinkingBlock } from './ThinkingBlock';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  message: ChatMessage;
}

/**
 * 单条消息渲染组件(v1.3 重构)
 *
 * - `React.memo` 包裹,只在新 message 引用变化时重渲
 * - 4 次 `content.filter` 合并为一次性 partition,避免 O(n) × 4
 */
export const MessageItem = memo(function MessageItem({ message }: Props) {
  const isUser = message.role === 'user';

  // 一次性 partition content blocks,避免 4 次线性扫
  const { textBlocks, thinkingBlocks, toolUseBlocks, toolResultBlocks } = useMemo(() => {
    const content = message.content;
    return {
      textBlocks: content.filter(
        (b): b is Extract<typeof content[number], { type: 'text' }> => b.type === 'text',
      ),
      thinkingBlocks: content.filter(
        (b): b is Extract<typeof content[number], { type: 'thinking' }> => b.type === 'thinking',
      ),
      toolUseBlocks: content.filter(
        (b): b is Extract<typeof content[number], { type: 'tool_use' }> => b.type === 'tool_use',
      ),
      toolResultBlocks: content.filter(
        (b): b is Extract<typeof content[number], { type: 'tool_result' }> =>
          b.type === 'tool_result',
      ),
    };
  }, [message]);

  const fullText = textBlocks.map((b) => b.text).join('');
  const fullThinking = thinkingBlocks.map((b) => b.thinking).join('');

  return (
    <div
      data-role={message.role}
      className={cn(
        // v1.3:user 整行靠左,内容用窄气泡(紧凑);assistant 占满左对齐(宽松)。
        // 两者都"贴左",但宽度有别 — 短问题跟长回答放一起更协调。
        'group/message flex w-full gap-3 px-4 py-4 sm:px-6',
        isUser ? 'bg-background' : 'bg-muted/30',
      )}
    >
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border',
          isUser ? 'bg-background' : 'bg-primary/10 text-primary',
        )}
      >
        {isUser ? <UserIcon className="size-4" /> : <BotIcon className="size-4" />}
      </div>

      <div
        className={cn(
          'min-w-0 space-y-2',
          // user 内容靠左 + 气泡样式;assistant 占满内容列(由父 max-w-3xl 控宽)
          isUser
            ? 'max-w-2xl rounded-2xl rounded-tl-sm border bg-muted/40 px-4 py-2.5'
            : 'flex-1',
        )}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{isUser ? '你' : 'Claude'}</span>
          {message.model && !isUser && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {message.model}
            </Badge>
          )}
          {message.streaming && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              生成中
            </span>
          )}
        </div>

        {fullThinking && (
          <ThinkingBlock text={fullThinking} streaming={message.streaming} />
        )}

        {fullText ? (
          <Markdown>{fullText}</Markdown>
        ) : !message.streaming && !fullThinking && toolUseBlocks.length === 0 ? (
          <div className="text-sm text-muted-foreground">(空消息)</div>
        ) : null}

        {toolUseBlocks.length > 0 && (
          <div className="space-y-2">
            {toolUseBlocks.map((b) => {
              const result = toolResultBlocks.find((r) => r.tool_use_id === b.id);
              return (
                <ToolUseCard
                  key={b.id}
                  name={b.name}
                  input={b.input}
                  result={result}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

function ToolUseCard({
  name,
  input,
  result,
}: {
  name: string;
  input: unknown;
  result?: Extract<ChatMessage['content'][number], { type: 'tool_result' }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        'rounded-md border text-xs',
        result?.is_error ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/40',
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left font-mono hover:bg-muted/60"
      >
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
        <span className="text-muted-foreground">🔧</span>
        <span className="font-medium">{name}</span>
        {result && !result.is_error && (
          <CheckCircle2Icon className="ml-auto size-3.5 text-green-600" />
        )}
        {result?.is_error && <XCircleIcon className="ml-auto size-3.5 text-destructive" />}
        {!result && (
          <span className="ml-auto text-[10px] text-muted-foreground">执行中…</span>
        )}
      </button>
      {open && (
        <div className="border-t bg-background/50 px-2 py-1.5 text-xs">
          <div className="mb-1 text-muted-foreground">参数：</div>
          <pre className="overflow-x-auto rounded bg-muted/30 p-1.5 text-[11px]">
            <code>{JSON.stringify(input, null, 2)}</code>
          </pre>
          {result && (
            <>
              <div className="mt-2 mb-1 text-muted-foreground">
                {result.is_error ? '错误：' : '结果：'}
              </div>
              <pre
                className={cn(
                  'max-h-80 overflow-auto rounded p-1.5 text-[11px]',
                  result.is_error ? 'bg-destructive/10' : 'bg-muted/30',
                )}
              >
                <code>{truncateForDisplay(result.content, 4000)}</code>
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function truncateForDisplay(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n…(截断 ${s.length - max} 字符)`;
}
