import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const LANG_RE = /language-(\w+)/;

export function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const match = LANG_RE.exec(className ?? '');
  const lang = match?.[1] ?? 'text';
  const text = String(children ?? '').replace(/\n$/, '');

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-lg border bg-zinc-950 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
        <span className="font-mono">{lang}</span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed text-zinc-100">
        <code className={`language-${lang}`}>{text}</code>
      </pre>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-6 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // ignore
        }
      }}
      title="复制代码"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </Button>
  );
}

export function InlineCode({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        'bg-muted relative rounded px-[0.3rem] py-[0.15rem] font-mono text-[0.85em]',
        className,
      )}
      {...props}
    >
      {children}
    </code>
  );
}
