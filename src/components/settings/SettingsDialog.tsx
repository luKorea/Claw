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
import { AboutTab } from '@/components/settings/AboutTab';
import { PromptsTab } from '@/components/settings/PromptsTab';
import { ToolsTab } from '@/components/settings/ToolsTab';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            Claw 把你的 API Key 写入操作系统的 Keychain,不会上传任何服务端。
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="apikey">
          <TabsList className="w-full">
            <TabsTrigger value="apikey" className="flex-1">
              API Key
            </TabsTrigger>
            <TabsTrigger value="default" className="flex-1">
              默认参数
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
          <TabsContent value="default" className="pt-2">
            <DefaultTab />
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
