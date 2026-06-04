import { SparklesIcon } from 'lucide-react';

import type { PromptPreset } from '@/lib/prompts';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  presets: PromptPreset[];
  disabled?: boolean;
  onApply: (presetId: string) => void;
}

/**
 * v1.3:从 MessageInput 抽出的 [预设] 下拉。
 *
 * 只负责"展示 + 选择",不负责"拿到 prompts / 写 system_prompt";
 * 由 MessageInput 通过 props 注入,保持组件纯净。
 */
export function PresetDropdown({ presets, disabled, onApply }: Props) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label="应用提示词预设"
              disabled={disabled}
            >
              <SparklesIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>应用提示词预设</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64 max-h-80">
        <DropdownMenuLabel>提示词预设</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {presets.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            暂无预设,在「设置 → 提示词」中新建
          </div>
        )}
        {presets.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => onApply(p.id)}
            className="flex flex-col items-start gap-0.5"
          >
            <div className="flex w-full items-center gap-2">
              <span className="truncate text-sm">{p.name}</span>
              {p.builtin === 1 && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  内置
                </span>
              )}
            </div>
            {p.content && (
              <span className="line-clamp-2 text-xs text-muted-foreground">{p.content}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
