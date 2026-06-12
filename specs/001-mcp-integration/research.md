# Research: MCP Integration MVP

## Decision: Support only local command-launched MCP servers in MVP

**Rationale**: The feature spec explicitly excludes remote HTTP/SSE MCP transports. Local command-launched servers match the app's desktop-first nature and avoid remote auth/session complexity in the first slice.

**Alternatives considered**:

- Remote Streamable HTTP from the start: deferred because it adds URL auth, network errors, session handling, and CSP/security review.
- Legacy SSE remote transport: deferred with remote transports and not needed for the MVP.

## Decision: Use the MCP initialize -> tool discovery -> tool invocation lifecycle

**Rationale**: Current MCP specification uses an initialization exchange to negotiate protocol version and capabilities, and exposes tools through list/call operations. The app needs server capability awareness to tell users whether a connection succeeded but no tools are available.

**Alternatives considered**:

- Treat MCP servers as opaque command executors: rejected because it would not validate server capabilities or discover tools safely.
- Hardcode tool schemas per server: rejected because MCP servers are expected to self-describe available tools.

## Decision: Prefer a Rust MCP client SDK that supports child-process transport

**Rationale**: Context7 documentation for RMCP shows child-process transport plus list-tools and call-tool client APIs. A maintained SDK reduces protocol parsing risk and keeps the app focused on product integration.

**Implementation note (2026-06-11)**: RMCP 1.7.0 was evaluated and its `client` / `transport-child-process` feature set matches the desired local-child-process workflow. The first US1 implementation uses a minimal built-in JSON-RPC stdio client instead because this environment repeatedly stalled while downloading RMCP transitive crates from the crates index. This keeps the MVP independent of new crates while preserving the initialize -> initialized -> tools/list lifecycle. RMCP can still replace the fallback later if dependency fetching is stable.

**Alternatives considered**:

- Hand-roll JSON-RPC over stdio: possible fallback if dependency fit is poor, but higher risk around lifecycle, pagination, error mapping, and future protocol updates.
- Run MCP through frontend JavaScript: rejected because local process management belongs in the Tauri backend and would complicate desktop permissions.

## Decision: Keep server processes lazy and app-local

**Rationale**: Launching every server at app startup would slow startup and surprise users. Starting a server on connection test, tool refresh, or first tool call keeps behavior explicit. Keeping an active session while the app runs avoids re-spawning stateful servers for every call.

**Alternatives considered**:

- Start all enabled servers on app launch: rejected due startup cost and unexpected local process execution.
- Spawn a fresh process for every tool call: simpler but inefficient and potentially incompatible with stateful MCP servers.

## Decision: Use synthetic chat tool names with server ownership mapping

**Rationale**: Existing provider adapters require unique tool names. MCP servers can expose tools with names that collide with built-in tools or tools from other servers. A synthetic unique name lets the model call a safe identifier while the UI still shows the original server/tool identity.

**Alternatives considered**:

- Expose original MCP tool names directly: rejected because collisions make routing ambiguous.
- Reject colliding tools: too restrictive and makes common MCP tool names fragile.

## Decision: Convert MCP tool results into the existing text/structured tool-result path

**Rationale**: The current chat UI and provider message conversion already support tool results. Mapping MCP text and structured content into that path delivers the MVP without building rich result rendering first.

**Alternatives considered**:

- Build rich image/table result rendering in this feature: deferred because it is already a separate roadmap item and would expand scope.
- Hide tool results from transcript: rejected because users need transparency and diagnostics.

## Decision: Store configuration locally and redact diagnostics

**Rationale**: MCP configs may include commands, paths, and environment variables. The app already stores local configuration in SQLite. Diagnostics must not reveal full secret values, environment variable values, or credential-like output.

**Alternatives considered**:

- Store configs only in localStorage: rejected because provider and custom provider configs have moved to SQLite.
- Log raw server stderr for troubleshooting: rejected due secret leakage risk.
