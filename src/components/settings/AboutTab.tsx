/**
 * AboutTab (v1.3 重构,从 SettingsDialog 拆出)
 */

export function AboutTab() {
  return (
    <div className="space-y-3 pt-2 text-sm">
      <p>
        <strong>Claw</strong> v0.2.0 — 多 Provider AI 桌面客户端
      </p>
      <p className="text-muted-foreground">
        支持 Anthropic / DeepSeek / OpenAI / MiniMax。
        本地存储所有数据,API Key 通过操作系统 Keychain 管理。
      </p>
      <p className="text-muted-foreground">
        使用 Tauri 2 + React 19 + TypeScript 构建。
      </p>
      <p className="text-muted-foreground">
        仓库:<a className="text-primary underline" href="#">github.com/yourname/claw-client</a>
      </p>
    </div>
  );
}
