# Implementation Plan: MCP Integration MVP

**Branch**: `001-mcp-integration` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-mcp-integration/spec.md`

**Note**: This plan covers planning and design artifacts only. Implementation happens after `/speckit-tasks`.

## Summary

Add a first MCP integration slice for local command-launched MCP servers. Users can configure servers, test connections, discover tools, enable/disable servers, and let chat models call discovered tools through the existing provider-agnostic tool loop. The MVP excludes remote HTTP/SSE MCP transports, cloud sync, and non-tool MCP capabilities.

Technical approach: keep MCP server configuration in the existing local SQLite database, add Rust-side MCP client/runtime commands for local child-process servers, expose MCP server/tool state to React settings, merge enabled MCP tools with existing built-in tools for chat requests, and route MCP tool calls through a unified tool executor.

## Technical Context

**Language/Version**: TypeScript 5 strict, React 19, Rust 1.77, Tauri 2

**Primary Dependencies**: Existing Tauri command bridge, sqlx SQLite, Zustand, Vitest, Cargo tests; add an MCP Rust client dependency if it satisfies local child-process transport and tool call requirements during implementation

**Storage**: Local SQLite `claw.db`; existing `mcp_servers` table will be used and extended as needed

**Testing**: `pnpm typecheck`, `pnpm lint`, `pnpm test:run`, `cargo fmt --check`, `cargo test --lib`; targeted frontend tests for settings/tools/chat integration

**Target Platform**: macOS / Windows / Linux desktop app

**Project Type**: Desktop app with React frontend and Rust backend commands

**Performance Goals**: Connection test and tool discovery should complete within 5 seconds for a healthy local server exposing up to 20 tools; disabling a server should remove its tools from new chat requests immediately

**Constraints**: No hardcoded secrets; no plaintext secret logging; no remote MCP transports in MVP; preserve existing built-in tools; avoid startup-time server launches; sanitize server stderr/errors before display

**Scale/Scope**: Personal desktop client; expected 1-20 configured MCP servers and 1-100 total discovered tools in normal use

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The repository constitution file is still the generated placeholder, so this plan applies the active project rules from `AGENTS.md`:

- **Strict TypeScript**: Pass. New frontend code must avoid bare `any` and use typed command contracts.
- **Business code requires tests**: Pass. All runtime, store, and UI changes require unit tests; Rust public command helpers require tests.
- **Security**: Pass. MCP command configs can include secrets through environment variables, so errors and diagnostics must redact sensitive values.
- **Desktop-only scope**: Pass. Feature targets Tauri desktop only.
- **Provider/tool loop preservation**: Pass. MCP is added to the existing tool abstraction instead of replacing provider adapters.

No gate violations are expected for the MVP design.

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-integration/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tauri-commands.md
│   └── tool-runtime.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/settings/
│   ├── McpServersTab.tsx
│   └── McpServersTab.test.tsx
├── hooks/
│   ├── useMcpServers.ts
│   └── useMcpServers.test.ts
├── lib/
│   ├── mcp.ts
│   └── tools/
│       ├── executor.ts
│       └── executor.test.ts
├── stores/
│   ├── mcpServers.ts
│   └── mcpServers.test.ts
└── types/
    ├── mcp.ts
    └── tool.ts

src-tauri/
├── Cargo.toml
└── src/
    ├── commands/
    │   ├── mcp.rs
    │   └── mod.rs
    ├── db/
    │   └── migrations/0001_init.sql
    └── lib.rs
```

**Structure Decision**: MCP runtime belongs in Rust because local server process lifecycle and stdio transport are backend concerns. React owns configuration UI, local state hydration, and merging MCP tools into the chat-facing tool list. Existing provider adapters remain unchanged.

## Complexity Tracking

No constitution violations are currently justified or accepted.
