# Tasks: Settings Sidebar and MCP JSON Management

## Phase 1 - Spec Assets

- [x] T001 Create `specs/002-settings-sidebar-mcp-json/spec.md`
- [x] T002 Create quality checklist with all items resolved
- [x] T003 Point `.specify/feature.json` at the new feature directory

## Phase 2 - Settings Layout

- [x] T004 Replace top settings tabs with sidebar navigation
- [x] T005 Add component tests for sidebar tab switching

## Phase 3 - MCP JSON List UI

- [x] T006 Replace MCP global editor card with installed server list
- [x] T007 Add `New MCP Server` row and JSON dialog
- [x] T008 Add edit flow through the same JSON dialog
- [x] T009 Add expandable failure output
- [x] T010 Update MCP component tests

## Phase 4 - Env Preservation

- [x] T011 Merge blank incoming env values with existing backend values during update
- [x] T012 Add Rust tests for env preserve, overwrite, and removal

## Phase 5 - Verification

- [x] T013 Run targeted frontend tests
- [x] T014 Run `pnpm typecheck`
- [x] T015 Run `pnpm lint`
- [x] T016 Run targeted Rust MCP tests
