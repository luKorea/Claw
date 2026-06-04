import { useEffect, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import { Sidebar } from '@/components/sidebar/Sidebar';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { LISTABLE_PROVIDERS_FRONTEND, useModels } from '@/hooks/useModels';
import { applyTheme, useSettingsStore } from '@/stores/settings';
import { getProviderOfModel } from '@/types/providers';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, keys, configuredProviders } = useSettings();
  const { fetchProvider } = useModels();
  const conv = useConversations();

  // 启动时:若默认 provider 未配置 Key,自动打开设置
  useEffect(() => {
    // v1.3:用 getProviderOfModel 替代 startsWith 链式推断
    const defaultProvider = getProviderOfModel(settings.defaultModel) ?? 'anthropic';
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

  // v1.3:已配 provider 第一次就绪后,自动拉取它的动态模型列表。
  // useModels.fetchProvider 内部有 24h TTL 缓存,只在首次或 stale 时真发请求,
  // 不会重复打 provider 的 /v1/models。
  // 之前只在 ApiKeyTab 保存 key 时才拉 → 启动后主页面顶部模型下拉永远为空。
  // **跳过 minimaxi**:走 Anthropic 兼容协议,没有 /v1/models,拉也是 401。
  // 它的模型列表走 MINIMAXI_MODELS 硬编码。
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

  // v1.3:删 L19-21 重复的 useEffect 主题同步,只保留 subscribe
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
