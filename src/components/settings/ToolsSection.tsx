import { useToolsStore } from '@/stores/tools';
import { BUILTIN_TOOLS } from '@/lib/tools/builtin';

import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export function ToolsSection() {
  const disabled = useToolsStore((s) => s.disabled);
  const setDisabled = useToolsStore((s) => s.setDisabled);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">内置工具</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          这些工具让 Claude 能读取 / 写入你本机的文件。关闭后模型将不可调用。
        </p>
      </div>

      <div className="space-y-2">
        {BUILTIN_TOOLS.map((tool) => {
          const isEnabled = !disabled.includes(tool.name);
          return (
            <Card key={tool.name} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{tool.name}</span>
                  {tool.name === 'write_file' && (
                    <Badge variant="destructive" className="text-[10px]">
                      危险
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs text-muted-foreground">
                  {isEnabled ? '启用' : '禁用'}
                </Label>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(v) => setDisabled(tool.name, !v)}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        提示：所有文件操作限制在 HOME、桌面、文档、下载、临时目录内。
      </p>
    </div>
  );
}
