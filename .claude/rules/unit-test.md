# 单元测试规范

本规则配合 AGENTS.md "测试义务" 节,具体落定测试文件放在哪、怎么写、怎么命名、什么时候豁免。

## 文件位置与命名

| 改动文件 | 测试文件 | 备注 |
|---|---|---|
| `src/lib/<name>.ts` | `src/lib/<name>.test.ts` | 与源文件同目录,便于就近维护 |
| `src/stores/<name>.ts` | `src/stores/<name>.test.ts` | 同上 |
| `src/hooks/<name>.ts` | `src/hooks/<name>.test.ts` | 需 mock tauri invoke,见下 |
| `src/components/<area>/<Name>.tsx` | `src/components/<area>/<Name>.test.tsx` | 业务组件;shadcn UI 原子不写 |
| `src/types/<name>.ts` | `src/types/<name>.test.ts` | 仅当导出函数 / 工具时 |
| `src-tauri/src/commands/<name>.rs` | 末尾 `#[cfg(test)] mod tests` | 跟 Rust 惯例,不另起文件 |
| `src-tauri/src/lib.rs` / `db/*.rs` / `error.rs` | 视情况,纯函数追加 `mod tests` | |

**禁止**把测试塞进 `__tests__` / `tests/` 集中目录(失去就近维护性)。

## 命名约定

- `describe` 第一段:模块相对路径,例如 `lib/providers/anthropic`
- `describe` 第二段(可选):函数名,例如 `parseSSEEvent`
- `it` 描述:中文,具体行为,例如 `tool_use_start 只 yield 一次(首次见到 id+name)`
- 避免笼统 `should work` / `正常情况` 这类描述

## 覆盖原则

- **纯函数**:穷举所有 if/else 分支,至少 1 个 happy + 1 个 error per branch
- **协议转换**(`toAnthropicMessages` / `toOAIMessages`):至少 1 个 round-trip + 1 个边界(空 / 单元素 / 多元素)
- **SSE / 流式解析**:`[DONE]` 哨兵 / 心跳注释 / 多行 data / 用法用量 / 错误路径必测
- **Store / Hook**:状态机迁移(loaded → loading → error)、副作用调用次数、清理(unmount / cancel)
- **Rust 纯函数**:happy path + 至少 1 个 error path + 至少 1 个边界(空 / 越界 / 非法)

## Mock 原则

- **Tauri invoke**:`src/test/setup.ts` 已 `vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))`,直接 `vi.mocked(invoke)` 后 `mockResolvedValueOnce` / `mockRejectedValueOnce`
- **fetch**:`vi.stubGlobal('fetch', vi.fn())` 或 `vi.spyOn(globalThis, 'fetch')`,**不要**改 `src/lib/providers/*` 的实现
- **localStorage**:jsdom 自带,直接读写即可
- **matchMedia**:`src/test/setup.ts` 已 stub;若新测试需要,自己写一个最小 stub
- **Anthropic SDK**:`vitest.config.ts` 已 `server.deps.inline: ['@anthropic-ai/sdk']`,**只测抽出的纯函数**,不实例化 client
- **zustand 跨测污染**:`vi.resetModules()` + `await import('@/stores/<name>')` 拿新 store;不要直接 `setState(initial)` 跨文件共享

## 覆盖率(暂不强制,但建议)

- 核心业务模块(`src/lib/providers/` / `src/lib/streaming.ts` / `src/lib/keyring.ts` / `src/lib/tools/`):争取 ≥ 80%
- 其他模块:不强制,够用即可

## 豁免流程

可以**显式豁免**的 case:

- `src/components/ui/*`(shadcn 原子组件) — 不测,完全交给 shadcn 升级
- `src/types/*.ts` 中**只有类型导出、无任何函数** — 不测
- `src-tauri/src/main.rs` — 是 tauri runtime 入口,不写测试
- UI 纯展示组件(无业务逻辑、纯转发 props) — 可豁免,但要在 PR 描述里点名

**不允许**以"难写"为理由豁免。如果有特殊情况(例:依赖无法 mock 的 native 模块),在 PR 描述里写明并加 TODO 指明后续何时补。

## 跑测命令

```bash
pnpm test:run          # 一次性跑全量
pnpm test:run <path>   # 增量(推荐:改完一个文件就测一个)
pnpm test:watch        # watch 模式
cargo test --lib       # Rust(必须带 --lib,跳 main.rs)
```

**禁止** `pnpm test` 默认 watch 模式阻塞 CI / 提交脚本,提交前用 `test:run`。
