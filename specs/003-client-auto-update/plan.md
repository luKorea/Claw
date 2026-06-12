# Implementation Plan: Client Auto Update

**Branch**: `003-client-auto-update` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-client-auto-update/spec.md`

## Summary

Add signed in-app updates through Tauri 2's updater plugin, using existing GitHub Releases as the update source. The app checks silently on startup, exposes manual checking from About settings, asks before installing, shows progress, and prompts for restart after installation.

## Technical Context

**Language/Version**: Rust 2021, Tauri 2, React 19, TypeScript 5

**Primary Dependencies**: `tauri-plugin-updater`, `tauri-plugin-process`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`

**Storage**: No new persistent storage. Update state is in-memory UI state.

**Testing**: Vitest + Testing Library, cargo test, Tauri build verification

**Target Platform**: macOS, Windows, Linux desktop

**Project Type**: Tauri desktop application

**Performance Goals**: Startup update check must be non-blocking and must not delay initial render or settings/chat interactions.

**Constraints**: Update installation must use signed artifacts. Private signing key must not be committed. Existing local data must survive application updates.

**Scale/Scope**: One official stable release channel backed by GitHub Releases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Security: Pass. The design uses signed updater artifacts and keeps private keys outside the repository.
- Desktop-only scope: Pass. The feature targets macOS, Windows, and Linux desktop builds only.
- Test obligation: Pass. Frontend state, UI behavior, release config, and build verification are included.
- Minimal architecture: Pass. The official updater plugin is preferred over custom version and installer logic.

## Project Structure

### Documentation (this feature)

```text
specs/003-client-auto-update/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── update-flow.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── components/
│   └── updater/
├── components/settings/
├── lib/
│   └── updater.ts
└── test/

src-tauri/
├── capabilities/default.json
├── src/lib.rs
├── Cargo.toml
└── tauri.conf.json

.github/workflows/
└── publish-release.yml
```

**Structure Decision**: Keep update business logic in `src/lib/updater.ts`, user-facing update prompt in `src/components/updater/`, and manual check entry inside the existing About settings component.

## Technical Approach

- Register Tauri updater and process plugins in the Rust builder.
- Configure updater public key and GitHub Release endpoint in `tauri.conf.json`.
- Enable updater artifact generation and inject signing secrets in the GitHub Release workflow.
- Add a typed frontend wrapper that normalizes updater plugin results into app-friendly states.
- Add an `UpdatePrompt` component mounted once in `App` for startup checks and update installation.
- Extend `AboutTab` with a manual check button that uses the same update wrapper and opens the same update prompt behavior.

## Complexity Tracking

No constitution violations.
