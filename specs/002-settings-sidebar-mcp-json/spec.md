# Feature Specification: Settings Sidebar and MCP JSON Management

**Feature Branch**: `002-settings-sidebar-mcp-json`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "设置页做成类似 Cursor 的左侧功能栏 + 右侧内容区域；MCP 区域做成单个 server 列表展示；新增和编辑通过 JSON 弹窗完成；新增弹窗中的 JSON 应包含用户已添加的 MCP。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate Settings With a Sidebar (Priority: P1)

用户打开设置页后，通过左侧功能栏在 API Key、模型、提示词、工具、关于之间切换，右侧只显示当前功能内容。

**Why this priority**: 这是本次设置页体验重构的基础，后续 MCP 管理体验依赖更清晰的设置导航。

**Independent Test**: 打开设置弹窗，依次点击左侧功能入口，确认右侧内容随选择变化且已有设置功能仍可访问。

**Acceptance Scenarios**:

1. **Given** 设置弹窗已打开，**When** 用户点击左侧“工具”，**Then** 右侧显示工具与 MCP 管理内容。
2. **Given** 用户正在查看“模型”，**When** 用户点击“关于”，**Then** 右侧切换到关于内容且左侧高亮关于。
3. **Given** 设置弹窗宽度有限，**When** 用户查看侧栏和内容，**Then** 文案和按钮不互相遮挡。

---

### User Story 2 - Understand MCP Servers as a List (Priority: P1)

用户在工具页看到已安装 MCP Server 的列表，每个 server 独立展示名称、状态、工具数量、启用开关和常用操作。

**Why this priority**: MCP 配置是多条独立 server，列表形态比一个全局 JSON 框更容易理解当前状态。

**Independent Test**: 配置多个 MCP Server，确认每个 server 都作为独立条目展示，并能单独启用、测试、刷新、编辑、删除。

**Acceptance Scenarios**:

1. **Given** 用户已有多个 MCP Server，**When** 打开工具页，**Then** 每个 server 单独展示为列表条目。
2. **Given** 某个 server 工具发现成功，**When** 用户查看该条目，**Then** 能看到可用工具数量。
3. **Given** 某个 server 失败，**When** 用户查看该条目，**Then** 显示 `Error - Show Output` 并允许展开错误详情。

---

### User Story 3 - Add and Edit MCP Through JSON Dialog (Priority: P1)

用户点击 `New MCP Server` 打开 JSON 弹窗，弹窗展示完整 MCP JSON（包含现有 server），用户添加新配置后保存。用户也可以从某个 server 行打开同一类弹窗编辑配置。

**Why this priority**: 用户明确希望保留 JSON 作为配置入口，但需要更自然的新增/编辑路径。

**Independent Test**: 点击新增打开 JSON 弹窗，确认包含已有 MCP；追加新 server 后保存，确认新增成功；编辑已有 server 后保存，确认更新成功。

**Acceptance Scenarios**:

1. **Given** 用户已有一个 MCP Server，**When** 点击 `New MCP Server`，**Then** 弹窗中的 JSON 包含已有 server。
2. **Given** 用户在 JSON 中新增一个 server，**When** 保存，**Then** 系统新增该 server 且不删除已有 server。
3. **Given** 用户编辑已有 server 的 command 或 args，**When** 保存，**Then** 系统更新该 server 配置。
4. **Given** 用户从 JSON 中移除某个已有 server，**When** 保存，**Then** 系统不会隐式删除该 server。

### Edge Cases

- JSON 格式错误或不符合 MCP 配置结构。
- JSON 包含多个新增 server。
- JSON 省略已有 server。
- JSON 中已有 env key 的 value 为空字符串。
- JSON 中删除某个 env key。
- MCP Server 启用状态与 JSON 中 `disabled` / `enabled` 冲突。
- 失败 server 的错误信息过长或包含敏感值。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present settings as a sidebar navigation plus content area.
- **FR-002**: System MUST keep existing settings sections accessible: API Key, Models, Prompts, Tools, About.
- **FR-003**: System MUST display MCP Servers as individual list entries in the Tools section.
- **FR-004**: Each MCP Server entry MUST show name, enabled state, command summary, status, and tool count or failure state.
- **FR-005**: Users MUST be able to enable, disable, test, refresh, edit, and delete an MCP Server from its list entry.
- **FR-006**: System MUST provide a `New MCP Server` list entry that opens a JSON dialog.
- **FR-007**: The JSON dialog for adding MUST include a complete MCP JSON document containing existing MCP Servers.
- **FR-008**: The JSON dialog for editing MUST update the selected MCP Server when its JSON entry changes.
- **FR-009**: Saving JSON MUST create new servers and update existing servers by name.
- **FR-010**: Saving JSON MUST NOT delete existing servers that are absent from the JSON.
- **FR-011**: Exported JSON MUST preserve environment variable keys while leaving values blank.
- **FR-012**: Updating an MCP Server MUST preserve an existing environment variable value when the incoming value for the same key is blank.
- **FR-013**: Updating an MCP Server MUST remove an environment variable key when that key is omitted from the incoming JSON.
- **FR-014**: System MUST show actionable JSON parse or validation errors in the dialog without closing it.
- **FR-015**: System MUST keep MCP remote transports out of scope for this change.

### Key Entities

- **Settings Section**: A top-level settings destination displayed in the sidebar and rendered in the content area.
- **MCP Server List Entry**: A single visual row representing one saved MCP Server and its operations.
- **MCP JSON Document**: A user-editable JSON object with an `mcpServers` map used for create/update operations.
- **MCP JSON Dialog**: A modal editor for adding or editing MCP Server configuration through JSON.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch between any two settings sections in one click.
- **SC-002**: A user can identify every configured MCP Server and whether it is enabled without opening a JSON editor.
- **SC-003**: A user can add a new MCP Server through JSON without losing existing MCP Server entries.
- **SC-004**: A user can edit an existing MCP Server through JSON without retyping hidden environment variable values.
- **SC-005**: Failed MCP Servers expose an expandable diagnostic state from the list.
- **SC-006**: Existing API Key, model, prompt, tool, and about settings remain reachable after the layout change.

## Assumptions

- JSON-only MCP configuration remains the preferred editing model.
- The UI should be inspired by Cursor, not a pixel-perfect clone.
- Deleting MCP Servers remains an explicit list action, not a side effect of saving JSON.
- The frontend cannot read real environment variable values after saving, so blank env values in update payloads must preserve existing secrets.
- Only local command MCP Servers are supported in this feature.
