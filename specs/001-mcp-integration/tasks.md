# Tasks: MCP Integration MVP

**Input**: Design documents from `specs/001-mcp-integration/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by project rules for business code changes. Test tasks are listed before implementation tasks inside each user story.

**Organization**: Tasks are grouped by user story to keep each slice independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks in the same phase when file paths do not conflict.
- **[Story]**: Maps the task to a user story from `spec.md`.
- Every task includes an exact file path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add shared MCP types, dependency entry points, and module shells.

- [X] T001 Evaluate Rust MCP client dependency/features in `src-tauri/Cargo.toml` (RMCP evaluated; US1 uses built-in stdio JSON-RPC fallback to avoid new crate downloads)
- [X] T002 [P] Add shared frontend MCP types in `src/types/mcp.ts`
- [X] T003 [P] Add frontend MCP command wrapper shell in `src/lib/mcp.ts`
- [X] T004 [P] Add Rust MCP command module shell in `src-tauri/src/commands/mcp.rs`
- [X] T005 Register the MCP command module in `src-tauri/src/commands/mod.rs`
- [X] T006 Register placeholder MCP Tauri commands in `src-tauri/src/lib.rs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish storage shape, runtime abstractions, redaction, and tool identity mapping used by all stories.

**Critical**: No user story work should start until this phase is complete.

- [X] T007 Update `mcp_servers` schema fields/defaults in `src-tauri/src/db/migrations/0001_init.sql`
- [X] T008 [P] Add Rust MCP data models and validation helpers in `src-tauri/src/commands/mcp.rs`
- [X] T009 [P] Add Rust secret redaction helper tests in `src-tauri/src/commands/mcp.rs`
- [X] T010 Add Rust MCP runtime state structure for app-local server sessions in `src-tauri/src/commands/mcp.rs`
- [X] T011 [P] Add frontend MCP store shell in `src/stores/mcpServers.ts`
- [X] T012 [P] Add frontend MCP store tests in `src/stores/mcpServers.test.ts`
- [X] T013 Add MCP-aware tool identity fields to `src/types/tool.ts`
- [X] T014 Add MCP runtime-name mapping helpers and tests in `src/lib/tools/executor.test.ts`

**Checkpoint**: Storage, runtime shells, and tool identity mapping are ready for user-story work.

---

## Phase 3: User Story 1 - Add and Verify a Local MCP Server (Priority: P1)

**Goal**: Users can add a local MCP server, save it, run connection testing, and see discovered tool count/details.

**Independent Test**: Configure a simple local MCP server, test connection, and confirm server status plus tool list are visible without starting a chat.

### Tests for User Story 1

- [X] T015 [P] [US1] Add Rust tests for MCP server create/list/update validation in `src-tauri/src/commands/mcp.rs`
- [X] T016 [P] [US1] Add Rust tests for connection-test success/failure mapping in `src-tauri/src/commands/mcp.rs`
- [X] T017 [P] [US1] Add frontend wrapper tests for MCP CRUD/test commands in `src/lib/mcp.test.ts`
- [X] T018 [P] [US1] Add MCP settings store tests for hydrate/save/test flows in `src/stores/mcpServers.test.ts`
- [X] T019 [P] [US1] Add MCP server settings UI tests in `src/components/settings/McpServersTab.test.tsx`

### Implementation for User Story 1

- [X] T020 [US1] Implement `list_mcp_servers` command in `src-tauri/src/commands/mcp.rs`
- [X] T021 [US1] Implement `create_mcp_server` command in `src-tauri/src/commands/mcp.rs`
- [X] T022 [US1] Implement `update_mcp_server` command in `src-tauri/src/commands/mcp.rs`
- [X] T023 [US1] Implement `test_mcp_server` command with local server initialization and tool discovery in `src-tauri/src/commands/mcp.rs`
- [X] T024 [US1] Register US1 MCP commands in `src-tauri/src/lib.rs`
- [X] T025 [US1] Implement MCP command wrappers in `src/lib/mcp.ts`
- [X] T026 [US1] Implement MCP server Zustand store actions in `src/stores/mcpServers.ts`
- [X] T027 [US1] Implement `useMcpServers` hook in `src/hooks/useMcpServers.ts`
- [X] T028 [US1] Implement MCP server settings UI in `src/components/settings/McpServersTab.tsx`
- [X] T029 [US1] Add MCP management entry to settings tabs in `src/components/settings/SettingsDialog.tsx`

**Checkpoint**: User Story 1 is fully functional and independently testable.

---

## Phase 4: User Story 2 - Use MCP Tools in Chat (Priority: P1)

**Goal**: Enabled MCP tools are exposed to tool-capable models and can be invoked during chat through the existing tool-result loop.

**Independent Test**: Configure a simple MCP server with a fixed-response tool, ask the model to use it, and confirm the final answer uses the tool result.

### Tests for User Story 2

- [X] T030 [P] [US2] Add Rust tests for `list_mcp_tools` and disabled-server filtering in `src-tauri/src/commands/mcp.rs`
- [X] T031 [P] [US2] Add Rust tests for `call_mcp_tool` success/error result normalization in `src-tauri/src/commands/mcp.rs`
- [X] T032 [P] [US2] Add frontend tests for merging built-in and MCP tools in `src/lib/tools/executor.test.ts`
- [X] T033 [P] [US2] Add chat engine tests for MCP tool result round-trip in `src/lib/chat-engine.test.ts`
- [X] T034 [P] [US2] Add useChat tests for passing enabled MCP tools into chat turns in `src/hooks/useChat.test.ts`

### Implementation for User Story 2

- [X] T035 [US2] Implement `list_mcp_tools` command in `src-tauri/src/commands/mcp.rs`
- [X] T036 [US2] Implement `call_mcp_tool` command in `src-tauri/src/commands/mcp.rs`
- [X] T037 [US2] Register US2 MCP commands in `src-tauri/src/lib.rs`
- [X] T038 [US2] Add frontend MCP tool list wrapper in `src/lib/mcp.ts`
- [X] T039 [US2] Replace `executeBuiltinTool` with unified built-in/MCP execution in `src/lib/tools/executor.ts`
- [X] T040 [US2] Add MCP tool definition mapping in `src/lib/tools/executor.ts`
- [X] T041 [US2] Merge enabled MCP tools with built-in tools before chat requests in `src/hooks/useChat.ts`
- [X] T042 [US2] Preserve built-in tool behavior while adding MCP source routing in `src/lib/chat-engine.ts`
- [X] T043 [US2] Surface MCP tool ownership in chat tool result display in `src/components/chat/MessageItem.tsx`

**Checkpoint**: User Stories 1 and 2 work independently; MCP tools can participate in chat.

---

## Phase 5: User Story 3 - Manage MCP Servers Safely (Priority: P2)

**Goal**: Users can enable, disable, edit, refresh, and delete MCP servers, and chat availability follows those changes.

**Independent Test**: Add two MCP servers, disable one, edit one, refresh tools, delete one, and confirm available tools update without app restart.

### Tests for User Story 3

- [X] T044 [P] [US3] Add Rust tests for delete/disable lifecycle cleanup in `src-tauri/src/commands/mcp.rs`
- [X] T045 [P] [US3] Add frontend store tests for enable/disable/delete refresh behavior in `src/stores/mcpServers.test.ts`
- [X] T046 [P] [US3] Add settings UI tests for edit/delete/refresh flows in `src/components/settings/McpServersTab.test.tsx`

### Implementation for User Story 3

- [X] T047 [US3] Implement `delete_mcp_server` command and runtime cleanup in `src-tauri/src/commands/mcp.rs`
- [X] T048 [US3] Implement server enable/disable persistence in `src-tauri/src/commands/mcp.rs`
- [X] T049 [US3] Implement tool refresh behavior in `src-tauri/src/commands/mcp.rs`
- [X] T050 [US3] Register US3 command updates in `src-tauri/src/lib.rs`
- [X] T051 [US3] Add edit/delete/refresh frontend actions in `src/stores/mcpServers.ts`
- [X] T052 [US3] Add edit/delete/refresh controls in `src/components/settings/McpServersTab.tsx`
- [X] T053 [US3] Ensure disabled/deleted servers are removed from new chat tool lists in `src/hooks/useChat.ts`

**Checkpoint**: User Stories 1-3 work independently; server management is safe and visible.

---

## Phase 6: User Story 4 - Diagnose MCP Runtime Problems (Priority: P3)

**Goal**: Users receive distinct, sanitized diagnostics for startup, initialization, discovery, invocation, timeout, and deleted/disabled server failures.

**Independent Test**: Use invalid command, timeout server, and failing tool cases; confirm errors are categorized, sanitized, and do not hang chat.

### Tests for User Story 4

- [X] T054 [P] [US4] Add Rust tests for timeout categories in `src-tauri/src/commands/mcp.rs`
- [X] T055 [P] [US4] Add Rust tests for stderr/env redaction in `src-tauri/src/commands/mcp.rs`
- [X] T056 [P] [US4] Add frontend UI tests for diagnostic rendering in `src/components/settings/McpServersTab.test.tsx`
- [X] T057 [P] [US4] Add chat error-result tests for MCP invocation failures in `src/lib/tools/executor.test.ts`

### Implementation for User Story 4

- [X] T058 [US4] Implement structured MCP error categories in `src-tauri/src/commands/mcp.rs`
- [X] T059 [US4] Implement startup/discovery/invocation timeout handling in `src-tauri/src/commands/mcp.rs`
- [X] T060 [US4] Implement stderr and secret redaction before returning diagnostics in `src-tauri/src/commands/mcp.rs`
- [X] T061 [US4] Return controlled tool results for disabled/deleted/timed-out MCP calls in `src-tauri/src/commands/mcp.rs`
- [X] T062 [US4] Render sanitized diagnostics in MCP settings UI in `src/components/settings/McpServersTab.tsx`
- [X] T063 [US4] Ensure chat stops streaming cleanly after MCP invocation errors in `src/hooks/useChat.ts`

**Checkpoint**: All user stories are independently functional with recoverable diagnostics.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, formatting, and release readiness.

- [X] T064 [P] Update README MCP roadmap/status in `README.md`
- [X] T065 [P] Update command table and MCP constraints in `AGENTS.md`
- [X] T066 [P] Update quickstart validation notes if implementation differs from plan in `specs/001-mcp-integration/quickstart.md`
- [X] T067 Run `pnpm typecheck` from repository root
- [X] T068 Run `pnpm lint` from repository root
- [X] T069 Run `pnpm test:run` from repository root
- [X] T070 Run `cargo fmt --check` in `src-tauri/`
- [X] T071 Run `cargo test --lib` in `src-tauri/`
- [ ] T072 Run the manual scenarios in `specs/001-mcp-integration/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational.
- **User Story 2 (Phase 4)**: Depends on Foundational and can begin once tool discovery contract from US1 is stable.
- **User Story 3 (Phase 5)**: Depends on Foundational and benefits from US1 UI/store structure.
- **User Story 4 (Phase 6)**: Depends on Foundational and should be completed before release.
- **Polish (Phase 7)**: Depends on selected user stories for the delivery slice.

### User Story Dependencies

- **US1**: MVP configuration and connection testing; no dependency on other user stories after Foundation.
- **US2**: Requires the MCP tool discovery shape from US1, but can be implemented once contracts are stable.
- **US3**: Requires server CRUD state from US1.
- **US4**: Cross-cuts all runtime operations; implement after the main paths exist.

### Parallel Opportunities

- T002, T003, and T004 can run in parallel.
- T008, T009, T011, and T012 can run in parallel after T001-T006.
- US1 tests T015-T019 can be written in parallel.
- US2 tests T030-T034 can be written in parallel.
- US3 tests T044-T046 can be written in parallel.
- US4 tests T054-T057 can be written in parallel.
- Documentation tasks T064-T066 can run in parallel after implementation stabilizes.

---

## Parallel Example: User Story 1

```text
Task: T015 Add Rust tests for MCP server create/list/update validation in src-tauri/src/commands/mcp.rs
Task: T017 Add frontend wrapper tests for MCP CRUD/test commands in src/lib/mcp.test.ts
Task: T019 Add MCP server settings UI tests in src/components/settings/McpServersTab.test.tsx
```

## Parallel Example: User Story 2

```text
Task: T030 Add Rust tests for list_mcp_tools and disabled-server filtering in src-tauri/src/commands/mcp.rs
Task: T032 Add frontend tests for merging built-in and MCP tools in src/lib/tools/executor.test.ts
Task: T034 Add useChat tests for passing enabled MCP tools into chat turns in src/hooks/useChat.test.ts
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1) so users can configure and verify MCP servers.
3. Complete Phase 4 (US2) so MCP tools can be used in chat.
4. Stop and validate with quickstart scenarios 1 and 2 before continuing.

### Full MVP Release

1. Complete MVP First.
2. Add Phase 5 (US3) for safe management.
3. Add Phase 6 (US4) for diagnostics hardening.
4. Complete Phase 7 verification.

### Notes

- Commit only after coherent task groups, not after every tiny file edit.
- Keep remote HTTP/SSE MCP support out of this feature.
- Keep cloud sync out of this feature.
- Keep rich media tool rendering out of this feature unless needed for a failing MVP validation.
