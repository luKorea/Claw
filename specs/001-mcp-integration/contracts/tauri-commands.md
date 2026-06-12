# Contract: MCP Tauri Commands

This contract describes app-facing commands needed by the MCP MVP. Exact Rust and TypeScript names may follow existing project conventions, but request/response semantics must remain stable.

## `list_mcp_servers`

### Request

No parameters.

### Response

List of saved MCP server configurations with latest status summary when available.

```json
[
  {
    "id": "mcp_abc",
    "name": "Filesystem",
    "transport": "local-command",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Desktop"],
    "workingDirectory": null,
    "envKeys": ["API_TOKEN"],
    "enabled": true,
    "status": {
      "phase": "ready",
      "toolCount": 3,
      "lastCheckedAt": 1781136000000,
      "errorCategory": null,
      "errorMessage": null
    },
    "createdAt": 1781136000000,
    "updatedAt": 1781136000000
  }
]
```

## `create_mcp_server`

### Request

```json
{
  "input": {
    "name": "Filesystem",
    "transport": "local-command",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Desktop"],
    "workingDirectory": null,
    "env": { "API_TOKEN": "secret-value" },
    "enabled": true
  }
}
```

### Response

Created MCP server configuration. Secret values are never echoed back; only environment variable keys may be returned.

## `update_mcp_server`

### Request

```json
{
  "input": {
    "id": "mcp_abc",
    "name": "Filesystem",
    "transport": "local-command",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Documents"],
    "workingDirectory": null,
    "env": { "API_TOKEN": "new-secret-value" },
    "enabled": true
  }
}
```

### Response

Updated MCP server configuration with status marked as requiring retest.

## `delete_mcp_server`

### Request

```json
{ "id": "mcp_abc" }
```

### Response

```json
{ "ok": true }
```

## `test_mcp_server`

### Request

```json
{ "id": "mcp_abc" }
```

### Response

```json
{
  "serverId": "mcp_abc",
  "phase": "ready",
  "serverName": "Filesystem MCP",
  "serverVersion": "1.0.0",
  "supportsTools": true,
  "toolCount": 3,
  "tools": [
    {
      "serverId": "mcp_abc",
      "serverName": "Filesystem",
      "originalName": "read_file",
      "runtimeName": "mcp__mcp_abc__read_file",
      "description": "Read a file",
      "inputSchema": { "type": "object" },
      "enabled": true
    }
  ],
  "errorCategory": null,
  "errorMessage": null
}
```

### Error Response

Command failures must use sanitized messages:

```json
{
  "serverId": "mcp_abc",
  "phase": "failed",
  "supportsTools": false,
  "toolCount": 0,
  "tools": [],
  "errorCategory": "startup_failed",
  "errorMessage": "Command could not be started. Check the executable path and arguments."
}
```

## `list_mcp_tools`

### Request

Optional server filter.

```json
{ "serverId": "mcp_abc" }
```

### Response

List of currently discovered tools. Disabled servers are excluded by default from chat-facing tool lists.

## `call_mcp_tool`

### Request

```json
{
  "input": {
    "runtimeName": "mcp__mcp_abc__read_file",
    "arguments": { "path": "/Users/me/Desktop/a.txt" },
    "toolUseId": "toolu_123"
  }
}
```

### Response

```json
{
  "toolUseId": "toolu_123",
  "content": "{\"text\":\"file content\"}",
  "isError": false,
  "summary": "Returned text content"
}
```

### Failure Response

Failures return a tool result shape, not an unhandled chat crash.

```json
{
  "toolUseId": "toolu_123",
  "content": "MCP tool failed: server disabled",
  "isError": true,
  "summary": "Server disabled"
}
```
