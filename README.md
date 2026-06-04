# Claw

> Claude API 桌面客户端 · Tauri 2 + React 19 + TypeScript

一个面向个人使用的 Claude API 桌面聊天客户端，支持多模型切换、思考模式、流式输出、Markdown 渲染、会话历史、系统提示词预设、文件工具。

## ✨ 功能

- 🧠 **多模型**：Opus 4.8 / Sonnet 4.6 / Haiku 4.5 实时切换
- 💭 **扩展思考**（Extended Thinking）：可调预算的深度思考
- ⚡ **流式输出**：基于 Anthropic SDK SSE，逐块渲染
- 📝 **Markdown + 数学公式**：GFM 表格、任务列表、KaTeX 公式
- 💾 **本地持久化**：SQLite 存会话、消息、提示词预设
- 🔐 **API Key 安全**：写入操作系统 Keychain（macOS Keychain / Windows Credential Manager / Linux Secret Service）
- 📋 **系统提示词**：内置 4 个预设，支持自定义与变量占位
- 🛠️ **工具调用**：内置 `read_file` / `list_dir` / `write_file`，可启用 / 禁用
- ⌨️ **快捷键**：`⌘+N` 新建、`⌘+,` 设置、`Esc` 停止

## 🛠️ 技术栈

- **桌面壳**：Tauri 2（Rust 后端）
- **前端**：React 19 + TypeScript 5（strict）+ Vite 6
- **样式**：Tailwind CSS 4 + shadcn/ui
- **状态**：Zustand 5
- **数据**：Anthropic SDK + SQLite（sqlx）
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

首次启动会引导你填写 Anthropic API Key（写入 OS Keychain）。

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
├── lib/                     # anthropic / streaming / keyring / db / tools / prompts
├── stores/                  # Zustand stores
├── styles/                  # Tailwind 入口
└── types/                   # 共享类型

src-tauri/
├── src/
│   ├── commands/            # Tauri commands（keyring / db / tools）
│   ├── db/                  # SQLite 池 + 迁移
│   └── ...
├── capabilities/            # 权限声明
├── icons/                   # 应用图标
└── tauri.conf.json
```

## 🔑 API Key 安全

- Key 写入 OS Keychain，前端只持有 Keychain 的"存在性 + 预览（sk-…1234）"。
- 实际请求时通过 Tauri command 临时取出，用完即丢。
- 任何 Tauri 外的进程（包括其他应用）都拿不到明文 Key。

## ⚙️ 系统提示词

内置 4 个预设：

- 通用助手
- 代码审查
- 翻译助手
- 总结助手

支持自定义预设、内容变量（如 `{{language}}`）、一键应用到新会话。

## 🛠️ 工具

| 工具 | 用途 | 范围 |
| --- | --- | --- |
| `read_file` | 读取文本文件（≤1MB） | HOME / 桌面 / 文档 / 下载 / 临时 |
| `list_dir` | 列出目录 | 同上 |
| `write_file` | 写入文件 | 同上（默认禁用，需手动启用） |

所有文件操作都限制在白名单目录内，危险操作会标记。

## 📦 打包

```bash
# 当前平台 release
pnpm tauri build

# 仅 macOS universal
pnpm tauri build --target universal-apple-darwin
```

产物：

- macOS: `src-tauri/target/release/bundle/dmg/*.dmg` + `.app`
- Windows: `src-tauri/target/release/bundle/msi/*.msi`
- Linux: `src-tauri/target/release/bundle/appimage/*.AppImage`

## 📝 路线图

- [ ] MCP 集成（stdio / sse / http transport）
- [ ] 项目级 context（`.claude` 文件夹）
- [ ] 多轮工具调用
- [ ] 工具结果可视化（图片、表格）
- [ ] 云同步
- [ ] 国际化

## 许可

MIT
