import { useEffect, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  CalendarDaysIcon,
  LanguagesIcon,
  PenLineIcon,
  SparklesIcon,
} from 'lucide-react';

import { useChatStore } from '@/stores/chat';
import { useChat } from '@/hooks/useChat';

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
              模型正在思考…
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
  const { send, isStreaming } = useChat();
  const suggestions = [
    {
      icon: PenLineIcon,
      text: '帮我写一篇产品介绍',
    },
    {
      icon: SparklesIcon,
      text: '分析这段代码',
    },
    {
      icon: LanguagesIcon,
      text: '帮我翻译这段文字',
    },
    {
      icon: CalendarDaysIcon,
      text: '生成一份周报',
    },
  ];

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 pt-16 text-center">
      <div className="mb-5 flex size-20 items-center justify-center rounded-md border bg-primary/5 text-primary shadow-sm">
        <SparklesIcon className="size-9" />
      </div>
      <h2 className="text-2xl font-semibold">你好，我是 Claw</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        选择一个问题开始，或直接在下方输入你的内容。
      </p>
      <ul className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 text-left sm:grid-cols-2">
        {suggestions.map(({ icon: Icon, text }) => (
          <li key={text}>
            <button
              type="button"
              disabled={isStreaming}
              className="flex h-12 w-full items-center gap-3 rounded-md border bg-card px-3 text-left text-sm text-card-foreground shadow-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void send({ text })}
            >
              <Icon className="size-4 text-primary" />
              <span className="truncate">{text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
