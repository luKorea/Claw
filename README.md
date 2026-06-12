# Claw

> 多 Provider AI 桌面客户端 · Tauri 2 + React 19 + TypeScript

一个面向个人使用的多 Provider AI 桌面聊天客户端，支持 Anthropic / DeepSeek / OpenAI / MiniMax、自定义兼容模型、多模型切换、思考模式、流式输出、Markdown 渲染、会话历史、系统提示词预设、文件工具。

## ✨ 功能

- 🧠 **多 Provider / 多模型**：Anthropic / DeepSeek / OpenAI / MiniMax / 自定义兼容模型切换
- 💭 **扩展思考**（Extended Thinking）：可调预算的深度思考
- ⚡ **流式输出**：基于 Anthropic SDK / OpenAI 兼容 SSE / Tauri Rust 桥接，逐块渲染
- 📝 **Markdown + 数学公式**：GFM 表格、任务列表、KaTeX 公式
- 💾 **本地持久化**：SQLite 存会话、消息、提示词预设
- 🔐 **API Key 本机配置**：写入本机 `app_data_dir/claw.db`，不进入前端 localStorage 或日志
- 📋 **系统提示词**：内置 4 个预设，支持自定义与变量占位
- 🛠️ **多轮工具调用**：内置 `read_file` / `list_dir` / `write_file`，可启用 / 禁用，工具结果会回传模型继续推理
- 🔌 **MCP 本地工具**：支持配置本地命令启动的 MCP Server，连接测试、工具发现、启停、刷新、删除和聊天调用
- ⌨️ **快捷键**：`⌘+N` 新建、`⌘+,` 设置、`Esc` 停止

## 🛠️ 技术栈

- **桌面壳**：Tauri 2（Rust 后端）
- **前端**：React 19 + TypeScript 5（strict）+ Vite 6
- **样式**：Tailwind CSS 4 + shadcn/ui
- **状态**：Zustand 5
- **数据**：Provider API + SQLite（sqlx）
- **UI 库**：Radix UI + lucide-react + KaTeX

## 🚀 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发模式（需要 Rust 工具链）
pnpm tauri dev

# 3. 打包发布
pnpm tauri build
```

首次启动会引导你配置默认模型对应 Provider 的 API Key（写入本机 Claw 配置文件）。

## 📁 项目结构

```
src/
├── components/
│   ├── ui/                  # shadcn 原子组件
│   ├── chat/                # 聊天区组件
│   ├── sidebar/             # 侧边栏
│   ├── settings/            # 设置
│   └── prompts/             # 提示词管理
├── hooks/                   # useChat / useSettings / useConversations / usePrompts
├── lib/                     # providers / streaming / keyring / db / tools / prompts
├── stores/                  # Zustand stores
├── styles/                  # Tailwind 入口
└── types/                   # 共享类型

src-tauri/
├── src/
│   ├── commands/            # Tauri commands（keyring / db / tools / provider bridge）
│   ├── db/                  # SQLite 池 + 迁移
│   └── ...
├── capabilities/            # 权限声明
├── icons/                   # 应用图标
└── tauri.conf.json
```

## 🔑 API Key 本机配置

- Key 写入本机 `app_data_dir/claw.db` 的 `api_keys` 表；脱敏预览（sk-…1234）只用于 UI 状态展示。
- 打开应用、打开设置、获取模型和发送消息不再读取系统 Keychain，避免 macOS 本机密码反复弹窗。
- 旧版本保存在 Keychain 的 Key 不会自动扫描；可在设置页点击“导入旧 Key”手动迁移一次。
- 前端不把明文 Key 写入 localStorage、README、日志或错误信息。
- 自定义 Provider 配置同样存入 SQLite，可通过“获取模型”拉取并保存多个可选模型；聊天支持自动/流式/非流式模式，并提供“测试聊天”诊断入口。

## 🔌 Provider

- 内置 Provider：Anthropic / DeepSeek / OpenAI / MiniMax。
- DeepSeek / OpenAI 走 OpenAI 兼容协议，MiniMax 走 Anthropic 兼容协议并通过 Rust command 桥接，避免 WebView CORS。
- 自定义模型支持 OpenAI 兼容和 Anthropic 兼容接口；API Base URL 必须是 HTTPS，或本地 `localhost` HTTP。
- DeepSeek / OpenAI 会尝试拉取 `/v1/models` 动态模型列表；Anthropic / MiniMax 使用内置模型列表。

## ✅ 验证

```bash
pnpm typecheck
pnpm lint
pnpm test:run
(cd src-tauri && cargo test --lib)
pnpm build
```

真实 Provider 联网冒烟测试需显式执行，会读取环境变量或本机 `claw.db` 中已配置的 Provider Key，并对每个 Provider 发送一条极短请求：

```bash
pnpm test:real-providers
```

- 不会打印 API Key 或 Authorization header。
- 默认读取本机 `app_data_dir/claw.db`；也可通过 `CLAW_DB_PATH=/path/to/claw.db` 指定数据库。
- 旧 Keychain 读取默认关闭；如需兼容旧安装，可设置 `CLAW_SMOKE_USE_KEYCHAIN=1`。
- 也可用 `CLAW_DEEPSEEK_API_KEY` / `CLAW_OPENAI_API_KEY` / `CLAW_ANTHROPIC_API_KEY` / `CLAW_MINIMAXI_API_KEY` 临时覆盖。
- 可用 `CLAW_SMOKE_PROVIDERS=deepseek,openai` 限定测试 Provider。
- 未发现任何 Key 时退出码为 `2`；自动化环境可加 `CLAW_SMOKE_ALLOW_EMPTY=1` 将其视为跳过。

## ⚙️ 系统提示词

内置 4 个预设：

- 通用助手
- 代码审查
- 翻译助手
- 总结助手

支持自定义预设、内容变量（如 `{{language}}`）、一键应用到新会话。

## 🛠️ 工具

| 工具         | 用途                 | 范围                             |
| ------------ | -------------------- | -------------------------------- |
| `read_file`  | 读取文本文件（≤1MB） | HOME / 桌面 / 文档 / 下载 / 临时 |
| `list_dir`   | 列出目录             | 同上                             |
| `write_file` | 写入 / 新建文本文件  | 同上（默认禁用，需手动启用）     |

所有文件操作都限制在白名单目录内，危险操作会标记。

### MCP 本地 Server

- 设置 -> 工具中可新增本地命令启动的 MCP Server，例如 `npx -y <server-package> ...`。
- 连接测试会执行最小 MCP 初始化、`tools/list` 工具发现，并把工具列表保存到 SQLite。
- 启用且测试成功的 MCP 工具会和内置工具一起暴露给支持 tool calling 的模型。
- 聊天调用 MCP 工具时由 Rust 后端执行 `tools/call`，结果会作为 `tool_result` 回传模型。
- 当前 MVP 仅支持本地 command-launched MCP Server；远程 HTTP/SSE transport、resources、prompts、sampling 暂不支持。
- 诊断信息会脱敏环境变量和 secret-like 内容；禁用、删除、超时、调用失败会返回可控错误结果。

## 📦 打包

```bash
# 当前平台 release
pnpm tauri build

# 仅 macOS universal
pnpm tauri build --target universal-apple-darwin

# macOS / Linux 交叉编译 Windows NSIS（需先安装 cargo-xwin）
cargo install cargo-xwin
rustup target add x86_64-pc-windows-msvc
pnpm build:tauri:windows:cross
```

产物：

- macOS: `src-tauri/target/release/bundle/dmg/*.dmg` + `.app`
- Windows: `src-tauri/target/release/bundle/msi/*.msi`
- Linux: `src-tauri/target/release/bundle/appimage/*.AppImage`

`bundle.targets = "all"` 表示“当前运行系统支持的全部 bundle”，不是一次生成三端产物。正式版本下载入口：

https://github.com/luKorea/Claw/releases

发布触发方式：推送 `v*` tag，例如 `v0.1.1`。GitHub Actions 会在 Windows / macOS / Linux 三个平台构建，并把安装包直接上传到对应 Release：

- Windows: `.msi` / `.exe`
- macOS: universal `.dmg`
- Linux: `.AppImage` / `.deb`

本机 macOS 交叉编译只能生成 NSIS `.exe`，MSI 仍建议在 Windows runner 上构建。

当前 macOS 产物未做 Apple 签名与 notarization，首次打开时可能出现系统安全提示。

## 📝 路线图

- [x] 多 Provider / 自定义 Provider
- [x] MiniMax Rust 流式桥接
- [x] 多轮工具调用
- [x] MCP 本地 command Server 集成 MVP
- [x] GitHub Releases 多平台发布
- [x] 真实 Provider 联网冒烟验证（DeepSeek 已通过；其他 Provider 按需验证）
- [ ] MCP 远程 transport（HTTP / SSE）与非工具能力
- [ ] 项目级 context（`.claude` 文件夹）
- [ ] 富媒体工具结果可视化（图片、表格）
- [ ] 云同步
- [ ] 国际化

## 许可

MIT
