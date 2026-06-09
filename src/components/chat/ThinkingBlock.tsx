import { useEffect, useState } from 'react';
import { BrainIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  /** 是否还在流式输出 */
  streaming?: boolean;
  defaultOpen?: boolean;
}

export function ThinkingBlock({ text, streaming, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <div
      className={cn(
        'my-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground',
        'overflow-hidden text-sm',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-full justify-start gap-1.5 rounded-none px-2 text-xs font-normal"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
        <BrainIcon className="size-3" />
        <span>思考过程</span>
        {streaming && !text && (
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        )}
      </Button>
      {open && (
        <div className="border-t border-dashed border-muted-foreground/20 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">
          {text || (streaming ? '思考中…' : '')}
        </div>
      )}
    </div>
  );
}
