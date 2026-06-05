import { useEffect, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import { Sidebar } from '@/components/sidebar/Sidebar';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { SettingsDialog, type SettingsTab } from '@/components/settings/SettingsDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { LISTABLE_PROVIDERS_FRONTEND, useModels } from '@/hooks/useModels';
import { useCustomProvidersStore } from '@/stores/customProviders';
import { applyTheme, useSettingsStore } from '@/stores/settings';
import {
  ALL_PROVIDER_IDS,
  isCustomProviderId,
  resolveConfiguredModel,
} from '@/types/providers';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('apikey');
  const autoOpenedSettingsRef = useRef(false);
  const { settings, keys, configuredProviders } = useSettings();
  const { fetchProvider } = useModels();
  const conv = useConversations();
  const customProviders = useCustomProvidersStore((s) => s.providers);

  const defaultModel = settings.defaultModel;
  const setDefaultModel = settings.setDefaultModel;

  // 启动时:若默认 provider 未配置 Key,优先切到已配置 provider 的首个模型;
  // 完全没有 key 时才保持设置弹窗打开。
  useEffect(() => {
    const keyStatesReady = ALL_PROVIDER_IDS.every((provider) => !keys[provider].loading);
    if (!keyStatesReady) return;

    const enabledCustomProviders = customProviders.filter((provider) => provider.enabled);
    const defaultCustomConfigured =
      isCustomProviderId(defaultModel) &&
      enabledCustomProviders.some((provider) => provider.id === defaultModel);
    const resolvedModel = defaultCustomConfigured
      ? defaultModel
      : resolveConfiguredModel(defaultModel, configuredProviders) ??
        enabledCustomProviders[0]?.id ??
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
  }, [configuredProviders, customProviders, defaultModel, keys, setDefaultModel]);

  // v1.3:已配 provider 第一次就绪后,自动拉取它的动态模型列表。
  // useModels.fetchProvider 内部有 24h TTL 缓存,只在首次或 stale 时真发请求,
  // 不会重复打 provider 的 /v1/models。
  // 之前只在 ApiKeyTab 保存 key 时才拉 → 启动后主页面顶部模型下拉永远为空。
  // **跳过 minimaxi**:MiniMax 本轮走 Rust Anthropic 兼容桥接,
  // 启动阶段仍使用 MINIMAXI_MODELS 硬编码,不额外拉模型列表。
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    if (configuredProviders.size === 0) return;
    for (const p of configuredProviders) {
      if (!LISTABLE_PROVIDERS_FRONTEND.includes(p)) continue;
      void fetchProvider(p);
    }
    fetchedRef.current = true;
  }, [configuredProviders, fetchProvider]);

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
