# Quickstart: MCP Integration MVP Validation

## Prerequisites

- Node >= 20
- pnpm installed
- Rust stable toolchain
- A simple local MCP server command available for testing

## Setup

```bash
pnpm install
```

## Validation Scenario 1: Add and Test a Local MCP Server

1. Start the desktop app:

   ```bash
   pnpm dev:tauri
   ```

2. Open Settings -> Tools or the MCP server management area.
3. Add a local MCP server with a valid display name, command, arguments, and optional environment variables.
4. Click the connection test action.

Expected result:

- The server is saved locally.
- The test reports success.
- The UI shows server identity when available.
- The UI shows discovered tool count and tool names.
- Secret values are not displayed.

## Validation Scenario 2: MCP Tool Appears in Chat

1. Enable the tested MCP server.
2. Click the refresh action if the server command or tool schema changed.
3. Start a new chat with a model that supports tool calling.
4. Ask for an action that requires the MCP tool.

Expected result:

- The model can call the MCP tool.
- The transcript shows the tool call and result.
- The model uses the result in the final answer.
- Existing built-in tools remain available when enabled.
- The tool card shows MCP ownership using the runtime tool name's server id.

## Validation Scenario 3: Disable MCP Server

1. Disable the MCP server in settings.
2. Start a new chat.
3. Ask for the same action as Scenario 2.

Expected result:

- The disabled server's tools are not exposed to the model.
- No app restart is required.
- Re-enabling the server restores tools for new chat requests after successful discovery.

## Validation Scenario 4: Delete MCP Server

1. Delete a saved MCP server from Settings -> Tools.
2. Confirm deletion.
3. Start a new chat.

Expected result:

- The server disappears from the settings list.
- Its tools are not exposed to new chat requests.
- In-progress or stale tool calls receive a controlled error result instead of crashing the app.

## Validation Scenario 5: Runtime Failure Diagnostics

1. Add an MCP server with an invalid command.
2. Run connection test.
3. Add or edit a server so its tool returns an error.
4. Trigger that tool from chat.

Expected result:

- Startup failures, discovery failures, and invocation failures show distinct messages.
- The chat does not hang permanently.
- Error text is sanitized and does not reveal full secret values.
- Disabled, deleted, timed-out, and unknown tool calls return structured error categories.

## Required Verification Commands

```bash
pnpm typecheck
pnpm lint
pnpm test:run
cd src-tauri
cargo fmt --check
cargo test --lib --offline
```

## Out of Scope Checks

- Remote HTTP/SSE MCP servers are not expected to work in this MVP.
- Cloud sync of MCP configuration is not expected.
- MCP resources, prompts, sampling, elicitation, and task management are not expected to be user-facing in this MVP.
