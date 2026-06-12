# Feature Specification: Client Auto Update

**Feature Branch**: `003-client-auto-update`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "客户端自动更新,检测到有新版本,提醒用户更新,使用 Spec Kit 规划并列举风险点。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Notify Users About a New Version (Priority: P1)

用户启动 Claw 后,系统在后台检查是否有正式新版本。如果发现新版本,用户会看到清晰的更新提醒,包括新版本号、当前版本号和更新说明。

**Why this priority**: 自动更新的首要价值是让用户知道新版本存在,同时不打断当前工作。

**Independent Test**: 使用旧版本客户端连接到包含更高版本的更新源,确认启动后出现更新提醒,且用户可以选择稍后处理。

**Acceptance Scenarios**:

1. **Given** 当前客户端版本低于最新正式版本, **When** 用户启动应用, **Then** 系统展示新版本提醒并显示版本号和更新说明。
2. **Given** 用户正在使用应用, **When** 自动检查失败, **Then** 系统不阻塞聊天、设置或历史会话操作。
3. **Given** 用户点击“稍后”, **When** 更新提醒关闭, **Then** 系统不会开始下载或安装更新。

---

### User Story 2 - Manually Check From About Settings (Priority: P1)

用户打开设置页的“关于”区域,可以主动检查是否有新版本,并获得“可更新”“已是最新”或“检查失败”的明确结果。

**Why this priority**: 手动检查给用户可控入口,也便于排查自动检查未触发或网络异常的情况。

**Independent Test**: 打开设置页关于区域,点击“检查更新”,分别验证有更新、无更新和失败状态。

**Acceptance Scenarios**:

1. **Given** 用户打开“关于”, **When** 点击“检查更新”, **Then** 系统显示检查中状态并避免重复触发。
2. **Given** 没有新版本, **When** 检查完成, **Then** 用户看到“已是最新版本”。
3. **Given** 网络或更新源异常, **When** 检查失败, **Then** 用户看到可理解的失败提示。

---

### User Story 3 - Confirm, Download, Install, and Restart (Priority: P1)

用户确认更新后,系统下载并安装新版本,展示下载进度。安装完成后,系统提示用户重启应用以完成更新。

**Why this priority**: 提醒必须能闭环到安装完成,否则用户仍要手动前往 GitHub Release 下载。

**Independent Test**: 在旧版本客户端中点击立即更新,确认进度展示、安装完成提示和重启入口可用。

**Acceptance Scenarios**:

1. **Given** 有新版本提醒, **When** 用户点击“立即更新”, **Then** 系统开始下载并展示进度。
2. **Given** 下载或安装失败, **When** 操作中断, **Then** 用户看到错误提示且可以稍后重试。
3. **Given** 更新安装完成, **When** 用户点击重启, **Then** 应用重启并运行新版本。

### Edge Cases

- 更新源不可达、超时或被网络环境阻断。
- GitHub Release 缺少更新清单、平台资产或签名。
- 当前版本已经是最新版本。
- 用户在下载过程中关闭更新弹窗或应用。
- 更新安装完成但重启失败。
- 新版本需要数据迁移,但用户本地已有 SQLite、API Key、MCP 配置和会话历史。
- 多平台安装包行为不同,尤其 macOS universal、Windows MSI、Linux AppImage/deb。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST check for official release updates after application startup without blocking core app usage.
- **FR-002**: System MUST provide a manual update check entry in the About settings area.
- **FR-003**: System MUST show current version, available version, release notes, and update actions when an update is available.
- **FR-004**: System MUST require explicit user confirmation before downloading and installing an update.
- **FR-005**: System MUST show download progress while an update is being downloaded.
- **FR-006**: System MUST show a restart prompt after an update has been installed.
- **FR-007**: System MUST show a clear "already latest" result for manual checks when no update is available.
- **FR-008**: System MUST handle update check, download, install, and restart errors without blocking chat or settings usage.
- **FR-009**: System MUST use signed update artifacts for installation.
- **FR-010**: System MUST keep user data, settings, API Key metadata, MCP configuration, and conversations intact across updates.
- **FR-011**: System MUST use the existing GitHub Releases distribution channel for update discovery.
- **FR-012**: System MUST limit the first version of auto update to official releases, excluding prerelease channels.

### Key Entities

- **Update Check Result**: The outcome of checking the update source, including available update metadata, no-update state, or error state.
- **Available Update**: A release newer than the current app version with version number, notes, date, and platform-specific install artifact.
- **Update Progress**: User-facing download/install state used to show whether an update is waiting, downloading, installed, or failed.
- **Update Manifest**: The signed release metadata document served from the release channel for updater discovery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user on an older installed version can see an update prompt within 30 seconds of app startup when the update source is reachable.
- **SC-002**: A user can manually confirm whether the app is up to date from About settings in one click.
- **SC-003**: A user can start an update only after explicitly choosing the update action.
- **SC-004**: Download progress is visible within 2 seconds after the update download starts.
- **SC-005**: After successful install and restart, the About settings version matches the newly installed release version.
- **SC-006**: Existing conversations, API Key metadata, custom providers, MCP servers, prompts, and settings remain available after updating.

## Assumptions

- GitHub Releases remains the update source for Claw official desktop builds.
- Only stable releases are in scope for this feature; beta and prerelease channels are deferred.
- Automatic checks can be silent on failure, while manual checks must show the result.
- The update process requires signed artifacts and a public key embedded in the application.
- The updater private key is managed outside the repository through release environment secrets.
