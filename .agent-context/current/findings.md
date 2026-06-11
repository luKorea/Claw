# Findings

## Files Read

- AGENTS instructions embedded by user.
- react-expert skill.
- precise-context skill.
- Previous diagnosis covered App, useChat, provider registry, settings, tools, DB, Rust commands, README, and package/Tauri metadata.
- Closeout pass re-read README, task_plan.md, progress.md, MEMORY.md release notes, and git status.
- Follow-up fix pass read `MessageItem`, custom Provider Rust command, builtin tool schema, tool executor/search results, and Rust tool path resolver.
- 2026-06-09 follow-up used Context7 for CCSwitch docs, then re-read `CustomProvidersTab`, custom Provider Rust command, Keychain wrapper/tests, and settings command key validation.
- 2026-06-09 macOS Keychain prompt follow-up re-read `settings.rs`, DB migration, `providerKeys`, `ApiKeyTab`, `CustomProvidersTab`, `App`, keyring wrappers/tests, and current context files.

## Search Notes

- Searched DEFAULT_MODEL_ID, configuredProviders, ProviderKeyCard, toolResultsBuffer, safe_resolve_with, write_file, and Claude API wording.
- Searched README and source for MCP, custom Provider, real Provider smoke, multi-round tool use, and roadmap drift.
- Context7 query for CCSwitch found that its auto-fetch models flow calls the OpenAI-compatible `/v1/models` endpoint after Endpoint URL and API Key are filled.

## Key Facts

- v0.1.2 P0 root cause was shared state fragmentation: Settings, Sidebar, and DefaultTab had separate key/model derivations. The fix adds `useProviderKeysStore`, `useAvailableModels`, and `useModelSelection` so UI consumers see one model catalog.
- Static Provider dynamic models now remain in `useModelsStore`, but are only exposed when the global Provider Key state says that provider is configured. Saving a DeepSeek/OpenAI Key force-refreshes `/models`; deleting a Key resets that provider's cached dynamic models.
- Custom Provider storage now uses `modelIds` plus `selectedModelId`; legacy `modelId` persisted entries migrate into a one-item `modelIds` list.
- Custom model conversation references use `custom-model:<providerSuffix>:<encodedModelId>`, while runtime requests resolve this back to the custom provider id plus raw model id.
- `list_custom_provider_models` is a read-only Rust command that validates the custom base URL, calls OpenAI-compatible `/models` or Anthropic-compatible `/v1/models`, parses common `{ data: [{ id }] }` responses, and sanitizes errors against the supplied key.
- Batch conversation deletion is implemented as `delete_conversations(ids)` on Rust plus `conversationApi.removeMany`, `useConversations().removeMany`, and sidebar selection UI. The UI disables selection/delete while streaming.
- `ChatHeader` now synchronizes its thinking budget local input when the current conversation/default budget changes.
- DEFAULT_MODEL_ID is MiniMax-M2.7.
- App startup now resolves the default model against configured Providers; if none are configured it auto-opens Settings.
- Auto-opened Settings closes only after a valid configured default model exists; manually opened Settings is not force-closed.
- MiniMax key copy uses sk-cp/sk wording and MiniMax is skipped for frontend /v1/models refresh.
- Tool results remain in assistant UI content for display, but provider message conversion splits them into role=tool messages for protocol input.
- Anthropic adapter merges role=tool messages into user tool_result turns and preserves is_error.
- write_text_file uses a separate write resolver: existing files canonicalize the target, new files validate the nearest existing parent under allowed roots.
- tools store defaults write_file to disabled and migrates old persisted state to include that default.
- macOS password prompts were caused by repeated Keychain reads: multiple useSettings instances call get_api_key_status for all Providers, startup model refresh calls get_api_key again, and each send also called list_configured_providers + get_api_key.
- keyring::Entry::get_password is the prompt-triggering call on macOS, so status checks are not free when they read the secret to build a preview.
- A Rust process-memory cache can remove duplicate prompts within the same app launch while keeping plaintext out of frontend state and persistent storage.
- The durable fix is metadata-first status: `api_key_metadata` stores only provider, configured flag, preview, metadata_known, and updated_at; no plaintext API Key is written to SQLite/localStorage/frontend state.
- `get_api_key_status` and `list_configured_providers` now read only SQLite metadata. `sync_api_key_status` is the explicit migration path that reads Keychain once when the user clicks “检测已有 Key”.
- App startup no longer auto-fetches DeepSeek/OpenAI model lists, because that path calls `get_api_key`; model fetching remains available after saving a Key or via manual retry/fetch actions.
- Custom Provider cards no longer read Keychain on mount. If metadata is unknown and the user has not typed a fresh Key, model fetch prompts the user to enter a Key or detect the existing one instead of calling `get_api_key`.
- A Rust CLI bin is required for real Provider smoke because shell `security find-generic-password` did not reliably find the same entries as the app-compatible `keyring` crate path.
- Current live real-provider smoke is blocked before network: neither env vars nor OS Keychain expose configured Provider keys for `com.claw.client / api-key:{provider}`.
- Adding an extra Cargo bin requires `default-run = "claw-client"`; otherwise `tauri dev` fails because cargo cannot infer which binary to run.
- README had roadmap drift: multi-round tool calling, MiniMax Rust bridge, custom Provider, and GitHub Releases are implemented but were not all reflected as completed capabilities.
- Custom Provider already supports OpenAI-compatible and Anthropic-compatible streaming via Tauri Rust bridge, with HTTPS or local localhost HTTP base URL validation.
- MCP is the natural next major feature: the DB migration already has `mcp_servers`, and `ToolDefinition.source` already allows `mcp`, but runtime MCP server CRUD/discovery/execution is not implemented yet.
- Basic tool result rendering exists as collapsible JSON in chat; rich image/table tool result visualization remains future work.
- 用户消息气泡问题来自 label 与内容共用同一层气泡样式；将 label 放在外层、内容放入独立右侧 bubble 后视觉更清晰。
- 自定义代理模型获取失败的关键表现是根 Base URL（例如 `https://llm.rrzu.com`）下只请求 `{base}/models`，而 One API/OpenAI-compatible 网关通常暴露在 `{base}/v1/models`。修复后根路径优先尝试 `/v1/models`，失败再 fallback `/models`。
- 自定义代理聊天发送也要与模型发现一致：OpenAI-compatible 根 Base URL 发送到 `/v1/chat/completions`；已有路径如 `/v1` 则继续拼 `/chat/completions`。
- 读取工具失败的关键表现是模型传入 `/home`；macOS canonicalize 后会指向 `/System/Volumes/Data/home`，不在工具白名单内。该路径不应加入白名单，应作为当前用户 home 别名展开。
- `read_file` 只适合文本文件；传目录时后端现在明确提示改用 `list_dir`，前端工具 schema 也提示模型不要把目录传给 `read_file`。
- CCSwitch docs confirm the fetch-models path is OpenAI-compatible `/v1/models`; the remaining failure screenshot showed `/v1/models` was already reached but returned 401, so the next likely issue was auth header / stale Keychain value rather than path.
- Custom OpenAI-compatible model fetch now sends the CCSwitch-style `Authorization: Bearer <key>` plus `api-key` and `x-api-key` aliases for One API / internal gateways that inspect alternate API-Key headers.
- Custom OpenAI-compatible key input is normalized at request time: `Bearer sk-...`, `Authorization: Bearer sk-...`, and quoted keys are reduced to the raw key before headers are built.
- Existing custom Provider edit flow now uses the API Key input value first. If that typed key successfully fetches models, it is saved to SQLite config; this prevents a bad previously-saved key preview such as `...r"}}` from being reused.
- Custom model fetch 401 errors are collapsed to a user-facing authentication failure instead of showing raw upstream JSON.
- 2026-06-09 follow-up decision changed the security/usability tradeoff: API Keys are now stored in local SQLite `api_keys` instead of Keychain for normal app use. Old Keychain is only an explicit import source via `sync_api_key_status`.
- Custom Provider config is now SQLite-backed via `custom_providers`; localStorage `claw.custom-providers.v1` remains only as a one-time migration source so historical custom model ids can keep their provider id suffix.
- Custom Provider model discovery now handles root Base URLs, `/v1`, direct `/models`, and accidentally pasted `/chat/completions` URLs; parser accepts OpenAI `data[].id`, proxy `models[]`, and top-level arrays.
- Real Provider smoke now checks env vars and local `claw.db` first. Legacy Keychain lookup is opt-in with `CLAW_SMOKE_USE_KEYCHAIN=1`, preventing smoke runs from reintroducing macOS password prompts.
- Custom Provider chat now persists `streamMode`; existing databases receive `stream_mode TEXT NOT NULL DEFAULT 'auto'` during startup.
- OpenAI-compatible chat endpoint normalization maps a root URL to `/v1/chat/completions`, preserves `/v1/chat/completions`, and maps `/v1` to `/v1/chat/completions`. Anthropic-compatible follows the equivalent `/v1/messages` rules.
- `auto` mode withholds the final done event until the stream is judged usable. If the stream ends with only thinking, is empty, or times out before visible output, it retries once with `stream:false`.
- Non-stream parsing supports OpenAI `choices[].message` and Anthropic-like `content[]`, including reasoning/thinking, tool calls, usage, and stop reasons.
- The local rrzu custom Provider was configured as Anthropic-compatible, but real requests showed `/v1/messages` returns 401. The OpenAI-compatible endpoint authenticates correctly.
- The selected `gemini-2.0-flash` route returned HTTP 502 `unknown provider for model`; `qwen3-max` returned HTTP 200 with assistant content `OK`. Model-list presence alone does not guarantee an upstream route is healthy, so the settings “测试聊天” action is required.
- 侧边栏模型弹层使用 Radix `ScrollArea` + `max-h-72`。Viewport 依赖父级确定高度，当前组合会让 Root 截断内容但不形成可靠滚动区，因此模型多时只显示前半段；设置页的普通 Select 则能看到完整列表。
- 本机 `claw.db` 当前自定义 Provider 仍保存为 `anthropic-compatible`、默认模型 `gemini-2.0-flash`。2026-06-09 再次使用已保存 Key 脱敏实测：Anthropic `/v1/messages` 为 401，OpenAI `/v1/chat/completions` + `qwen3-max` 为 200 / `OK`。
- 模型发现端点无法可靠判断聊天协议：很多 OpenAI 网关的 `/v1/models` 同时接受多种鉴权头，所以“能获取模型”不代表保存的 Anthropic 聊天协议可用。`auto` 聊天模式需要承担协议级 fallback，而不仅是 stream/non-stream fallback。
- 2026-06-11 发版 hook 方案已落地：`package.json.version` 是唯一版本主源，Tauri `version` 支持配置为 `../package.json`，实际打包版本由 Tauri 从 package 文件读取。
- Git `pre-push` 无法把 hook 执行期间新建的版本提交自动加入当前原始 push；本地实验证明原始 push 仍会推送 hook 触发前解析到的旧 SHA。因此 hook 在用户选择发版后创建版本提交和 tag，再启动后台任务等待原始 push 结束后补推版本提交与 tag。
- 发版 hook 只在交互式 `origin` push 中询问；`CLAW_RELEASE_SKIP=1`、非交互环境、非 origin remote 都直接跳过。
- `scripts/sync-release-version.mjs` 专门同步 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock`，且已修复“目标版本已相同时误判未找到版本字段”的幂等边界。

## Constraints

- TypeScript strict, no bare any.
- Business code changes require tests.
- Do not change CSP or Keychain account naming.
- Use pnpm and cargo verification commands.

## Risks

- Persisted tools state may already have disabled: [] from old installs; migration is needed to default-disable write_file for existing users.
- Tool-call history sequencing must remain provider-agnostic while Anthropic internally merges tool results.
- `pnpm test:real-providers` requires a visible Keychain/env Provider key; without one it should be recorded as blocked/skipped, not passed.
- DeepSeek real Provider smoke passed after a temporary `CLAW_DEEPSEEK_API_KEY` env value was supplied and the command was rerun with network access; no key value is recorded in repo files.
- Large Vite chunk warning is known from prior build and only becomes actionable if bundle size affects startup or release packaging.
- `/home` 只映射精确路径和当前用户名下路径，不映射任意 `/home/other`，避免把其他用户目录伪装成当前 home。
- Sending duplicate auth aliases for custom OpenAI-compatible providers could be unusual for strict upstreams, but custom providers commonly point at gateway/proxy products; aliases only carry the same secret and are scoped to custom provider requests.
- 发版 hook 的补推发生在后台任务里；如果原始 push 失败或远端分支没有到达 hook 创建版本提交前的 base SHA，后台任务会停止并把错误写入 `/tmp` 下的 `claw-release-hooks` 日志。

## Rejected Options

- Changing default model away from MiniMax: rejected by plan assumptions.
- Implementing MCP in this closeout: rejected because the current task is documentation/status/verification alignment, not a new public interface rollout.
