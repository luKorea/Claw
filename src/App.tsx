import { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import { Sidebar } from '@/components/sidebar/Sidebar';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { applyTheme, useSettingsStore } from '@/stores/settings';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, keys, configuredProviders } = useSettings();
  const conv = useConversations();

  // 应用主题
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // 启动时：若默认 provider 未配置 Key,自动打开设置
  useEffect(() => {
    const defaultProvider = settings.defaultModel
      ? (settings.defaultModel.startsWith('gpt-')
          ? 'openai'
          : settings.defaultModel.startsWith('deepseek-')
            ? 'deepseek'
            : 'anthropic')
      : 'anthropic';
    const defaultKey = keys[defaultProvider];
    if (defaultKey && !defaultKey.loading && !defaultKey.configured) {
      setSettingsOpen(true);
    }
  }, [keys, settings.defaultModel]);

  // 已配置过任一 provider,首次启动不再打扰
  useEffect(() => {
    if (configuredProviders.size > 0) {
      setSettingsOpen(false);
    }
  }, [configuredProviders.size]);

  // 全局快捷键
  useHotkeys(
    'mod+n',
    async (e) => {
      e.preventDefault();
      if (conv) await conv.createNew();
    },
    [conv],
  );

  useHotkeys(
    'mod+,',
    (e) => {
      e.preventDefault();
      setSettingsOpen(true);
    },
  );

  useHotkeys(
    'mod+shift+t',
    async (e) => {
      e.preventDefault();
      if (!conv.current) return;
      await conv.update({
        id: conv.current.id,
        thinking_enabled: !conv.current.thinking_enabled,
      });
    },
    [conv],
  );

  // 同步 store 主题
  useEffect(() => {
    return useSettingsStore.subscribe((s, prev) => {
      if (s.theme !== prev.theme) applyTheme(s.theme);
    });
  }, []);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={200}>
        <div className="flex h-full">
          <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
          <ChatLayout />
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
