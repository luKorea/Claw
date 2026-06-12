# Implementation Plan: Settings Sidebar and MCP JSON Management

## Summary

Rework settings into a two-column dialog and replace the MCP global JSON editor with a server list plus JSON dialog. Preserve JSON-only editing while making add/edit discoverable and protecting existing environment secrets.

## Technical Approach

- Settings dialog keeps the existing `activeTab` controlled prop but renders a sidebar button list instead of top tabs.
- Existing settings tab components remain the content bodies.
- MCP server UI becomes a list of row-like cards plus a `New MCP Server` row.
- JSON dialog is local UI state in the MCP settings component; it serializes all current servers for add and edit flows.
- Save parses the JSON and performs create/update by server name only; it never calls delete.
- Backend update merges blank incoming env values with existing stored values.

## Validation

- Frontend component tests cover sidebar navigation, MCP list display, JSON dialog add/edit, no implicit deletion, failure output, and deletion confirmation.
- Backend tests cover env preservation, overwrite, and removal.
- Existing MCP JSON parser tests continue to cover parse/export behavior.

## Risks

- JSON dialog cannot show existing secret values by design; UI copy must make blank env values understandable.
- Settings dialog width changes can affect compact screens; use constrained content dimensions and scroll containers.
