# Feature Specification: MCP Integration MVP

**Feature Branch**: `001-mcp-integration`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "为 claw-client 增加 MCP 集成 MVP：支持本地命令启动的 MCP server 配置、连接测试、工具发现、工具调用，并复用现有多 Provider tool-call 流程。第一阶段不实现远程 HTTP/SSE MCP，不做云同步。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add and Verify a Local MCP Server (Priority: P1)

用户在设置中新增一个本地 MCP server，填写名称、启动命令、参数和需要的环境变量，然后执行连接测试。测试通过后，用户能看到 server 的基本信息和它暴露的工具列表。

**Why this priority**: 没有可靠的 server 配置和连接测试，后续工具发现与聊天调用都无法被用户信任。

**Independent Test**: 使用一个只暴露简单工具的本地 MCP server，完成新增、保存、测试连接，并确认工具列表可见。

**Acceptance Scenarios**:

1. **Given** 用户尚未配置 MCP server，**When** 用户新增一个有效的本地 MCP server 并点击测试连接，**Then** 系统显示连接成功、server 信息和可用工具数量。
2. **Given** 用户输入的命令无效或启动失败，**When** 用户点击测试连接，**Then** 系统显示清晰的失败原因，并且不会把该 server 标记为可用。
3. **Given** MCP server 连接成功但没有暴露工具，**When** 用户查看该 server，**Then** 系统显示连接成功但工具列表为空，并提示该 server 暂无可用工具。

---

### User Story 2 - Use MCP Tools in Chat (Priority: P1)

用户启用某个 MCP server 后，在普通聊天中选择支持工具调用的模型。模型需要外部能力时，可以看到并调用该 server 暴露的工具，工具结果会回到对话中继续生成答案。

**Why this priority**: 这是 MCP 集成的核心价值，让本地外部能力真正进入聊天工作流。

**Independent Test**: 配置一个返回固定文本的 MCP 工具，在聊天中提出需要该工具的问题，确认模型能够调用工具并使用结果回答。

**Acceptance Scenarios**:

1. **Given** 一个已启用且工具发现成功的 MCP server，**When** 用户发起需要该工具的对话，**Then** 模型可选择调用对应工具，并在收到结果后继续完成回答。
2. **Given** MCP 工具调用返回错误，**When** 聊天流程继续，**Then** 用户能看到工具调用失败信息，模型收到错误结果后可以解释或尝试替代方案。
3. **Given** 用户禁用了某个 MCP server，**When** 用户开始新一轮聊天，**Then** 该 server 的工具不会出现在模型可调用工具列表中。

---

### User Story 3 - Manage MCP Servers Safely (Priority: P2)

用户可以查看、启用、禁用、编辑和删除 MCP server。每个 server 的状态、最近一次连接测试结果和工具发现结果都能被清楚展示，避免用户不知道当前聊天能调用哪些外部能力。

**Why this priority**: MCP server 往往连接本机文件、开发工具或私有服务；管理状态必须清楚，才能避免误用和排障困难。

**Independent Test**: 新增两个 MCP server，分别启用和禁用它们，编辑其中一个配置，再删除另一个，确认聊天可用工具随状态变化。

**Acceptance Scenarios**:

1. **Given** 用户已有多个 MCP server，**When** 用户禁用其中一个，**Then** 该 server 的工具立即从后续聊天可用工具中移除。
2. **Given** 用户编辑了 MCP server 的启动配置，**When** 用户保存并重新测试连接，**Then** 系统使用新配置重新判断可用性和工具列表。
3. **Given** 用户删除 MCP server，**When** 删除确认完成，**Then** 该 server 配置、状态和工具列表不再显示，后续聊天不再使用它。

---

### User Story 4 - Diagnose MCP Runtime Problems (Priority: P3)

当 MCP server 在启动、握手、工具发现或工具调用过程中失败时，用户能看到可执行的诊断信息，例如启动失败、响应超时、协议不兼容、工具参数不合法或调用被 server 拒绝。

**Why this priority**: MCP 生态 server 差异较大，诊断信息决定用户能否自己修复配置问题。

**Independent Test**: 分别使用无效命令、超时 server、返回错误的工具，确认界面能区分错误阶段并给出不泄漏敏感信息的提示。

**Acceptance Scenarios**:

1. **Given** MCP server 启动超时，**When** 用户测试连接，**Then** 系统显示超时阶段和建议检查的配置项。
2. **Given** MCP 工具调用返回结构化错误，**When** 用户查看聊天中的工具结果，**Then** 系统显示可理解的错误摘要，并保留对模型可用的错误结果。
3. **Given** 错误信息中包含环境变量或凭据片段，**When** 系统展示错误，**Then** 敏感值被脱敏或省略。

### Edge Cases

- MCP server 进程启动后没有按预期完成初始化。
- MCP server 成功连接，但声明不支持工具能力。
- MCP server 工具列表在会话期间发生变化。
- MCP server 暴露的工具名与内置工具或其他 MCP 工具重名。
- MCP 工具参数 schema 缺失、过宽或包含当前模型不容易理解的描述。
- MCP 工具调用耗时过长、卡住或返回超大结果。
- 用户在聊天进行中禁用或删除正在使用的 MCP server。
- MCP server stderr 或错误信息包含本机路径、环境变量或凭据片段。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create a local MCP server configuration with a user-facing name, launch command, optional arguments, optional working directory, optional environment variables, and enabled state.
- **FR-002**: System MUST persist MCP server configurations locally so they remain available after app restart.
- **FR-003**: Users MUST be able to edit, enable, disable, and delete saved MCP server configurations.
- **FR-004**: System MUST provide a connection test action for each MCP server configuration.
- **FR-005**: Connection testing MUST report whether initialization succeeded, whether the server supports tools, and how many tools were discovered.
- **FR-006**: System MUST discover and display each enabled server's available tools with name, description, input requirements, and owning server.
- **FR-007**: System MUST prevent disabled MCP servers from contributing tools to future chat requests.
- **FR-008**: System MUST include enabled and successfully discovered MCP tools in chat tool availability when the current model and conversation settings allow tool use.
- **FR-009**: System MUST route model-requested MCP tool calls to the owning MCP server and return the result to the conversation.
- **FR-010**: System MUST display MCP tool call progress, success, and failure states in the chat transcript in a way consistent with existing tool results.
- **FR-011**: System MUST preserve the existing built-in tool behavior while adding MCP tools.
- **FR-012**: System MUST distinguish tools with the same public name by server ownership so calls are routed to the intended tool without ambiguity.
- **FR-013**: System MUST time out server startup, tool discovery, and tool invocation when they exceed reasonable user-facing waiting limits.
- **FR-014**: System MUST show actionable, sanitized errors for startup, initialization, discovery, and invocation failures.
- **FR-015**: System MUST avoid displaying full secret values from environment variables, command arguments, or server output.
- **FR-016**: System MUST allow users to refresh a server's tool list after configuration changes or server updates.
- **FR-017**: System MUST handle tool list changes without requiring users to recreate the server configuration.
- **FR-018**: System MUST exclude remote HTTP/SSE MCP server configuration from this MVP.
- **FR-019**: System MUST exclude cloud sync of MCP server configurations from this MVP.
- **FR-020**: System MUST exclude MCP resources, prompts, sampling, elicitation, and task management from this MVP unless they are needed only to safely ignore unsupported server capabilities.

### Key Entities

- **MCP Server Configuration**: A locally saved server entry with display name, launch settings, enabled state, last test status, and timestamps.
- **MCP Server Status**: The latest observed connection and discovery result, including success/failure phase, server identity if available, supported capabilities, tool count, and sanitized diagnostic message.
- **MCP Tool**: A callable capability exposed by an MCP server, with server ownership, public name, description, input schema, availability state, and last refresh time.
- **MCP Tool Invocation**: A single tool call requested during chat, including the target server, target tool, input, status, result summary, error summary, and timing.
- **MCP Tool Result**: The content returned from a tool invocation and passed back into the conversation, including success or error state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can add, save, test, and enable a valid local MCP server in under 2 minutes.
- **SC-002**: At least 95% of successful connection tests show discovered tool names and descriptions within 5 seconds for a server exposing 20 or fewer tools.
- **SC-003**: In a controlled test with a simple MCP server, the user can complete a chat flow where the model calls one MCP tool and uses the result in the final answer.
- **SC-004**: Disabling an MCP server removes its tools from subsequent chat requests without requiring app restart.
- **SC-005**: 100% of displayed MCP errors avoid revealing full environment variable values or credential-like strings.
- **SC-006**: Built-in file tools continue to work in existing tool-enabled conversations after MCP tools are added.
- **SC-007**: Users can identify which MCP server owns each available tool before enabling or relying on it.
- **SC-008**: Failed server startup, failed tool discovery, and failed tool invocation each produce distinct user-facing error categories.

## Assumptions

- The first release targets local command-launched MCP servers only.
- Remote MCP transports are intentionally deferred until after the local server workflow is stable.
- Users who configure MCP servers understand that local servers may access local resources depending on the server they choose to run.
- MCP server configuration is local to the current desktop app installation.
- Existing chat tool settings remain the top-level user control for whether tools can be exposed to models.
- The feature should reuse current provider-agnostic tool calling behavior from a user perspective.
- Tool results are text or structured content in the MVP; rich visual rendering can be handled by a later feature.
