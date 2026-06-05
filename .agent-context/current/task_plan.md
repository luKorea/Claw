# Task Plan

## Goal

Fix the current Claw runtime usability issues: default Provider/API Key guidance, MiniMax key copy, tool-call round sequencing, write_file behavior, and stale documentation.

## Success Criteria

- Default model never points to an unconfigured Provider when any Provider key exists.
- Settings stays open only while the default Provider key is missing.
- MiniMax key hints consistently use sk-cp/sk wording.
- Tool-call second rounds send assistant tool_use followed by matching tool_result.
- write_file is disabled by default and can create new files inside allowed roots.
- Frontend/Rust tests and build commands pass.

## Scope

- In scope: React settings/chat/tool state, provider message sequencing, Rust file tool path handling, tests, README/package/Tauri description.
- Out of scope: adding Providers, changing Keychain account names, changing CSP domains, launching the full Tauri GUI.

## Plan

- [x] Phase 1: Read current tests and helper contracts.
- [x] Phase 2: Fix default Provider/API Key flow and MiniMax copy.
- [x] Phase 3: Fix tool-call protocol sequencing and tests.
- [x] Phase 4: Fix write_file semantics and default tool state.
- [x] Phase 5: Sync docs and run verification.

## Decisions

- Keep DEFAULT_MODEL_ID as MiniMax-M2.7.
- Runtime fallback chooses the first configured Provider in ALL_PROVIDER_IDS order and that Provider's first known model.
- MiniMax dynamic /v1/models fetch stays skipped.

## Open Questions

- None.

## Current Status

Implementation complete. Verification passed with pnpm typecheck, pnpm lint, pnpm test:run, cargo test --lib, and pnpm build.
