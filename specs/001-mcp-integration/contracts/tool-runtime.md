# Contract: MCP Tool Runtime

## Tool Exposure

Built-in tools and MCP tools share the same chat-facing `ToolDefinition` shape.

### MCP Tool Definition

```json
{
  "name": "mcp__mcp_abc__read_file",
  "description": "[MCP: Filesystem] Read a file",
  "parameters": { "type": "object", "properties": {}, "required": [] },
  "source": "mcp",
  "mcp_server_id": "mcp_abc"
}
```

## Naming Rules

- `name` must be unique across all tools exposed to the model.
- `name` must be stable while the server id and original tool name are unchanged.
- UI should show the original tool name and server name; the model receives the safe runtime name.
- If two servers expose `read_file`, they must produce different runtime names.

## Availability Rules

- Built-in tools are available when not disabled by the user.
- MCP tools are available only when the owning server is enabled and tool discovery has succeeded.
- If the user disables a server, its tools disappear from new chat requests immediately.
- Existing in-progress invocations may finish or return a controlled error if the server is removed.

## Execution Rules

1. The chat engine yields a tool call with a runtime tool name.
2. The unified executor checks the tool source.
3. Built-in tools continue using existing local file command behavior.
4. MCP tools call the owning server through the backend MCP runtime.
5. The executor returns the existing `{ ok, content }` shape to the chat engine.
6. The chat engine appends the result as a tool result for the next model round.

## Error Rules

- Unknown runtime tool name returns `ok=false`.
- Disabled server returns `ok=false`.
- Deleted server returns `ok=false`.
- Timeout returns `ok=false`.
- Server error returns `ok=false` with sanitized content.
- Secret-like values must be redacted before they reach UI, logs, or tool result text.

## Result Normalization

- Text content is returned as text.
- Structured content is serialized as readable JSON.
- Unsupported rich content is summarized in text for MVP.
- Large content is bounded and summarized before display if needed.
