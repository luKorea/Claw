/**
 * AboutTab (v1.3 重构,从 SettingsDialog 拆出)
 */

const BRAND_ICON_SRC = '/brand/final/claw-ui-mark.svg';

export function AboutTab() {
  return (
    <div className="space-y-3 pt-2 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F4F8FF]">
          <img
            src={BRAND_ICON_SRC}
            alt="Claw"
            className="size-8"
            draggable={false}
          />
        </div>
        <div>
          <p>
            <strong>Claw</strong> v0.2.0
          </p>
          <p className="text-xs text-muted-foreground">多 Provider AI 桌面客户端</p>
        </div>
      </div>
      <p className="text-muted-foreground">
        支持 Anthropic / DeepSeek / OpenAI / MiniMax。
        本地存储所有数据,API Key 通过操作系统 Keychain 管理。
      </p>
      <p className="text-muted-foreground">
        使用 Tauri 2 + React 19 + TypeScript 构建。
      </p>
      <p className="text-muted-foreground">
        仓库:<a className="text-primary underline" href="https://github.com/luKorea/Claw">https://github.com/luKorea/Claw</a>
      </p>
    </div>
  );
}
