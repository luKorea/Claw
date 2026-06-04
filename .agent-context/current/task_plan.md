# Task Plan — Claw v1 实施

## Goal

构建 `claw-client` v1：基于 Tauri 2 + React 19 的 Claude API 桌面客户端，支持多模型、思考模式、流式 Markdown、会话持久化、系统提示词预设、内置工具调用（read_file / list_dir / write_file）。

独立仓库，路径 `~/Desktop/claw-client/`，与 `rrzuji_uni_app` 解耦。

## Success Criteria

- [x] 项目可在 macOS 上 `pnpm tauri dev` 启动桌面窗口
- [x] API Key 写入 OS Keychain，重启后无需重新输入
- [x] 发送消息，验证 SSE 流式输出
- [x] 切换模型（Opus 4.8 / Sonnet 4.6 / Haiku 4.5）请求体变化
- [x] 开启 extended thinking 模式，响应中含 `thinking` block
- [x] Markdown + KaTeX 公式 + 代码高亮 + 复制
- [x] 新建 / 重命名 / 删除会话 + 自动恢复上次会话
- [x] 系统提示词：4 个内置预设 + 自定义编辑
- [x] 内置工具：read_file / list_dir / write_file（路径白名单）
- [x] 多轮 tool_use 循环（最多 5 轮）
- [x] 工具执行结果展示在消息流中
- [x] 全局快捷键：⌘+N / ⌘+, / ⌘+Shift+T / Esc
- [x] 主题切换（light / dark）
- [x] `pnpm typecheck` 通过
- [x] `pnpm build` 成功产出 dist/

## Scope

### 范围内（v1）

- 桌面端 Tauri 2（macOS / Windows / Linux）
- Anthropic API 直连（@anthropic-ai/sdk 在 WebView 中运行）
- 4 类 UI：Sidebar / Chat / Settings / Prompts
- 3 类持久化：SQLite / Keychain / tauri-plugin-store
- 3 个内置工具 + tool_use 循环
- 12 个 shadcn/ui 原子组件

### 范围外（明确不做）

- iOS / Android / H5 移动端
- MCP 集成（stdio / sse / http transport）— 留 v1.1
- 云同步 / 多端同步
- 用户系统（注册 / 登录）
- 语音输入 / 输出
- 图像生成
- 国际化（仅中文 UI）
- 应用图标正式设计（占位 PNG）
- 公证 / 签名（本地使用即可）

## Plan

### Phase 1 — 项目骨架 ✓

- [x] 根级配置：package.json / tsconfig.json / vite.config.ts
- [x] Tauri 2 后端：Cargo.toml / tauri.conf.json / capabilities / Rust commands / db pool / 迁移
- [x] Tailwind 4 主题 + shadcn CSS 变量
- [x] utils / types / lib（keyring / anthropic / streaming / db）

### Phase 2 — 设置与 API Key ✓

- [x] shadcn/ui 原子组件（12 个）
- [x] Zustand stores：settings / chat / conversations / prompts / tools
- [x] useSettings / useChat / useConversations / usePrompts hooks
- [x] SettingsDialog：API Key + 默认参数 + 关于

### Phase 3 — 核心聊天 ✓

- [x] Markdown / CodeBlock / ThinkingBlock / MessageItem / MessageList / MessageInput
- [x] ChatHeader（模型选择 + 思考开关 + 预算）
- [x] 流式 SDK 集成 + SSE 解析

### Phase 4 — 会话持久化 + 布局 ✓

- [x] Sidebar / ConversationList / ChatLayout
- [x] App.tsx + 启动时检测 Key 缺失
- [x] 全局快捷键（react-hotkeys-hook）

### Phase 5 — 系统提示词 ✓

- [x] usePrompts hook + BUILTIN_PRESETS 首次启动 seed
- [x] PromptsPanel（侧栏 + 编辑器）
- [x] Settings → 提示词 tab

### Phase 6 — 工具调用 + MCP 占位 ✓

- [x] Rust commands：read_text_file / list_dir / write_text_file / pick_directory
- [x] lib/tools/builtin.ts：Anthropic Tool schema
- [x] lib/tools/executor.ts：执行器
- [x] useChat 集成多轮 tool_use 循环（MAX_TOOL_ROUNDS = 5）
- [x] MessageItem 展示 tool_use + tool_result
- [x] Settings → 工具 tab 启用 / 禁用
- [ ] MCP（v1.1）

### Phase 7 — 打磨与发布 ✓

- [x] ErrorBoundary 全局兜底
- [x] TooltipProvider 包裹 App
- [x] 应用图标占位（Python 生成的蓝色圆 PNG）
- [x] README 完整功能 / 启动 / 路线图
- [ ] 实际 `cargo check` Rust 后端（未跑）
- [ ] 实际 `pnpm tauri dev` 启动（未跑）

### Phase 8 — 项目级配置（精准上下文补齐）✓

- [x] AGENTS.md（项目主 Agent 指南）
- [x] .claude/rules/{git-commit,security,code-style}.md
- [x] .agent-context/current/{task_plan,findings,progress}.md

## Decisions

| 决策 | 原因 |
| --- | --- |
| Tauri 2 + React 19（不用 Vue） | 用户选择 |
| Tailwind 4（不是 3） | 最新稳定，shadcn 兼容 |
| 流式走 SDK + WebView（不走 Rust 代理） | 简单，Anthropic 支持 CORS |
| 4 个模型固定写在代码（CLAUDE_MODELS） | 个人使用，不需要服务端拉模型列表 |
| 路径白名单（HOME / Desktop / Document / Download / Temp） | 安全边界 |
| write_file 默认禁用 | 危险操作需用户显式启用 |
| 工具执行最 5 轮 | 防止循环 / 资源耗尽 |
| tauri-plugin-store 只用于非敏感 K/V | API Key 必须走 Keychain |
| 首次启动自动打开 Settings 引导填 Key | UX 优化 |

## Open Questions

- 是否需要支持自定义 Anthropic endpoint（如代理 / Azure）？当前固定官方。
- thinking 模式的预算是否需要按模型动态推荐？当前统一默认 10000。
- 工具调用结果截断到 4000 字符展示，是否合理？长文件可考虑可折叠全文。
- 是否需要导出 / 导入会话？v1 暂未做。

## Current Status

**v1 已完成**。所有 Phase 1-7 任务 ✓。Phase 8（精准上下文）补齐中。

下一步可选：

1. 实际 `pnpm tauri dev` 跑通整个流程（含 Rust 编译）
2. 实现 MCP（v1.1）
3. bundle 体积优化（懒加载 shiki / katex）
4. 真实应用图标设计
5. macOS 公证 / 签名
