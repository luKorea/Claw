# Findings

## Files Read

- AGENTS instructions embedded by user.
- react-expert skill.
- precise-context skill.
- Previous diagnosis covered App, useChat, provider registry, settings, tools, DB, Rust commands, README, and package/Tauri metadata.

## Search Notes

- Searched DEFAULT_MODEL_ID, configuredProviders, ProviderKeyCard, toolResultsBuffer, safe_resolve_with, write_file, and Claude API wording.

## Key Facts

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
- A Rust CLI bin is required for real Provider smoke because shell `security find-generic-password` did not reliably find the same entries as the app-compatible `keyring` crate path.
- Current live real-provider smoke is blocked before network: neither env vars nor OS Keychain expose configured Provider keys for `com.claw.client / api-key:{provider}`.
- Adding an extra Cargo bin requires `default-run = "claw-client"`; otherwise `tauri dev` fails because cargo cannot infer which binary to run.

## Constraints

- TypeScript strict, no bare any.
- Business code changes require tests.
- Do not change CSP or Keychain account naming.
- Use pnpm and cargo verification commands.

## Risks

- Persisted tools state may already have disabled: [] from old installs; migration is needed to default-disable write_file for existing users.
- Tool-call history sequencing must remain provider-agnostic while Anthropic internally merges tool results.

## Rejected Options

- Changing default model away from MiniMax: rejected by plan assumptions.
