# 代码风格规范

继承自 `~/.claude/CLAUDE.md`，针对 `claw-client` 项目的具体落地。

## TypeScript

### 严格模式

- `tsconfig.json` 已开启 `strict: true` + `noUnusedLocals` + `noUnusedParameters`。
- **禁止裸 `any`**。需要时用 `unknown` + 类型守卫。
- 不可避免时（如第三方库类型缺失），用 `any` 并在注释中说明原因，但优先尝试官方类型。

### 命名

- 变量 / 函数：`camelCase`
- 组件 / 类：`PascalCase`
- 常量：`SCREAMING_SNAKE_CASE`
- 文件：`kebab-case.ts`（`MessageList.tsx` 这种组件名沿用 shadcn 约定）
- 类型 / 接口：直接语义化（`User` 而非 `IUser`）。`T` 前缀仅用于复杂泛型。

### 导入顺序

```ts
// 1. 第三方 / node_modules
import { useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

// 2. 项目内 @/ 别名
import { Button } from '@/components/ui/button';
import { useChat } from '@/hooks/useChat';

// 3. 相对路径（仅同目录或子目录）
import { MessageItem } from './MessageItem';

// 4. 类型导入（用 type 标记）
import type { ChatMessage } from '@/types/claude';
```

### 注释

- **公共函数 / hook**：写 JSDoc，描述参数、返回值、副作用。
- **复杂逻辑**：写"为什么"，不写"做什么"。
- TODO 格式：`// TODO(2026-07): #issue 待优化`，带日期和 issue 编号。
- FIXME 格式：`// FIXME(2026-07): #issue 原因`，不修复不能合 main。

## React 19

### 组件

- 优先函数组件 + Hooks。
- 不使用 class 组件（`ErrorBoundary` 是唯一例外）。
- 组件 props 用 `interface` 而非 `type`（更好的错误信息）。
- 子组件渲染超过 50 行，拆为独立组件。

### Hooks

- `useEffect` 依赖数组必须完整，禁用 `// eslint-disable-next-line` 抑制警告。
- 派生状态用 `useMemo`，回调用 `useCallback` 包装（避免子组件无谓重渲染）。
- 自定义 hook 命名以 `use` 开头。

### 性能

- 列表渲染用稳定 `key`，不用 `index`。
- 大列表（> 100 行）考虑虚拟滚动。
- `useState` 初始值是计算结果时用函数形式：`useState(() => compute())`。

## Tailwind CSS 4

- 优先工具类，**避免** `@apply` 与自定义 CSS。
- 响应式前缀：`sm:` / `md:` / `lg:` / `xl:`。
- 颜色用 `oklch` 主题变量，不硬编码 hex。
- 长 className 串用 `cn()` 合并（`src/lib/utils.ts`）。
- 暗色模式：默认 dark，通过 `.dark` class 切换。

## 格式化

- Prettier 自动格式化（编辑器保存时）。
- 行宽 100 字符。
- 单引号，无尾逗号 trailing-comma=es5。
- 缩进 2 空格。

## Lint

- ESLint 9 flat config（`eslint.config.js`）。
- React Hooks 规则全开。
- `@typescript-eslint/no-unused-vars` 警告级别。
- 不通过 `eslint-disable` 抑制未解决的警告，必须修复。

## Git 提交

完整规则见 `.claude/rules/git-commit.md`。
