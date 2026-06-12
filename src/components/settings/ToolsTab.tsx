/**
 * ToolsTab (v1.3 重构,从 SettingsDialog 拆出)
 * 转发 ToolsSection
 */

import { ToolsSection } from '@/components/settings/ToolsSection';
import { McpServersTab } from '@/components/settings/McpServersTab';
import { Separator } from '@/components/ui/separator';

export function ToolsTab() {
  return (
    <div className="space-y-5">
      <ToolsSection />
      <Separator />
      <McpServersTab />
    </div>
  );
}
