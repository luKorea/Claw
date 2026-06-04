import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { useChatStore } from '@/stores/chat';

import { MessageItem } from './MessageItem';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const error = useChatStore((s) => s.error);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    // 自动滚到底部
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isStreaming]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJump(distance > 200);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="relative flex-1 overflow-hidden">
      <ScrollArea className="h-full" ref={scrollRef}>
        <div className="mx-auto w-full max-w-3xl pb-32">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((m) => <MessageItem key={m.id} message={m} />)
          )}
          {isStreaming && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex items-center gap-2 px-6 py-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Claude 正在思考…
            </div>
          )}
          {error && (
            <div className="mx-6 my-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              错误：{error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {showJump && (
        <Button
          variant="outline"
          size="icon-sm"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-md"
          onClick={() =>
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
          }
        >
          <ChevronDownIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pt-24 text-center">
      <div className="mb-4 text-4xl">👋</div>
      <h2 className="text-xl font-semibold">开始一次新的对话</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        在下方输入消息，按 <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">Enter</kbd> 发送，
        <kbd className="ml-1 rounded border bg-muted px-1.5 py-0.5 text-xs">Shift+Enter</kbd> 换行。
      </p>
      <ul className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 text-left sm:grid-cols-2">
        {['用 Python 写个快速排序', '解释一下 Rust 的所有权', '翻译：把这段话译成英文', '总结：什么是 LLM'].map(
          (q) => (
            <li
              key={q}
              className="rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-xs hover:bg-accent"
            >
              {q}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
