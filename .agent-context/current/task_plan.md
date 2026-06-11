# Task Plan

## Goal

Implement the v0.1.2 usability fixes: unified Provider Key/model catalog state, custom API model discovery with multi-model selection, state-flow cleanup for model/thinking UI, and batch conversation deletion.

## Success Criteria

- Saving/removing a Provider Key updates the single shared model catalog seen by Settings and Sidebar.
- Custom Provider config can fetch models from the proxy endpoint and expose multiple selectable models.
- Current/default model selection and thinking budget UI reflect store/DB changes without stale local state.
- Conversation list supports selecting and deleting multiple conversations safely.
- Frontend/Rust tests and build checks pass; DeepSeek smoke remains available for final verification.

## Scope

- In scope: frontend stores/hooks/components, Rust commands for custom model list and batch delete, tests, context docs.
- Out of scope: MCP, cloud sync, i18n, rich tool-result visualizations, changing static Provider protocols/CSP/Keychain account names.

## Plan

- [x] Phase 1: Re-read current state, settings/model/sidebar/custom provider/conversation flows, and tests.
- [x] Phase 2: Implement unified Provider Key/model catalog flow.
- [x] Phase 3: Implement custom Provider model discovery + custom model ids.
- [x] Phase 4: Fix state-flow回显 and batch conversation delete.
- [x] Phase 5: Update tests and run validation.

## Decisions

- Preserve existing static Provider APIs and Keychain account naming.
- Use one custom Provider config to expose many model choices.
- Keep old custom Provider persisted data compatible by migrating `modelId` to `modelIds + selectedModelId`.
- Existing README/context closeout edits stay; this implementation adds on top of them.

## Open Questions

- None.

## Current Status

Implementation complete for the v0.1.2 P0/P1/P2 scope. README and prior closeout context changes remain preserved; this task adds the model sync/custom model discovery/batch delete implementation on top.

## Follow-up Fixes 2026-06-08

- [x] 优化用户消息气泡：用户昵称和消息内容分离，内容单独作为右侧气泡，避免“你”挤在气泡内部。
- [x] 修复自定义代理填 Key 后获取模型失败：OpenAI 兼容根 Base URL 自动优先尝试 `/v1/models`，保留 `/models` fallback；根 Base URL 的聊天接口也自动补 `/v1/chat/completions`。
- [x] 修复读取工具路径体验：支持 `~`、`$HOME`、精确 `/home` 映射到当前用户主目录；`read_file` 遇到目录时提示改用 `list_dir`。
- [x] 同步测试与验证：新增前端/Rust 单测覆盖上述行为，最终 typecheck/lint/test/build 均通过。

## Follow-up Fixes 2026-06-09

- [x] 对齐 CCSwitch 模型获取方式：OpenAI-compatible 自动获取模型使用 `/v1/models`，请求使用 `Authorization: Bearer <key>`。
- [x] 增强自定义代理鉴权兼容：OpenAI-compatible 请求同时发送 `Authorization`、`api-key`、`x-api-key`，并兼容用户粘贴 `Bearer xxx` / quoted key。
- [x] 修正编辑已有自定义 Provider 的 Key 流：获取模型优先使用输入框新 Key，获取成功后写入 Keychain，避免继续使用旧错误 Key。
- [x] 优化 401 错误展示：隐藏上游 JSON 噪音，显示明确的鉴权失败提示。

## Follow-up Fixes 2026-06-09 macOS Keychain Prompts

- [x] 新增 SQLite `api_key_metadata` 表，只保存 Provider Key 的配置状态、脱敏预览、metadataKnown 和更新时间，不保存明文。
- [x] `get_api_key_status` / `list_configured_providers` 改为只读元数据，不再触发 Keychain 明文读取。
- [x] 新增 `sync_api_key_status(provider)`，仅在用户点击“检测已有 Key”时读取一次 Keychain 并回写元数据。
- [x] `set_api_key` / `delete_api_key` 自动维护元数据，并继续维护 Rust 进程内明文缓存。
- [x] 设置页内置 Provider 和自定义 Provider 均显示“未检测本机 Key”，并提供“检测已有 Key”按钮。
- [x] App 启动不再自动调用动态模型拉取，避免启动阶段通过 `get_api_key` 读取 Keychain。
- [x] 同步 README / AGENTS command 表，并补充前端 + Rust 测试。

## Follow-up Fixes 2026-06-09 SQLite Key / Custom Provider Config

- [x] 按用户确认的“全部配置文件”方案，将日常 API Key 主源切到 SQLite `api_keys`，`get_api_key` / `set_api_key` / `delete_api_key` / `list_configured_providers` 不再读写 Keychain。
- [x] 保留 `sync_api_key_status(provider)` 作为“导入旧 Key”入口，仅用户点击时读取一次旧 Keychain 并写入 SQLite。
- [x] 新增 SQLite `custom_providers` 表和 `list/create/update/delete_custom_provider` commands，自定义 Provider 配置从 localStorage 主源迁到 SQLite。
- [x] 前端 `customProviders` store 改为 SQLite hydrate + async CRUD，并保留旧 `claw.custom-providers.v1` 一次性迁移。
- [x] 增强 OpenAI-compatible 模型获取路径：根域名 `/v1/models` + `/models` fallback，已含 `/v1` 拼 `/models`，误填 `/chat/completions` 回退同级 `/models`，直接 `/models` 原样请求。
- [x] 模型列表解析兼容 `{ data: [{ id }] }`、`{ models: [...] }` 和顶层数组；错误展示标明使用“输入框 Key / 配置文件 Key”且不泄漏 Key。
- [x] `pnpm test:real-providers` smoke 改为优先 env / SQLite `claw.db`，旧 Keychain 读取需显式 `CLAW_SMOKE_USE_KEYCHAIN=1`。

## Follow-up Fixes 2026-06-09 Custom Provider Chat

- [x] 自定义 Provider 增加 `auto` / `stream` / `non-stream` 聊天模式，旧 SQLite 配置启动时迁移为 `auto`。
- [x] 统一 OpenAI / Anthropic chat endpoint 解析，兼容根域名、`/v1` 和完整 endpoint。
- [x] OpenAI-compatible 流式解析继续兼容 Anthropic-style SSE；`auto` 模式在无正文、空响应或超时时回退非流式。
- [x] 新增 OpenAI / Anthropic-like 非流式响应解析和 `test_custom_provider_chat` 诊断命令。
- [x] 设置页增加聊天模式和“测试聊天”；thinking-only 回复显示明确提示并展开思考过程。
- [x] adapter error event 会结束 assistant streaming，避免消息永久停留在生成中。
- [x] 使用本机已保存配置真实验证：OpenAI-compatible `qwen3-max` 返回 HTTP 200 / `OK`；错误的 Anthropic 协议返回 401，无效模型路由返回 502。

## Follow-up Fixes 2026-06-09 Model Picker / Protocol Fallback

- [x] 修复侧边栏“当前模型”弹层只显示部分模型：使用确定高度的可滚动列表，并保留搜索。
- [x] 自定义 Provider `auto` 模式在配置协议失败时，使用对应请求体自动回退另一兼容协议。
- [x] “测试聊天”与正式聊天共享协议回退语义，并显示最终命中的协议。
- [x] 补齐前端 / Rust 测试并运行完整验证。

## Follow-up 2026-06-11 Git Hook Release Automation

- [x] 将 `package.json.version` 固定为唯一版本主源，`src-tauri/tauri.conf.json.version` 改为读取 `../package.json`。
- [x] 新增可提交的 `.githooks/pre-push`，普通 push 默认放行，交互式选择发版时创建版本提交和 Release tag。
- [x] 新增 `scripts/install-git-hooks.sh` 和 `pnpm hooks:install`，通过 Git 原生 `core.hooksPath=.githooks` 启用团队共享 hook。
- [x] 新增 `scripts/sync-release-version.mjs`，发版 tag 输入 `vX.Y.Z` 时同步 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`。
- [x] 非交互 / `CLAW_RELEASE_SKIP=1` / 非 `origin` remote 自动跳过，CI 和紧急 push 不受影响。
