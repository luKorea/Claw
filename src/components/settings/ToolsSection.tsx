import { useToolsStore } from '@/stores/tools';
import { useToolEnabled } from '@/hooks/useToolEnabled';
import { BUILTIN_TOOLS } from '@/lib/tools/builtin';
import { cn } from '@/lib/utils';

import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

function ToolRow({ name, description }: { name: string; description: string }) {
  // v1.3:细粒度 selector,只在该 tool 启用状态变化时重渲
  const isEnabled = useToolEnabled(name);
  const setDisabled = useToolsStore((s) => s.setDisabled);
  const isDangerous = name === 'write_file';

  return (
    <Card
      className={cn(
        'flex items-start gap-3 p-3',
        isDangerous && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{name}</span>
          {isDangerous && (
            <Badge variant="destructive" className="text-[10px]">
              危险
            </Badge>
          )}
        </div>
        <p className={cn('text-xs text-muted-foreground', isDangerous && 'text-destructive')}>
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Label className="text-xs text-muted-foreground">
          {isEnabled ? '启用' : '禁用'}
        </Label>
        <Switch
          checked={isEnabled}
          onCheckedChange={(v) => setDisabled(name, !v)}
        />
      </div>
    </Card>
  );
}

export function ToolsSection() {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">内置工具</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          这些工具让模型能读取 / 写入你本机的文件。关闭后模型将不可调用。
        </p>
      </div>

      <div className="space-y-2">
        {BUILTIN_TOOLS.map((tool) => (
          <ToolRow key={tool.name} name={tool.name} description={tool.description} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        提示：所有文件操作限制在 HOME、桌面、文档、下载、临时目录内。
      </p>
    </div>
  );
}
