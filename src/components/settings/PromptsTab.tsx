/**
 * PromptsTab (v1.3 重构,从 SettingsDialog 拆出)
 * 转发 PromptsPanel(已在 prompts 目录)
 */

import { PromptsPanel } from '@/components/prompts/PromptsPanel';

export function PromptsTab() {
  return <PromptsPanel />;
}
