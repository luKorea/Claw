# 安全规范

继承自 `~/.claude/CLAUDE.md`，针对 `claw-client` 项目的具体落地。

## 强制规则

### 1. API Key 存储

- **唯一来源**：操作系统 Keychain（macOS Keychain / Windows Credential Manager / Linux Secret Service）。
- **写入入口**：`src-tauri/src/commands/settings.rs` 的 `set_api_key` 命令。
- **写入校验**：
  - 必须以 `sk-` 开头
  - 去除前后空白
  - 长度合理（不强制上限，但异常短值会提示）
- **读取限制**：`get_api_key` 命令**仅在发起 Anthropic 请求时**调用，返回的明文 Key 用完即丢，**禁止缓存**到 React state、localStorage、IndexedDB、文件等任何地方。
- **前端状态**：仅保留 `configured: boolean` + `preview: 'sk-…1234'`，不持有明文。
- **日志脱敏**：任何日志 / 错误信息 / Sentry 上报都不得包含 Key 的明文或前缀 + 后 4 位以外的片段。

### 2. 文件系统访问

所有文件操作必须经过 `src-tauri/src/commands/tool.rs::safe_resolve` 的白名单检查。

允许的根目录：

- `$HOME`（用户主目录）
- `$DESKTOP`（桌面）
- `$DOCUMENT`（文档）
- `$DOWNLOAD`（下载）
- `$TEMP`（临时）

**禁止**扩大到其他位置。如有需要，提 RFC 讨论。

### 3. 危险工具

- `write_file` 默认**禁用**，用户在 Settings → 工具 中显式启用。
- 写文件时**先创建父目录**，但**不**自动覆盖同名文件以外的行为（如删除）。
- 写文件大小限制在合理范围（默认无硬限制，但 UI 应提示）。

### 4. CSP

`tauri.conf.json` 的 `app.security.csp` 严格限制：

```text
default-src 'self';
connect-src 'self' ipc: http://ipc.localhost https://api.anthropic.com;
img-src 'self' data: https:;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com;
script-src 'self';
```

新增外链（CDN、字体、统计）需更新 CSP 并说明理由。

### 5. 用户输入渲染

- **禁止**使用 `dangerouslySetInnerHTML` / `v-html` / `innerHTML` 直接渲染用户输入。
- 改用 `react-markdown` 等安全的 Markdown 渲染器。
- 任何 XSS 风险点都要在 PR 中标注。

### 6. 依赖安全

- 提交前 `pnpm audit`，高危漏洞必须修复或加 workaround。
- 升级依赖时优先 patch 更新，避免 minor / major 引入未审查的 breaking change。
- 内部包（若有）走专用 registry，不在 `package.json` 里混用。

### 7. 调试痕迹

- 生产构建关闭 devtools（默认 `tauri build` 行为）。
- 不要在 `console.log` 中打印：
  - API Key（含部分）
  - 用户消息内容（即使是用户自己输入的）
  - 完整 tool_result（可能含敏感文件内容）
- 错误信息要脱敏：把 `path/to/file` 中的 HOME 路径替换为 `~`。

## 检查清单（提交前）

- [ ] 无硬编码的 Key / Token / 密码
- [ ] 无新增 `dangerouslySetInnerHTML` / `v-html`
- [ ] CSP 未被弱化
- [ ] 文件工具仍走 `safe_resolve` 白名单
- [ ] 无生产可用的 devtools
- [ ] 错误处理不暴露内部路径 / 堆栈给终端用户（仅 console）
