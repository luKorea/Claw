# Git 提交规范

本规则适用于 `claw-client` 仓库的分支、提交和交付说明。提交信息必须符合 Conventional Commits。

## Commit Message 格式

```text
<type>(<scope>): <subject>
```

`scope` 可省略：

```text
<type>: <subject>
```

## type 取值

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复 Bug |
| `style` | 样式、文案、格式调整，不影响业务逻辑 |
| `refactor` | 重构，不包含新功能或 Bug 修复 |
| `chore` | 构建、依赖、版本号、脚本等杂项 |
| `docs` | 文档变更 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `build` | 构建配置、打包流程相关 |
| `ci` | CI/CD、流水线相关 |

## scope 约定

scope 使用影响的业务域或模块名，建议与目录名或文件路径保持一致。

常见示例：

- `apikey` — API Key 相关
- `chat` — 聊天核心（hooks / MessageList / 流式）
- `tools` — 工具调用（builtin / executor / Rust tool commands）
- `prompts` — 系统提示词预设
- `tauri` — Rust 后端、Cargo.toml、capabilities
- `ui` — shadcn 原子组件
- `stores` — Zustand stores
- `deps` — 依赖升级
- `docs` — 文档
- `build` — vite / tauri 构建配置

## subject 要求

- 使用中文描述具体改动。
- 不超过 50 个字符。
- 不加句号。
- 避免模糊描述，如 `fix: bug fix`、`feat: 代码优化`、`chore: 修改代码`。
- 描述用户或业务能理解的结果，而不是只写实现动作。

## 示例

```text
feat(chat): 支持扩展思考模式预算可调
fix(tauri): 修复 macOS Keychain 读取偶发失败
refactor(tools): 收敛内置工具的路径白名单
style(ui): 调整代码块复制按钮的 hover 样式
docs: 初始化 AGENTS.md
chore(deps): 升级 @anthropic-ai/sdk 到 0.41
build(tauri): 调整 macOS bundle icon 列表
```

## 分支规范

功能分支：

```text
feature/{author}/{yyyymmdd}-{description}
```

紧急修复：

```text
hotfix/{author}/{yyyymmdd}-{description}
```

## 本地验证建议

- 改 React / TypeScript：`pnpm typecheck`
- 改 Rust 后端：`cargo check --manifest-path src-tauri/Cargo.toml`
- 改公共逻辑 / 准备交付：`pnpm lint && pnpm build`
- 改 tauri 配置 / Cargo / capabilities：`pnpm tauri dev` 验证启动

## 注意事项

1. 禁止直接向 `main` 推送；不要使用 `git push --force` 覆盖团队分支。
2. 不要提交 `globalConfig` 类的个人本地配置、构建产物、调试日志。
3. 不要提交 `pnpm-lock.yaml` 的手动改动。
4. 提交前检查是否混入无关文件、临时脚本、调试 `console` 或本地端口配置。
