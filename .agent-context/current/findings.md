# Findings — Claw v1 调研与发现

## Files Read

- 用户全局 `~/.claude/CLAUDE.md`：身份 + 全局代码 / 安全规范
- 用户全局 `~/.claude/rules/context7.md`：Context7 MCP 用法
- rrzuji_uni_app 项目 `.claude/CLAUDE.md`：参考项目结构、目录命名、Agent 协作约定
- rrzuji_uni_app `.claude/rules/git-commit.md`：Conventional Commits 模板

## Search Notes

### Tauri 2 + React 19 + Vite 6 兼容性

- 官方 `create-tauri-app` 模板支持 React 19 + Vite 6 组合。
- `vite.config.ts` 中需要：
  - `server.port: 1420` + `strictPort: true`（Tauri 固定）
  - `server.host` 跟随 `TAURI_DEV_HOST` 环境变量
  - `clearScreen: false` 避免 Tauri 日志被清
  - `optimizeDeps.exclude: ['@tauri-apps/api']`（避免 pre-bundle）

### Tailwind 4 + shadcn 主题

- 4.0.0 在 `@theme` 块有 `Cannot convert undefined or null to object` bug，**升到 4.3.0 修复**。
- 主题用 `oklch()` 函数色空间 + CSS 变量，shadcn 推荐锌调色板（zinc）。
- `@custom-variant dark (&:is(.dark *))` 启用 dark 模式。

### Anthropic SDK 浏览器 CORS

- `dangerouslyAllowBrowser: true` 是必要的。
- Anthropic 官方 API 端点支持 CORS，Tauri WebView 不会拦截。
- 流式响应：SDK `client.messages.stream()` 返回 AsyncIterable，内部已处理 SSE。

### Anthropic Tool Use 协议

- 工具定义：`{ name, description, input_schema: { type: 'object', properties, required } }`
- 请求：`messages.stream({ ..., tools })`
- 响应中可能含 `tool_use` block：`{ type: 'tool_use', id, name, input }`
- 工具结果作为新一轮 user 消息：`{ type: 'tool_result', tool_use_id, content, is_error }`
- 思考 block 字段：`{ type: 'thinking', thinking, signature }`（signature 必须有，发送时用空串占位）
- `message_delta.usage` 只有 `output_tokens`，`input_tokens` 在 `message_start.usage` 才有

### SQLite + sqlx

- `tauri-plugin-sql` 是 Tauri 官方插件，用 `features = ["sqlite"]` 启用。
- 迁移文件放 `src-tauri/src/db/migrations/`，启动时执行。
- 路径：`app_data_dir()/claw.db`。
- 用 WAL 模式提高并发。

### Keychain

- `keyring` crate 跨平台封装 OS Keychain。
- `Entry::new(SERVICE, ACCOUNT)` 拿句柄。
- `set_password` / `get_password` / `delete_credential`。
- macOS 第一次会弹授权对话框。

## Key Facts

- 模型 ID：`claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5-20251001`
- Anthropic 强制 `max_tokens > budget_tokens`（thinking 模式）
- Haiku 不支持 thinking，传了会报错
- React 19 仍兼容 ReactMarkdown 9.x

## Constraints

- React 19 + Vite 6 + Tailwind 4 + Tauri 2 全部要最新 minor
- `@radix-ui/*` 包版本要跟 React 19 兼容
- Anthropic SDK version 0.40+ 支持 `signal` 在 stream 中
- 不引入 `@rrzu/icons`（rrzuji 私有包），改用 `lucide-react`
- 必须用 `pnpm`（package.json 锁了）

## Risks

| 风险 | 状态 | 应对 |
| --- | --- | --- |
| Rust 后端未 `cargo check` | 已知 | 用户首次 `tauri dev` 时会跑，可能要下载依赖 |
| 没用 `dangerouslyAllowBrowser` 会被 SDK 拒绝 | 已加 | — |
| 工具调用死循环 | 已限制 MAX_TOOL_ROUNDS = 5 | — |
| 路径穿越攻击 | 已加 `safe_resolve` 白名单 | — |
| Tailwind 4 早期版本 bug | 已升 4.3.0 | — |
| Bundled 字体 70+ KaTeX 文件 | bundle 偏大 | v1.1 改 subset 或懒加载 |
| App icon 是 Python 占位 | 已知 | 正式发布前替换 |

## Rejected Options

| 方案 | 否决原因 |
| --- | --- |
| Electron | 用户选 Tauri 2 |
| Vue 3 前端 | 用户选 React 19 |
| Rust 端转发流（reqwest-eventsource） | 不必要，SDK 在 WebView 中能直连 |
| 把 API Key 存 IndexedDB | 不安全，必须 Keychain |
| tauri-plugin-stronghold | 复杂，keyring crate 已够用 |
| Tailwind 3 + shadcn 老配置 | 用户 / 项目都倾向新栈 |
| iOS / Android | v1 仅桌面 |
| MCP stdio transport | 复杂度高，v1.1 再做 |
| 上传到 npm 公开发布 | 个人使用，不做 |
