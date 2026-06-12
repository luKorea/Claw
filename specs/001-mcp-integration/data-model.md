# Data Model: MCP Integration MVP

## MCP Server Configuration

Represents one local MCP server saved by the user.

### Fields

- `id`: Stable unique identifier.
- `name`: User-facing display name.
- `transport`: MVP value is `local-command`.
- `command`: Executable or command name entered by the user.
- `args`: Ordered argument list.
- `workingDirectory`: Optional working directory.
- `env`: Optional environment variable map.
- `enabled`: Whether the server contributes tools to chat.
- `createdAt`: Creation timestamp.
- `updatedAt`: Last configuration update timestamp.

### Validation Rules

- `name` must be non-empty after trimming.
- `command` must be non-empty after trimming.
- `args` must preserve ordering.
- `env` values must not be shown in full in UI errors or logs.
- `transport` must reject remote transport values in the MVP.

### State Transitions

```text
Draft input -> Saved disabled/enabled -> Tested success/failure
Saved -> Edited -> Needs retest
Saved -> Deleted
Enabled -> Disabled -> Enabled
```

## MCP Server Status

Represents the most recent observed runtime state.

### Fields

- `serverId`: Related MCP server configuration.
- `phase`: `not_tested`, `starting`, `initializing`, `discovering_tools`, `ready`, `failed`.
- `serverName`: Optional name reported by the MCP server.
- `serverVersion`: Optional version reported by the MCP server.
- `supportsTools`: Whether the server reports tools capability.
- `toolCount`: Number of discovered tools.
- `lastCheckedAt`: Last test or refresh timestamp.
- `errorCategory`: Optional user-facing category.
- `errorMessage`: Optional sanitized message.

### Validation Rules

- Failed statuses must include a sanitized user-facing category.
- Secret-like values must not appear in `errorMessage`.
- A server can be `ready` with `toolCount = 0`.

## MCP Tool

Represents one tool discovered from an MCP server.

### Fields

- `serverId`: Owning server.
- `serverName`: Display name of the owning server.
- `originalName`: Tool name reported by the server.
- `runtimeName`: Unique tool name exposed to chat providers.
- `description`: User/model-facing description.
- `inputSchema`: Tool input requirements.
- `enabled`: Derived from owning server enabled state and discovery status.
- `discoveredAt`: Last discovery timestamp.

### Validation Rules

- `runtimeName` must be unique across built-in and MCP tools.
- `originalName` and `description` should be preserved for UI display.
- Missing or invalid schema must degrade into a non-callable or clearly marked unavailable tool rather than crashing chat.

## MCP Tool Invocation

Represents one tool call during a chat turn.

### Fields

- `toolUseId`: Provider-generated tool call id.
- `runtimeName`: Unique tool name received from the model.
- `serverId`: Resolved server id.
- `originalName`: Resolved MCP tool name.
- `input`: Input arguments from the model.
- `status`: `queued`, `running`, `succeeded`, `failed`, `timed_out`.
- `startedAt`: Invocation start timestamp.
- `finishedAt`: Optional completion timestamp.
- `result`: Optional normalized result content.
- `errorMessage`: Optional sanitized error summary.

### Validation Rules

- Unknown `runtimeName` must return an error tool result.
- Disabled or deleted server must return an error tool result.
- Timed-out invocation must return an error tool result and stop waiting for that call.

## MCP Tool Result

Represents normalized content returned to the chat loop.

### Fields

- `toolUseId`: Matching tool invocation id.
- `content`: Stringified text or structured content for the model and transcript.
- `isError`: Whether the result represents failure.
- `summary`: Optional short display summary.

### Validation Rules

- Result content should be bounded before display and persistence.
- Errors must preserve enough information for model recovery while hiding secrets.
