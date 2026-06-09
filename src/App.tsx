import { useEffect, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import { Sidebar } from '@/components/sidebar/Sidebar';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { SettingsDialog, type SettingsTab } from '@/components/settings/SettingsDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import {
  getFirstEnabledCustomModel,
  resolveCustomModelSelection,
  useCustomProvidersStore,
} from '@/stores/customProviders';
import { applyTheme, useSettingsStore } from '@/stores/settings';
import {
  ALL_PROVIDER_IDS,
  resolveConfiguredModel,
} from '@/types/providers';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('apikey');
  const autoOpenedSettingsRef = useRef(false);
  const { settings, keys, configuredProviders } = useSettings();
  const conv = useConversations();
  const customProviders = useCustomProvidersStore((s) => s.providers);
  const customProvidersHydrated = useCustomProvidersStore((s) => s.hydrated);
  const hydrateCustomProviders = useCustomProvidersStore((s) => s.hydrate);

  const defaultModel = settings.defaultModel;
  const setDefaultModel = settings.setDefaultModel;

  useEffect(() => {
    if (!customProvidersHydrated) void hydrateCustomProviders();
  }, [customProvidersHydrated, hydrateCustomProviders]);

  // 启动时:若默认 provider 未配置 Key,优先切到已配置 provider 的首个模型;
  // 完全没有 key 时才保持设置弹窗打开。
  useEffect(() => {
    const keyStatesReady = ALL_PROVIDER_IDS.every((provider) => !keys[provider].loading);
    if (!keyStatesReady || !customProvidersHydrated) return;

    const defaultCustomModel = resolveCustomModelSelection(defaultModel);
    const resolvedModel =
      defaultCustomModel?.modelId ??
      resolveConfiguredModel(defaultModel, configuredProviders) ??
      getFirstEnabledCustomModel()?.modelId ??
      null;
    if (resolvedModel && resolvedModel !== defaultModel) {
      setDefaultModel(resolvedModel);
      return;
    }

    if (!resolvedModel) {
      autoOpenedSettingsRef.current = true;
      setSettingsTab('apikey');
      setSettingsOpen(true);
      return;
    }

    if (autoOpenedSettingsRef.current) {
      autoOpenedSettingsRef.current = false;
      setSettingsOpen(false);
    }
  }, [
    configuredProviders,
    customProviders,
    customProvidersHydrated,
    defaultModel,
    keys,
    setDefaultModel,
  ]);

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
      setSettingsTab('apikey');
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

  // 首次启动先应用当前主题,再订阅后续变化;避免旧 .dark class 残留到下一次切换。
  useEffect(() => {
    applyTheme(useSettingsStore.getState().theme);
    return useSettingsStore.subscribe((s, prev) => {
      if (s.theme !== prev.theme) applyTheme(s.theme);
    });
  }, []);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={200}>
        <div className="flex h-full">
          <Sidebar
            onOpenSettings={(tab) => {
              if (tab) setSettingsTab(tab);
              setSettingsOpen(true);
            }}
          />
          <ChatLayout />
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            activeTab={settingsTab}
            onActiveTabChange={setSettingsTab}
          />
        </div>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
