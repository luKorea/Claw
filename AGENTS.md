# Claw Agent 开发指南

本文件是 `claw-client` 项目的 Agent 主文档，供 Claude Code、Codex、其他 AI Agent 共用。适用范围为仓库根目录及其所有子目录。

## 文档维护约定

- 本文件维护项目上下文、目录结构、架构说明、多端构建注意事项和 Agent 工作规则。
- 专项能力放在 `.claude/skills/`，执行对应任务前必须先阅读并遵守技能说明。
- 可独立维护的专项规则放在 `.claude/rules/`，不要把规则全文重复复制到本文件。
- 团队组件库、工具库、编码规范以官方文档 / MCP 查询结果为准，不凭记忆编写内部 API。
- 修改本文档时优先补充稳定规则，避免写入临时需求、个人偏好或只适用于单次任务的内容。

## 对话与执行原则

- 默认使用中文回复，表达简洁，但需要说明改动、验证结果和风险时不要只输出代码。
- 事实优先。如果需求、代码或文档互相矛盾，先以仓库现状和可验证证据为准，并指出矛盾点。
- 执行任务前先快速阅读相关目录和相邻实现，延续当前模块风格，不做无关重构。
- 只改与任务直接相关的文件；遇到已有未提交改动时，视为用户改动，不能回滚或覆盖。
- 不确定会影响公共模块、线上环境、数据安全时，先确认再动手。

## 项目概述

- **项目名称**：`claw-client`，多 Provider AI 桌面客户端（v1.1+）。
- **支持的 Provider**：Anthropic / DeepSeek / OpenAI / MiniMax（v1.1+）。DeepSeek 与 MiniMax 走 OpenAI 兼容协议。
- **技术栈**：Tauri 2（Rust 后端）+ React 19 + TypeScript 5（strict）+ Vite 6 + Tailwind CSS 4 + Zustand 5。
- **目标平台**：macOS / Windows / Linux 桌面端。**仅桌面端**，不要混入移动端或 H5 特殊处理。
- **包管理器**：`pnpm`（与 `pnpm-lock.yaml` 保持一致）。
- **Node 要求**：>= 20。
- **Rust 工具链**：stable + cargo。
- **页面 / 路由**：无传统路由，单页应用 + 状态切换视图。URL 不暴露会话结构。
- **后端命令**：集中在 `src-tauri/src/commands/`，前端通过 `@tauri-apps/api/core` 的 `invoke` 调用。
- **本地存储**：
  - **API Key**：操作系统 Keychain（macOS Keychain / Windows Credential Manager / Linux Secret Service）。前端永不留存明文。
  - **会话 / 消息 / 提示词 / MCP 配置**：SQLite（`app_data_dir/claw.db`，WAL 模式）。
  - **K/V 设置**：`tauri-plugin-store`（`localStorage` fallback）。
  - **主题 / 工具启用 / 默认参数**：`localStorage`。
- **构建产物**：
  - 前端：`dist/`
  - 桌面：`src-tauri/target/release/bundle/{dmg,msi,appimage,deb,...}/`
  - 不应随业务代码提交。

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式（启动 Tauri 窗口 + Vite HMR）
pnpm tauri dev

# 类型检查
pnpm typecheck

# 代码质量（lint + format check）
pnpm lint
pnpm format:check

# 构建
pnpm build                 # 仅前端
pnpm tauri build           # 桌面端 release 包

# 修复 lint 问题
pnpm lint:fix
pnpm format
```

## 目录结构

```text
claw-client/
├── src/                          # React 前端
│   ├── components/
│   │   ├── ui/                   # shadcn 原子组件（不要随意修改，通过 shadcn CLI 升级）
│   │   ├── chat/                 # 聊天区组件
│   │   ├── sidebar/              # 侧边栏
│   │   ├── settings/             # 设置 Tab 内的子组件
│   │   ├── prompts/              # 提示词管理
│   │   └── ErrorBoundary.tsx
│   ├── hooks/                    # useChat / useSettings / useConversations / usePrompts
│   ├── lib/                      # 业务封装（anthropic / streaming / keyring / db / tools / prompts）
│   ├── stores/                   # Zustand stores
│   ├── styles/globals.css        # Tailwind 4 入口 + shadcn 主题变量
│   ├── types/                    # Claude / Conversation / Tool 类型
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── commands/             # Tauri commands（keyring / db / prompt / tool）
│   │   ├── db/                   # SQLite 池 + 迁移
│   │   ├── error.rs
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── capabilities/default.json # 权限声明
│   ├── icons/                    # 应用图标（占位，正式发布前替换）
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── .claude/
│   ├── rules/                    # 专项规则
│   └── skills/                   # 专项技能（如有）
├── .agent-context/current/       # 精准上下文
├── public/                       # 静态资源
├── components.json               # shadcn 配置
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 后端命令（src-tauri/src/commands/）

| 模块 | 命令 | 说明 |
| --- | --- | --- |
| `settings` | `get_api_key_status(provider)` | 查询某 provider 是否已配置 + 脱敏预览；旧 v1.0 `anthropic-api-key` 视为 `anthropic` |
| `settings` | `set_api_key(provider, key)` | 写入 Keychain（校验 `sk-` 前缀）；首次写 anthropic 时自动删 LEGACY_ACCOUNT |
| `settings` | `delete_api_key(provider)` | 清除某 provider 的 Key |
| `settings` | `get_api_key(provider)` | **临时**取出明文 Key（仅发起请求时用） |
| `settings` | `list_configured_providers()` | 启动时前端调用,列出已配 key 的 provider id |
| `conversation` | `list_conversations` / `get_conversation` / `create_conversation` / `update_conversation` / `delete_conversation` | 会话 CRUD |
| `conversation` | `list_messages` / `save_message` / `delete_message` | 消息 CRUD |
| `prompt` | `list_prompt_presets` / `create_prompt_preset` / `update_prompt_preset` / `delete_prompt_preset` | 提示词预设 |
| `tool` | `read_text_file` / `list_dir` / `write_text_file` / `pick_directory` | 文件工具（白名单目录） |

新增 command 必须同步：

1. 在 `commands/<module>.rs` 实现 + 单元测试（如果能写）
2. 在 `lib.rs` 的 `invoke_handler` 注册
3. 在前端 `lib/<module>.ts` 加 wrapper
4. 更新本文件表格

Keychain 命名规则（v1.1+）：

- SERVICE = `com.claw.client`（与 `tauri.conf.json.identifier` 一致）
- account = `api-key:{provider}`（v1.0 旧 `anthropic-api-key` 自动迁移）

## 关键设计决策

### 1. 多 Provider 架构（v1.1+）

每个 provider 实现 `ProviderAdapter` 接口（`src/lib/providers/types.ts`），内部消化 SDK 事件 / SSE 协议 / tool schema / reasoning 语义，对外只暴露 `AsyncIterable<AdapterEvent>`。useChat 与 `streaming.ts` 不感知 provider 差异。

- Anthropic：`@anthropic-ai/sdk` + `AnthropicAdapter`（`providers/anthropic.ts`），thinking 走 `thinking: { type: 'enabled', budget_tokens }`
- DeepSeek / OpenAI / MiniMax：原生 `fetch` + ReadableStream SSE 解析（`providers/openai-compatible.ts`），共享 driver；各家 adapter 仅注入 baseURL + provider 标识,Key 统一 `sk-` 前缀
- DeepSeek-R1 与 MiniMax-M2.7 走 `reasoning_content` 字段流式回 reasoning
- 工具 schema 用 OpenAI 风格 `parameters`（JSON Schema），Anthropic adapter 内部转 `input_schema`

流式仍走 SDK / WebView，不绕到 Rust 端。各 provider 必须在浏览器 CORS 允许范围内（已通过 CSP 白名单）。

### 2. 流式输出走 SDK + Tauri WebView

直接用各 provider 的 SDK 或原生 fetch，不绕到 Rust 端。Tauri WebView 不拦截浏览器 CORS。
**前提**：各 provider API 支持浏览器 CORS；CSP `connect-src` 显式白名单三个域名。

### 3. 多轮工具调用

`useChat` 内部维护一个 `round` 循环（`MAX_TOOL_ROUNDS = 5`）：

1. 构造 AdapterRequest（归一化 messages + tools + thinking）
2. `adapter.stream(req, apiKey, signal)` 拿 `AsyncIterable<AdapterEvent>`
3. `consumeStream()` 把 AdapterEvent 组装为 `ContentBlock[]`
4. 如果有 `tool_use` block：执行工具、收集 `tool_result`、附加为下一轮 `role: 'tool'` 消息
5. 直到模型不再调用工具或达到上限

Anthropic 协议：tool_result 合并到 user turn 的 content blocks。
OAI 协议：tool 结果是独立的 `role: 'tool'` message（由 adapter 内部转换）。

### 4. thinking / reasoning 模式

- 由 `ModelInfo.supportsThinking` 决定（`src/types/providers.ts`）
- Anthropic：`thinking: { type: 'enabled', budget_tokens: N }`；强制 `max_tokens > budget_tokens`，`resolveAnthropicMaxTokens()` 保证
- DeepSeek-R1：`reasoning_content` 字段流式回 → 映射为 `thinking_delta`
- OpenAI o-series：reasoning 单独计 `reasoning_tokens`；max_tokens 仍走 OpenAI 协议
- `claude-haiku-4-5-20251001` 等不支持的模型：`useChat` 在构造请求时跳过 thinking 字段

### 5. Markdown 渲染

`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`。
代码块用自定义 `CodeBlock` 组件（带语言标签 + 复制按钮）。
**不要**使用 `dangerouslySetInnerHTML` 渲染用户输入 — 安全规则强制。

### 6. 状态持久化层级

- **会话 / 消息**：SQLite（必须可恢复）。`messages.content` 是 ContentBlock[] JSON 字符串，跨 provider 可读。
- **设置（API Key 之外）**：`localStorage`（v1.1: `claw.settings.v2` 含 `defaultModel` 跨 provider）。v1.0 的 `claw.settings.v1` 首次启动时迁移到 v2。
- **主题 / 工具启用**：`localStorage`
- **派生状态（流式中间态）**：Zustand 内存，不持久化

## 测试义务(强制)

所有新增 / 修改的**业务代码**必须同时提交单元测试,不允许"代码先行,测试后补"。

- **覆盖范围**:
  - 前端 `src/lib/**/*.ts` / `src/stores/**/*.ts` / `src/hooks/**/*.ts` — **必测**(纯函数 / store 逻辑 / hook 副作用)
  - 前端 `src/components/**/*.tsx` — 业务组件(非 shadcn 原子)必测;shadcn UI 原子组件豁免
  - 前端 `src/types/**/*.ts` — 纯类型无运行时逻辑的豁免,带函数 / 工具的必测
  - Rust `src-tauri/src/commands/**/*.rs` — 每个 `pub fn` 必测(纯函数单测,集成测可不写)
  - Rust `src-tauri/src/db/**`、`error.rs`、`lib.rs` — 视情况,**纯函数必须测**
- **测试约定**见 `.claude/rules/unit-test.md`(文件位置、命名、mock 原则、豁免流程)
- **豁免申请**:特殊情况(纯类型 / 仅触发 UI 抖动 / 已 mock 的三方 SDK)在 PR 描述里写明"测试豁免理由",不要静默不写测试
- **执行流程**:
  1. 写代码
  2. 写测试,跑 `pnpm test:run` 看到对应 `*.test.ts` 出现在输出
  3. 准备交付前必须 `pnpm test:run` 全绿 + 4 件套验证
  4. 改公共模块 / 重构已有逻辑时,**同步补充**已缺测试的边界 case
- **失败处理**:PR 提交前自检 `pnpm test:run` + `cargo test --lib` 全绿;若带新文件无对应测试,review 阶段打回

## 编码规范

继承自 `~/.claude/CLAUDE.md`：

- TypeScript strict 模式，**禁止裸 `any`**。需要时用 `unknown` + 类型守卫。
- 接口命名不加 `I` 前缀（`User`，不是 `IUser`）。
- 公共函数 / hook 必须写 JSDoc。
- TODO 格式：`// TODO(2026-07): #issue 待优化`。
- React 组件用 PascalCase，文件用 kebab-case（`MessageList.tsx`）。
- 私有函数用 `useCallback` 包装，避免 React 警告。
- 严禁 `v-html` / `dangerouslySetInnerHTML` 处理用户输入。
- 严禁硬编码 API Key、Token、密码。

## 安全规则（强制）

- API Key 只通过 `get_api_key` 临时取出，**不在前端任何地方长期缓存**。
- 文件工具的路径必须经过 `commands/tool.rs::safe_resolve` 白名单检查。
- 写文件默认禁用，需用户在 Settings → 工具 中显式启用。
- CSP 严格限制（见 `tauri.conf.json`）：`connect-src` 只允许 `https://api.anthropic.com` / `https://api.deepseek.com` / `https://api.openai.com` / `https://api.minimaxi.com`（v1.1+）。新增 provider 域名需同步更新 CSP 并在本文件记录。
- 不在生产构建开启 devtools。

## Git 规范

遵循 Conventional Commits。`<type>(<scope>): <subject>`，scope 建议：`apikey` / `chat` / `tools` / `prompts` / `tauri` / `ui` / `deps` / `docs`。
完整规则见 `.claude/rules/git-commit.md`。

## 验证清单

- 改 React 组件：`pnpm typecheck`
- 改 Rust 后端：`cargo check` 在 `src-tauri/`
- 改公共逻辑（hooks / lib / stores）：`pnpm typecheck && pnpm lint`
- 改公共逻辑 / 新增功能：`pnpm typecheck && pnpm lint && pnpm test:run`
- 改 `tauri.conf.json` / `Cargo.toml`：`pnpm tauri dev` 验证窗口启动
- 准备交付：`pnpm lint && pnpm build && pnpm tauri build`

## 多端口说明

v1 **仅桌面端**（macOS / Windows / Linux）。不要添加 iOS / Android / H5 特殊处理。
打包命令：

- 当前平台：`pnpm tauri build`
- macOS universal：`pnpm tauri build --target universal-apple-darwin`

## 公共模块边界

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 运行时配置 | `src-tauri/tauri.conf.json` / `Cargo.toml` | 窗口、CSP、依赖 |
| 权限声明 | `src-tauri/capabilities/default.json` | 文件系统 / 弹窗 / SQL 范围 |
| Keychain | `src-tauri/src/commands/settings.rs` | API Key 唯一入口,多 account (`api-key:{provider}`) |
| 数据库 | `src-tauri/src/db/` | 迁移、连接池 |
| 工具执行 | `src-tauri/src/commands/tool.rs` | 路径白名单 |
| 流式核心 | `src/hooks/useChat.ts` | 多轮 tool_use 循环 + 选 adapter |
| Provider 抽象 | `src/lib/providers/` | `ProviderAdapter` 接口 + Anthropic / OAI 兼容 driver |
| 流式归一化 | `src/lib/streaming.ts` | 消费 `AdapterEvent`,组装 ContentBlock[] |
| 消息转换 | `src/lib/providers/messages.ts` | ChatMessage ↔ AdapterMessage |
| 模型注册表 | `src/types/providers.ts` | `ProviderId` / `ModelInfo` / `getModelInfo()` |
| 工具定义 | `src/lib/tools/builtin.ts` | Tool schema (provider-agnostic, `parameters` 字段) |
| shadcn 原子组件 | `src/components/ui/*` | 通过 shadcn CLI 升级，不要手改 |

## 精准上下文

复杂任务、长会话、跨会话恢复时使用 `.agent-context/current/`。
触发条件与文件结构详见 [precise-context skill](~/.claude/skills/precise-context/SKILL.md)。

## 注意事项

1. 禁止提交明文 API Key、Token、密码。
2. 任何 `dangerouslySetInnerHTML` / `v-html` 都要先过 ReactMarkdown 或转义。
3. 改 `useChat` 时检查多轮 tool_use 循环的边界（最多 5 轮）。
4. 改 `commands/tool.rs` 时保持 `safe_resolve` 白名单检查，**不要**扩大路径范围。
5. 不要在 `useChat` / `useSettings` 里直接读 `localStorage` 同步状态，统一走 store。
6. 新增依赖前先看 `node_modules` 是否已有等价物，**不引入重复能力的小型库**。
7. 新增 Provider：在 `src/lib/providers/` 加 adapter 文件 + 在 `types.ts` / `ALL_PROVIDERS` 同步注册 + 改 CSP `connect-src` + 更新本文件表格。
8. 新增功能 / UI 必须同步提交单元测试，见 "测试义务" 节；没有测试的代码不进入 main。
