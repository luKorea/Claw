# Progress

## Timeline

- Implemented the approved v0.1.2 P0/P1/P2 repair plan.
- Started implementation from the approved repair plan.
- Implemented Provider fallback, MiniMax copy/model-fetch behavior, tool protocol sequencing, write_file path handling, docs metadata updates, and tests.
- Tightened App auto-open guidance: only auto-opened settings closes after fallback resolves to a configured Provider.
- Investigated repeated macOS password prompts and added Rust-side API Key cache to avoid duplicate Keychain reads in one app process.
- Added a real Provider smoke test entrypoint and ran desktop startup smoke.
- Implemented MiniMax Rust Channel bridge, official minimax.io domain sync, optimistic model switching, light theme migration, and user-right/assistant-left chat layout.
- Started release-readiness closeout from the accepted plan: sync README, refresh context, and rerun final verification.

## Completed

- Added global Provider Key state via `useProviderKeysStore`; `useSettings()` now consumes it instead of maintaining local key state per component.
- Added shared model catalog hooks `useAvailableModels` and `useModelSelection`; `useGroupedModels` is now a compatibility wrapper.
- Updated Settings default model and Sidebar current model selector to consume the shared model catalog and surface unavailable current models explicitly.
- Updated ApiKeyTab so saving a DeepSeek/OpenAI Key force-refreshes dynamic models and deleting a Key clears that provider model cache.
- Migrated Custom Provider storage from single `modelId` to `modelIds + selectedModelId`; old `modelId` persisted entries are migrated.
- Added custom model ids (`custom-model:*`) and updated custom Provider chat resolution so conversations store the custom model reference while requests use the raw model id.
- Added `list_custom_provider_models` Tauri command and frontend wrapper for one-click model discovery from OpenAI/Anthropic compatible custom APIs.
- Updated CustomProvidersTab with model fetching, multi-model list editing, default model selection, and manual Model ID fallback.
- Fixed ChatHeader thinking budget local state synchronization across conversation changes.
- Added batch conversation deletion across Rust command, frontend API/hook/store, and ConversationList selection mode.
- Read relevant skills.
- Confirmed git worktree is clean before edits.
- Created current task context files.
- Added provider fallback helpers and tests.
- Updated App startup API Key guidance and tests.
- Updated DefaultTab to show only configured Provider models and persist fallback.
- Updated ApiKeyTab MiniMax copy and dynamic model fetch behavior with tests.
- Updated useChat and chat-engine to use configured Provider fallback and history-based tool_result injection.
- Updated provider message conversion and Anthropic handling for assistant tool_use followed by tool_result.
- Default-disabled write_file with persisted state migration and tests.
- Updated Rust write path resolver to support new files while preserving allowed-root and symlink checks.
- Synced README, package, Cargo, and Tauri descriptions from Claude-only wording to multi-Provider wording.
- Added process-memory API Key caching in src-tauri settings commands.
- Added Rust unit tests for cache state transitions.
- Added `api_key_metadata` migration and rewired settings commands so status/list paths avoid `Entry::get_password()`.
- Added `sync_api_key_status` Tauri command plus frontend wrapper/store action.
- Added `metadataKnown` to Provider Key state, built “未检测本机 Key / 检测已有 Key” UI for built-in and custom Providers.
- Removed App startup automatic dynamic model fetching to avoid `get_api_key` during launch.
- Updated README and AGENTS command docs for metadata-backed Key status.
- Added `pnpm test:real-providers`, backed by a Rust CLI bin that reads the same Keychain accounts as the Tauri backend and sends tiny streaming requests to configured Providers.
- Tightened the real Provider smoke bin to consume streaming SSE chunks incrementally instead of buffering the full response first.
- Verified `pnpm dev:tauri` starts after setting Cargo `default-run = "claw-client"`; this fixes the multi-binary break introduced by the smoke bin.
- Attempted real Provider smoke; current Keychain/env had no configured Provider key visible to the app-compatible keyring path, so no real request was sent.
- Added `stream_minimax_anthropic` / `cancel_minimax_stream` Tauri commands and parser tests for MiniMax Anthropic SSE.
- Replaced MiniMax frontend SDK direct fetch with Tauri Channel adapter to avoid WebView CORS failures.
- Upgraded settings persist version to v3 and migrates existing themes to `light`.
- Added optimistic conversation updates for instant model switching.
- Changed message layout to user-right / assistant-left and added component coverage.
- Synced README with implemented custom Provider, MiniMax Rust bridge, multi-round tool calling, GitHub Releases, and remaining roadmap.
- Updated task context findings with MCP readiness and real Provider smoke constraints.
- Ran closeout verification: lint and build passed; real Provider smoke is blocked until a Provider key is visible.
- Reran real Provider smoke with a temporary DeepSeek env key; sandboxed run failed at request send, network-enabled rerun passed.
- Implemented three follow-up fixes requested on 2026-06-08: user message bubble polish, custom proxy model discovery for root Base URLs, and read tool home alias handling.
- Implemented 2026-06-09 CCSwitch-aligned custom model fetch follow-up: auth headers, key normalization, typed-key priority for existing custom providers, and friendlier 401 errors.
- Implemented 2026-06-09 macOS Keychain prompt fix: metadata-backed key status, explicit legacy Key detection, no startup dynamic model fetch, and updated settings UI.
- Implemented custom Provider chat hardening: normalized chat endpoints, persisted stream mode, auto non-stream fallback, non-stream parsing, test-chat diagnostics, thinking-only UI, and streaming error cleanup.
- Started model picker / custom protocol fallback follow-up after reproducing the current rrzu configuration mismatch.
- Fixed the sidebar model picker viewport by replacing the clipped Radix ScrollArea usage with a reliable `max-h-72 overflow-y-auto` list.
- Added custom Provider auto protocol fallback: the frontend sends an alternate protocol/body pair, and Rust retries that protocol when the configured protocol fails in `auto` mode.
- Updated custom Provider “测试聊天” to attempt the alternate protocol in `auto` mode and return the resolved protocol for diagnostics.
- Implemented Git hook release automation: `.githooks/pre-push`, hook installer, package scripts, Tauri package-version source, and release version sync helper.

## Changed Files

- src/hooks/useAvailableModels.ts
- src/hooks/useModelSelection.ts
- src/stores/providerKeys.ts
- src/stores/providerKeys.test.ts
- src/components/sidebar/ConversationList.test.tsx
- src-tauri/src/commands/conversation.rs
- src-tauri/src/commands/custom_provider.rs
- src-tauri/src/lib.rs
- src/App.tsx
- src/components/chat/ChatHeader.tsx
- src/components/settings/ApiKeyTab.tsx
- src/components/settings/CustomProvidersTab.tsx
- src/components/settings/DefaultTab.tsx
- src/components/sidebar/ConversationList.tsx
- src/components/sidebar/Sidebar.tsx
- src/hooks/useChat.ts
- src/hooks/useConversations.ts
- src/hooks/useGroupedModels.ts
- src/hooks/useModels.ts
- src/hooks/useSettings.ts
- src/lib/db.ts
- src/lib/keyring.ts
- src/lib/providers/custom.ts
- src/stores/conversations.ts
- src/stores/customProviders.ts
- src/stores/settings.ts
- src/types/providers.ts
- .agent-context/current/task_plan.md
- .agent-context/current/findings.md
- .agent-context/current/progress.md
- .githooks/pre-push
- scripts/install-git-hooks.sh
- scripts/sync-release-version.mjs
- package.json
- src-tauri/tauri.conf.json
- src/lib/tools/builtin.ts
- src/lib/tools/builtin.test.ts
- src/components/settings/CustomProvidersTab.tsx
- src/components/settings/CustomProvidersTab.test.tsx
- src-tauri/src/commands/custom_provider.rs
- README.md
- package.json
- src-tauri/Cargo.toml
- src-tauri/src/commands/tool.rs
- src-tauri/src/commands/settings.rs
- src-tauri/src/db/migrations/0001_init.sql
- AGENTS.md
- src-tauri/src/commands/minimax.rs
- src-tauri/src/bin/smoke_real_providers.rs
- src-tauri/tauri.conf.json
- src/App.tsx
- src/App.test.tsx
- src/components/chat/MessageInput.tsx
- src/components/chat/ChatHeader.test.tsx
- src/components/chat/MessageItem.tsx
- src/components/chat/MessageItem.test.tsx
- src/components/chat/MessageList.tsx
- src/components/settings/ApiKeyTab.tsx
- src/components/settings/ApiKeyTab.test.tsx
- src/components/settings/DefaultTab.tsx
- src/components/settings/ToolsSection.tsx
- src/hooks/useChat.ts
- src/hooks/useConversations.test.ts
- src/hooks/useToolEnabled.test.ts
- src/lib/providers/minimaxi.ts
- src/lib/providers/minimaxi.test.ts
- src/lib/chat-engine.ts
- src/lib/chat-engine.test.ts
- src/lib/providers/anthropic.ts
- src/lib/providers/messages.ts
- src/lib/providers/messages.test.ts
- src/lib/providers/types.ts
- src/stores/tools.ts
- src/types/providers.ts
- src/types/providers.test.ts
- README.md
- .agent-context/current/task_plan.md
- .agent-context/current/findings.md
- .agent-context/current/progress.md

## Validation

- pnpm typecheck: passed.
- pnpm lint: passed.
- pnpm test:run: passed, 33 files / 253 tests.
- cargo fmt --check in src-tauri: passed after running cargo fmt.
- cargo test --lib in src-tauri: passed, 60 tests.
- pnpm build: passed. Vite emitted the existing large chunk warning only.
- CLAW_SMOKE_PROVIDERS=deepseek pnpm test:real-providers: blocked before network because no DeepSeek key is present in env or OS Keychain. The supplied chat key was not copied into command lines or files.
- pnpm test:run: passed, 23 files / 209 tests.
- pnpm typecheck: passed.
- pnpm lint: passed.
- cargo test --lib in src-tauri: passed, 43 tests.
- pnpm build: passed. Vite emitted the existing large chunk warning only.
- cargo check --bin smoke_real_providers in src-tauri: passed after incremental SSE consumption update.
- pnpm test:real-providers: blocked before network; no configured Provider keys found in env or OS Keychain for `com.claw.client / api-key:{provider}`. pnpm reports exit 1 because the underlying Rust smoke exits 2.
- pnpm dev:tauri: starts successfully after Cargo default-run fix; desktop real-network send was not possible because no configured Provider key was visible.
- pnpm lint: passed.
- pnpm build: passed. Vite emitted the known large chunk warning for `dist/assets/index-*.js`.
- pnpm test:real-providers: blocked before network; no configured Provider keys were found in env vars or OS Keychain. The smoke script listed supported env overrides: `CLAW_ANTHROPIC_API_KEY`, `CLAW_DEEPSEEK_API_KEY`, `CLAW_OPENAI_API_KEY`, `CLAW_MINIMAXI_API_KEY`.
- pnpm test:real-providers with `CLAW_SMOKE_PROVIDERS=deepseek`: first sandboxed run reached DeepSeek request send and failed; rerun with network access passed (`DeepSeek ... ok ("OK")`).
- pnpm typecheck: passed.
- pnpm test:run: passed, 33 files / 256 tests.
- cargo test --lib in src-tauri: passed, 66 tests.
- pnpm lint: passed.
- pnpm build: passed. Vite emitted the known large chunk warning for `dist/assets/index-*.js`.
- cargo fmt --check in src-tauri: passed after running cargo fmt.
- pnpm test:run src/components/settings/CustomProvidersTab.test.tsx: passed, 5 tests.
- cargo test --lib custom_provider in src-tauri: passed, 15 filtered tests.
- pnpm typecheck: passed.
- pnpm lint: passed.
- cargo fmt --check in src-tauri: passed.
- pnpm test:run: passed, 33 files / 258 tests.
- cargo test --lib in src-tauri: passed, 69 tests.
- pnpm build: passed. Vite emitted the known large chunk warning for `dist/assets/index-*.js`.

Latest macOS Keychain prompt fix verification:

- pnpm typecheck: passed.
- pnpm test:run: passed, 33 files / 263 tests. React act warnings in `usePrompts.test.ts` are existing test warnings.
- cargo test --lib in src-tauri: passed, 73 tests.
- pnpm lint: passed.
- cargo fmt --check in src-tauri: passed after running cargo fmt.
- pnpm build: passed. Vite emitted the known large chunk warning for `dist/assets/index-*.js`.

Latest SQLite Key / Custom Provider config follow-up:

- Added `api_keys` SQLite table and moved normal API Key set/get/delete/status/list paths off Keychain.
- Added `custom_providers` SQLite table plus Rust CRUD commands and frontend async store hydrate/actions.
- Added localStorage custom Provider one-time migration while preserving existing `custom:<suffix>` ids.
- Enhanced custom model discovery URL candidates and response parsing for OpenAI-compatible gateways.
- Updated settings UI copy from “检测已有 Key” to “导入旧 Key” and clarified that Keys are stored in local Claw config.
- Updated real-provider smoke to read env/local `claw.db` first and require `CLAW_SMOKE_USE_KEYCHAIN=1` for legacy Keychain lookup.
- Verification: `pnpm typecheck` passed; `pnpm test:run` passed, 34 files / 269 tests; `cargo test --lib` passed, 77 tests; `pnpm lint` passed; `cargo fmt --check` passed; `pnpm build` passed with the known large chunk warning; `cargo check --example smoke_real_providers` passed; `CLAW_SMOKE_ALLOW_EMPTY=1 pnpm test:real-providers` passed empty-key path without Keychain lookup.

Latest custom Provider chat follow-up:

- Added SQLite `custom_providers.stream_mode` with a startup migration for existing databases.
- Added `auto` / `stream` / `non-stream` runtime modes and OpenAI/Anthropic endpoint normalization.
- Added OpenAI and Anthropic-like non-stream response parsing, including text, reasoning, tools, usage, and stop reason.
- Added `test_custom_provider_chat` and settings UI diagnostics.
- Added thinking-only final-message guidance and error-event streaming cleanup.
- Verification: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `cargo fmt --check` passed; `pnpm test:run` passed 35 files / 278 tests; `cargo test --lib` passed 85 tests.
- Real rrzu check using the locally saved Key without printing it: OpenAI-compatible `qwen3-max` returned HTTP 200 with `OK`; Anthropic `/v1/messages` returned 401; `gemini-2.0-flash` returned an upstream unknown-provider 502.

Latest model picker / protocol fallback follow-up:

- Reproduced current local custom Provider mismatch without printing the Key: SQLite config was `anthropic-compatible` + `gemini-2.0-flash`; Anthropic `/v1/messages` returned 401, OpenAI `/v1/chat/completions` + `qwen3-max` returned 200 / `OK`.
- Targeted verification: `pnpm test:run src/components/sidebar/Sidebar.test.tsx src/lib/providers/custom.test.ts src/components/settings/CustomProvidersTab.test.tsx` passed, 19 tests.
- Full verification: `pnpm typecheck` passed; `pnpm lint` passed; `pnpm test:run` passed, 35 files / 280 tests; `cargo test --lib` passed, 87 tests; `cargo fmt --check` passed; `pnpm build` passed with the known large chunk warning.

Latest Git hook release automation follow-up:

- `bash -n .githooks/pre-push`: passed.
- `bash -n scripts/install-git-hooks.sh`: passed.
- `node --check scripts/sync-release-version.mjs`: passed.
- `node scripts/sync-release-version.mjs 0.1.1`: passed after fixing the same-version idempotency check; produced no extra version diff.
- `pnpm hooks:install`: passed with sandbox escalation because it writes `.git/config`; `git config --get core.hooksPath` returns `.githooks`.
- `CLAW_RELEASE_SKIP=1 .githooks/pre-push origin git@github.com:luKorea/Claw.git`: passed and skipped.
- `.githooks/pre-push upstream git@github.com:someone/Claw.git`: passed and skipped.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test:run`: passed, 35 files / 280 tests. Existing React `act(...)` warnings in `usePrompts.test.ts` remain.
- `cargo test --lib` in `src-tauri`: passed, 87 tests.
- `pnpm build`: passed with the known Vite large chunk warning.
- `pnpm exec prettier --check package.json src-tauri/tauri.conf.json scripts/sync-release-version.mjs`: passed.

## Next Steps

- Optional: validate Anthropic / OpenAI / MiniMax as their keys become available by setting `CLAW_SMOKE_PROVIDERS` and the corresponding env key.
- After closeout, start MCP integration first: DB already has `mcp_servers`, and tool types already distinguish `builtin` vs `mcp`.
- Optional future work: code-split the large frontend bundle if the Vite warning becomes actionable.

## Handoff Notes

- Automated verification and Tauri startup smoke are complete.
- README/context closeout is complete.
- Real Provider networking is validated for DeepSeek using a temporary env key. Do not record Provider key values in repo files or task context.
- Follow-up fixes are complete: user bubble label/content separation, custom OpenAI-compatible root Base URL `/v1` handling, and read tool home alias + directory guidance.
- CCSwitch-aligned custom model fetch follow-up is complete. If the UI still shows a strange API Key preview, clear that custom Provider key and enter the real key again; the new fetch path will use the typed key first.
- macOS repeated password prompt fix is complete for app launch/settings open. Real request send and explicit “检测已有 Key” may still trigger one macOS Keychain authorization by design; use “始终允许/Always Allow” for local dev if needed.
