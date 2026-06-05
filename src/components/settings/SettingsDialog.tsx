/**
 * SettingsDialog (v1.3 重构)
 *
 * 纯框架:Dialog + Tabs + 5 个 tab 组件(各自独立文件)。
 * 业务逻辑见 ApiKeyTab / DefaultTab / AboutTab / PromptsTab / ToolsTab。
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ApiKeyTab } from '@/components/settings/ApiKeyTab';
import { DefaultTab } from '@/components/settings/DefaultTab';
import { CustomProvidersTab } from '@/components/settings/CustomProvidersTab';
import { AboutTab } from '@/components/settings/AboutTab';
import { PromptsTab } from '@/components/settings/PromptsTab';
import { ToolsTab } from '@/components/settings/ToolsTab';

export type SettingsTab = 'apikey' | 'models' | 'prompts' | 'tools' | 'about';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: SettingsTab;
  onActiveTabChange: (tab: SettingsTab) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  activeTab,
  onActiveTabChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            Claw 把你的 API Key 写入操作系统的 Keychain,不会上传任何服务端。
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(value) => onActiveTabChange(value as SettingsTab)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="apikey" className="flex-1">
              API Key
            </TabsTrigger>
            <TabsTrigger value="models" className="flex-1">
              模型
            </TabsTrigger>
            <TabsTrigger value="prompts" className="flex-1">
              提示词
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex-1">
              工具
            </TabsTrigger>
            <TabsTrigger value="about" className="flex-1">
              关于
            </TabsTrigger>
          </TabsList>
          <TabsContent value="apikey" className="-mx-6 -mb-6 max-h-[60vh] overflow-y-auto px-6 pb-6 pt-2">
            <ApiKeyTab />
          </TabsContent>
          <TabsContent value="models" className="-mx-6 -mb-6 max-h-[60vh] overflow-y-auto px-6 pb-6 pt-2">
            <DefaultTab />
            <div className="my-5 h-px bg-border" />
            <CustomProvidersTab />
          </TabsContent>
          <TabsContent value="prompts" className="-mx-6 -mb-6 h-[420px] pt-2">
            <PromptsTab />
          </TabsContent>
          <TabsContent value="tools" className="pt-2">
            <ToolsTab />
          </TabsContent>
          <TabsContent value="about" className="pt-2">
            <AboutTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
