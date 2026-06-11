---
title: "Spec-Driven Development 完整学习指南"
subtitle: "从 Vibe Coding 到可追踪规格、Agent 平台集成与实战模板"
author: "Codex"
date: "2026-06-11"
lang: zh-CN
---

# Spec-Driven Development 完整学习指南

版本：2026-06-11

资料来源策略：本资料优先使用 Context7 获取当前官方文档，并用官方仓库 / 官方文档站补齐 Agent 平台差异。没有把百科、营销博客、二手教程作为事实依据。

Context7 检索摘要：

- GitHub Spec Kit：选择 `/github/spec-kit`。当前核心命令是 `/speckit.constitution`、`/speckit.specify`、`/speckit.plan`、`/speckit.tasks`、`/speckit.taskstoissues`、`/speckit.implement`。
- Claude Code：选择 `/websites/code_claude`。当前能力覆盖 `CLAUDE.md` / `.claude/CLAUDE.md` 项目记忆、`.claude/skills/*/SKILL.md` 技能、custom commands、hooks、MCP、subagents。
- OpenAI Agents SDK JS：选择 `/websites/openai_github_io_openai-agents-js`。当前核心抽象是 `Agent`、`run()`、tools、handoffs、guardrails、sessions、tracing、hosted MCP tools 与人工审批流。

## 1. 一句话结论

Vibe Coding 是“靠对话和直觉快速把东西跑起来”；Spec-Driven Development 是“先把要做什么、为什么做、验收标准、技术计划、任务拆分和测试证据固定下来，再让 Agent 执行”。两者不是敌人：探索期可以 vibe，进入可交付阶段必须 spec。

对于团队工程，Spec-Driven 的核心价值不是“多写文档”，而是把 Agent 的输入从一次性 prompt 升级为可复用、可审计、可回滚的工程资产。

## 2. 什么是 Vibe Coding

Vibe Coding 的典型工作方式：

1. 用自然语言描述一个大概目标。
2. 让 Agent 直接改代码。
3. 看到结果后继续补充、修正、重试。
4. 靠人工感觉判断是否“差不多”。

它的优点很明显：

- 启动快，特别适合探索 UI、原型、一次性脚本和不确定方向。
- 对上下文要求低，prompt 可以很口语化。
- 很适合个人开发者在未知空间里找手感。

它的工程风险也很明显：

- 需求边界容易漂移，Agent 会把“也许有用”的东西做进去。
- 验收标准常常在实现之后才补，导致返工。
- 任务不可追踪，几天后很难解释为什么这样实现。
- 多 Agent 或多人协作时，每个人的“vibe”不一致，产物容易分叉。
- 对安全、兼容性、迁移、测试这类非功能要求覆盖不足。

Vibe Coding 的正确位置：探索、草图、Spike、低风险 demo、一次性自动化。不要把它直接当成生产级交付流程。

## 3. 什么是 Spec-Driven Development

Spec-Driven Development（规格驱动开发）把“规格”作为开发的一等公民。规格不是最后补的文档，而是驱动计划、任务、测试、实现和评审的源头。

一个完整的 Spec-Driven 流程通常包含：

1. Constitution：项目原则、约束、技术边界、质量门禁。
2. Specification：用户场景、功能需求、非功能需求、边界、验收标准。
3. Technical Plan：技术方案、架构影响、数据模型、接口、迁移、风险。
4. Tasks：可执行任务清单，最好每个任务都能映射到 spec 条目。
5. Implementation：按任务执行，不允许无依据扩展。
6. Verification：测试、类型检查、构建、人工验收、证据留档。
7. Traceability：需求、任务、代码、测试、PR、issue 之间可追踪。

Spec-Driven 的重点不是把文档写长，而是把 Agent 需要“遵守的世界”写清楚。

## 4. Vibe Coding vs Spec-Driven 对比

| 维度 | Vibe Coding | Spec-Driven Development |
| --- | --- | --- |
| 起点 | 一个口语化目标 | 可审阅的规格与验收标准 |
| 适用阶段 | 探索、原型、Spike | 可交付功能、团队协作、长期维护 |
| Agent 行为 | 直接实现，边做边猜 | 先澄清规格，再计划，再执行 |
| 需求边界 | 容易漂移 | 用 spec、non-goals、acceptance criteria 固定 |
| 质量控制 | 依赖人工感觉 | 依赖测试、清单、CI、review gate |
| 可追踪性 | 弱 | 强，能从需求追到任务、代码、测试 |
| 多 Agent 协作 | 容易冲突 | 可按角色、任务、文件边界拆分 |
| 成本 | 前期低，后期可能返工 | 前期多一点，后期更稳 |
| 风险 | 过度实现、遗漏边界、测试不足 | 规格僵化、流程过重、维护成本 |

推荐判断：

- 30 分钟内能丢弃的东西：可以 vibe。
- 会进主分支、影响用户、涉及数据 / 安全 / 支付 / 权限 / 发布：必须 spec。
- 多人或多 Agent 同时做：必须 spec。
- 需求还不清楚但需要探索：先 vibe 出候选方案，再把候选方案沉淀成 spec。

## 5. GitHub Spec Kit 当前工作流

GitHub Spec Kit 是目前最典型的 Spec-Driven 工具化入口。Context7 当前文档显示，它使用 `/speckit.*` 系列命令驱动流程。早期资料里常见的裸 `/specify`、`/plan`、`/tasks` 命令在新文档中应当按当前命令前缀修正。

### 5.1 核心命令

| 阶段 | 命令 | 目标 |
| --- | --- | --- |
| 项目原则 | `/speckit.constitution` | 建立项目级原则、工程约束、质量门禁 |
| 功能规格 | `/speckit.specify` | 描述要做什么和为什么做，不提前写技术实现 |
| 技术计划 | `/speckit.plan` | 从规格推导技术方案、架构影响、测试策略 |
| 任务拆分 | `/speckit.tasks` | 生成可执行任务列表 |
| Issue 化 | `/speckit.taskstoissues` | 把任务转成 GitHub Issues，便于分派给 Agent 或团队 |
| 执行实现 | `/speckit.implement` | 按任务实现并产出验证证据 |

### 5.2 推荐目录结构

下面是一种通用结构，具体以 Spec Kit 初始化结果和团队约定为准：

```text
.
├── AGENTS.md / CLAUDE.md / GEMINI.md
├── .specify/
│   ├── constitution.md
│   ├── templates/
│   └── scripts/
├── specs/
│   └── 001-provider-health-check/
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       ├── research.md
│       ├── data-model.md
│       ├── contracts/
│       └── quickstart.md
└── src/
```

目录原则：

- `constitution.md` 放稳定原则，不放临时需求。
- 每个 feature 一个 spec 目录，不要把多个需求塞进一个巨型文档。
- `spec.md` 写“用户可见行为”和验收标准。
- `plan.md` 写技术选择和影响范围。
- `tasks.md` 写最小可执行任务，避免“一条任务改全世界”。
- `contracts/` 存 API、事件、schema、CLI、配置文件格式等契约。

## 6. Spec-Driven 的核心产物

### 6.1 Constitution

Constitution 是 Agent 的“宪法”。它应该稳定、短、可执行。

适合写入：

- 技术栈边界：例如 Tauri 2 + React 19 + TypeScript strict。
- 安全底线：例如禁止硬编码 token，API key 只通过后端命令临时读取。
- 测试义务：新增业务代码必须有测试。
- 架构边界：新增 Provider 必须经过 adapter 层，不绕过统一流式协议。
- 交付门禁：类型检查、lint、测试、构建、人工验收。

不适合写入：

- 某一次功能需求。
- 过期的临时 workaround。
- “尽量写好一点”这类无法验证的口号。

示例：

```markdown
# Constitution

## Engineering Principles

1. TypeScript strict mode is mandatory. Do not use naked `any`.
2. User-facing behavior must be specified before implementation.
3. Every business logic change must include tests or an explicit exemption.
4. Provider-specific behavior must be isolated behind provider adapters.
5. API keys must never be persisted in frontend memory or localStorage.

## Quality Gates

- Run `pnpm typecheck` for frontend changes.
- Run `pnpm test:run` for business logic changes.
- Run `cargo test --lib` for Rust command logic changes.
- Update AGENTS.md when adding stable architecture rules.
```

### 6.2 Specification

Spec 写“什么”和“为什么”，不要提前写“怎么实现”。好的 spec 应该让不同 Agent 得到基本一致的理解。

推荐模板：

```markdown
# Feature Spec: <feature name>

## Problem

用户现在遇到什么问题？为什么值得做？

## Users

- Primary user:
- Secondary user:

## Scenarios

### Scenario 1: <name>

Given ...
When ...
Then ...

## Requirements

- R1:
- R2:
- R3:

## Non-goals

- N1:
- N2:

## Acceptance Criteria

- AC1:
- AC2:
- AC3:

## Edge Cases

- E1:
- E2:

## Observability / Evidence

- 测试:
- 日志:
- UI 验收:
```

### 6.3 Technical Plan

Plan 写“怎么做”，但要显式绑定 spec。

推荐包含：

- 当前代码入口和影响文件。
- 数据模型 / API / 命令 / 配置变更。
- 兼容性与迁移。
- 测试策略。
- 风险和备选方案。
- 不做的事情。

### 6.4 Tasks

任务必须小、可执行、可验证。

坏任务：

```markdown
- 实现 Provider 健康检查
```

好任务：

```markdown
- T001: 在 `src/types/providers.ts` 增加 `ProviderHealthStatus` 类型，覆盖 `ok`、`missing_key`、`network_error`、`auth_error`、`unknown_error`。
- T002: 在 Rust settings command 增加只读 key 状态查询复用函数，不返回明文。
- T003: 在 `src/lib/providers/health.ts` 增加 provider-agnostic 健康检查适配层，并写单元测试。
- T004: 在 Settings Provider 列表展示健康状态、最近检查时间和重试按钮。
- T005: 补充 Vitest 和 Rust 单测，运行 `pnpm test:run` 与 `cargo test --lib`。
```

任务拆分标准：

- 一条任务最好能在 15 到 60 分钟内完成。
- 每条任务都能找到对应需求或验收标准。
- 每条任务都能说明验证方式。
- 不把重构和新功能混在一条任务里。

## 7. 如何把 Spec-Driven 集成进一个现有项目

### 7.1 轻量集成

适合个人项目或尚未引入完整 Spec Kit 的团队。

步骤：

1. 在仓库根目录维护 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 或平台对应规则文件。
2. 新建 `specs/<feature>/spec.md`、`plan.md`、`tasks.md`。
3. 要求 Agent 在改代码前先读取相关 spec。
4. PR 模板要求贴出需求、任务、测试证据。
5. CI 校验 spec 路径和测试命令。

最小目录：

```text
specs/
└── 001-feature-name/
    ├── spec.md
    ├── plan.md
    └── tasks.md
```

### 7.2 标准集成

适合已经使用 Agent 做正式开发的团队。

步骤：

1. 使用 Spec Kit 初始化项目。
2. 用 `/speckit.constitution` 固化项目原则。
3. 每个需求从 `/speckit.specify` 开始。
4. `/speckit.plan` 后必须 review 技术方案。
5. `/speckit.tasks` 生成任务后才能实现。
6. `/speckit.implement` 按任务执行。
7. 提交前附测试和验证证据。

### 7.3 企业级集成

适合多团队、多 Agent、合规或高风险系统。

额外增加：

- spec review gate：规格未 review 不允许开实现 PR。
- task-to-issue：把任务转成 GitHub Issues 或 Jira tickets。
- traceability matrix：需求、任务、PR、测试、发布记录之间可追踪。
- security checklist：敏感数据、权限、审计、日志、回滚。
- release evidence：发布前保存构建产物、测试报告、验收截图。
- architecture decision records：关键技术选择进入 ADR。

## 8. 各大 Agent 平台集成方式

### 8.1 Codex

Codex 适合用 `AGENTS.md` 做项目级规则入口。这个仓库当前的 `AGENTS.md` 就是典型例子：技术栈、命令、目录、测试义务、安全规则、公共模块边界都写在里面。

推荐集成方式：

```text
.
├── AGENTS.md
├── specs/
│   └── 001-feature/
│       ├── spec.md
│       ├── plan.md
│       └── tasks.md
└── .agent-context/
    └── current/
        ├── progress.md
        └── findings.md
```

推荐 `AGENTS.md` 追加规则：

```markdown
## Spec-Driven Workflow

- 新功能必须先创建或读取 `specs/<feature>/spec.md`。
- 实现前必须确认 `plan.md` 与 `tasks.md` 已存在。
- 不允许实现 `spec.md` 或 `tasks.md` 未覆盖的功能。
- 每次交付必须说明完成的 task id、测试命令和残余风险。
- 如需求变更，先更新 spec，再更新 plan/tasks，最后改代码。
```

适用策略：

- 单 Agent：Codex 直接按 `tasks.md` 顺序实现。
- 多 Agent：每个 Agent 分配不同 task id 和文件边界，避免同时改同一模块。
- 长任务：用 `.agent-context/current/progress.md` 保存进度，不依赖会话记忆。

### 8.2 Claude Code

Claude Code 的集成点更丰富：

- `CLAUDE.md` 或 `.claude/CLAUDE.md`：项目记忆和工程规则。
- `.claude/skills/*/SKILL.md`：把 Spec-Driven 做成可复用技能。
- `.claude/commands/*.md`：把 `/specify`、`/plan`、`/tasks` 这类动作封装为 custom commands。
- hooks：在实现前检查 spec 是否存在，在提交前检查测试证据。
- MCP：接 GitHub、Jira、Linear、文档系统或内部工具。
- subagents：把需求分析、架构评审、测试设计、实现拆开。

轻量规则示例：

```markdown
# CLAUDE.md

## Spec-Driven Workflow

Before implementation:
1. Read `specs/<feature>/spec.md`.
2. Confirm `plan.md` and `tasks.md` exist.
3. Ask for clarification if acceptance criteria are missing.

During implementation:
- Work task by task.
- Do not expand scope without updating the spec.

Before final response:
- Report completed task ids.
- Report test commands and results.
```

技能示例：

```text
.claude/
└── skills/
    └── spec-driven/
        └── SKILL.md
```

```markdown
---
name: spec-driven
description: Use when a request mentions new feature, product requirement, PRD, acceptance criteria, or implementation plan.
---

1. Locate or create `specs/<feature>/spec.md`.
2. Draft user scenarios, requirements, non-goals, and acceptance criteria.
3. Draft `plan.md` only after spec review.
4. Draft `tasks.md` with task ids and verification commands.
5. Implement only approved tasks.
```

### 8.3 Cursor

Cursor 的项目规则适合承载 Spec-Driven 的轻量约束。当前常见做法是使用 `.cursor/rules/*.mdc` 管理项目规则，并按文件范围、描述或 always apply 策略触发。

推荐结构：

```text
.cursor/
└── rules/
    ├── spec-driven.mdc
    ├── frontend.mdc
    └── testing.mdc
specs/
└── 001-feature/
```

示例规则：

```markdown
---
description: Enforce spec-driven workflow for feature work
alwaysApply: true
---

# Spec-Driven Workflow

- For new features, read or create `specs/<feature>/spec.md` before editing source code.
- Do not implement requirements that are not represented in `spec.md`.
- Convert approved requirements into `plan.md` and `tasks.md`.
- Every task must include verification commands.
- Before finalizing, summarize task ids and test results.
```

适用场景：

- Cursor 适合在 IDE 内直接围绕当前文件和规则工作。
- 对复杂功能，建议把 spec 目录作为上下文显式加入对话。
- 若使用 Background Agent 或远端 Agent，把任务拆到 issue 或 task id，避免上下文丢失。

### 8.4 Windsurf / Devin Desktop

Windsurf / Devin Desktop 的关键是把 Spec-Driven 规则写入项目 Rules / Memories，让 Cascade 或对应 Agent 在每次任务中自动读取。

推荐做法：

- 用项目级 rules 写稳定工程规则。
- 用 memories 保存长期上下文，例如产品原则、架构约束、常用验证命令。
- 每个 feature 仍然使用 `specs/<feature>/` 保存规格、计划和任务。
- 不把一次性需求写进全局 memory，避免污染后续任务。

规则内容示例：

```markdown
# Spec-Driven Project Rule

When a user asks for a feature, bugfix with unclear scope, or cross-file change:
1. Locate a matching spec under `specs/`.
2. If missing, draft a spec before editing implementation files.
3. Keep implementation aligned with `tasks.md`.
4. Update progress after each completed task.
5. Run the verification commands defined in the plan.
```

### 8.5 Cline

Cline 适合用 Rules Bank、工作流和 MCP 做 Spec-Driven 自动化。

推荐结构：

```text
.clinerules/
├── 01-spec-driven.md
├── 02-testing.md
└── 03-security.md
specs/
└── 001-feature/
```

规则示例：

```markdown
# Spec-Driven Development

- Start feature work by creating or reading `specs/<feature>/spec.md`.
- Ask for missing acceptance criteria before implementation.
- Generate `plan.md` and `tasks.md`.
- Execute tasks in order and update task status.
- Run tests and include evidence in the final response.
```

如果使用 Cline + GitHub MCP：

- `/speckit.taskstoissues` 或手动把 tasks 转成 issues。
- 每个 issue 包含 spec 链接、task id、验收标准、测试命令。
- Cline 按 issue 执行，PR 引用对应 task id。

### 8.6 Roo Code

Roo Code 的思路与 Cline 类似，通常通过项目规则、模式和工作流把 Agent 角色固定下来。

推荐拆分角色：

- Spec Architect：只写 spec，不改实现。
- Plan Reviewer：审查 plan、风险、测试策略。
- Implementer：只按 approved tasks 改代码。
- QA Reviewer：只验收测试、边界和回归风险。

如果团队已经有 Roo 自定义模式，可把 Spec-Driven 做成单独模式；否则先用项目 rules 文件约束“先 spec、再 plan、再 tasks、最后 implement”。

### 8.7 GitHub Copilot Coding Agent

GitHub Copilot Coding Agent 更适合和 issue 驱动结合。

推荐模式：

1. 用 Spec Kit 或手动流程生成 `tasks.md`。
2. 用 `/speckit.taskstoissues` 或脚本把任务转成 GitHub Issues。
3. 每个 issue 写清楚：
   - 背景与 spec 链接。
   - task id。
   - 修改范围。
   - 验收标准。
   - 必跑命令。
4. 把 issue 分配给 Copilot Coding Agent。
5. PR review 时检查任务是否越界。

仓库指令建议：

```text
.github/
├── copilot-instructions.md
└── PULL_REQUEST_TEMPLATE.md
```

`copilot-instructions.md` 示例：

```markdown
# Repository Instructions

- Follow `specs/<feature>/spec.md`, `plan.md`, and `tasks.md`.
- Do not implement unlisted requirements.
- Include test evidence in the PR body.
- Prefer minimal, task-scoped changes.
```

### 8.8 Kiro

Kiro 原生强调 Spec-Driven。它适合把需求、设计和任务作为 IDE 内的一等工作流，而不是单纯依赖外部 Markdown。

推荐用法：

- Steering：存产品、技术、结构等长期上下文。
- Specs：每个功能维护 requirements、design、tasks。
- 在进入实现前，先审查 requirements 是否覆盖场景和验收。
- 对团队项目，仍建议把关键 spec 文件纳入 Git，保证可 review。

Kiro 的优势是流程内建，适合从 0 到 1 规范化团队开发；缺点是如果团队同时使用多个 Agent，仍需要把规则同步到 `AGENTS.md`、`CLAUDE.md`、`.cursor/rules` 等入口。

### 8.9 Gemini CLI

Gemini CLI 常见项目级上下文入口是 `GEMINI.md`。集成方式与 `AGENTS.md` 类似。

推荐：

```text
.
├── GEMINI.md
└── specs/
    └── 001-feature/
```

`GEMINI.md` 示例：

```markdown
# Spec-Driven Workflow

- For feature requests, first inspect `specs/`.
- If no spec exists, draft one and wait for approval.
- Implement only task ids listed in `tasks.md`.
- Report verification commands and results.
```

### 8.10 OpenAI Agents SDK

OpenAI Agents SDK 适合把 Spec-Driven 做成产品内工作流或自动化服务，而不仅是 IDE 规则。

典型拆分：

- Intake Agent：把用户需求转成澄清问题和 spec 草稿。
- Spec Reviewer：检查需求是否可验收、是否有 non-goals。
- Planner Agent：生成技术计划。
- Task Agent：拆任务。
- Implementer Agent：执行任务。
- QA Agent：运行测试、检查证据。

简化 TypeScript 示例：

```typescript
import { Agent, run } from "@openai/agents";

const specAgent = new Agent({
  name: "Spec Architect",
  instructions: [
    "Convert user requests into feature specifications.",
    "Focus on user scenarios, requirements, non-goals, and acceptance criteria.",
    "Do not propose implementation details until requirements are clear.",
  ].join("\n"),
});

const plannerAgent = new Agent({
  name: "Technical Planner",
  instructions: [
    "Create technical plans from approved specifications.",
    "Include affected files, data contracts, testing strategy, risks, and rollback.",
  ].join("\n"),
});

const triageAgent = Agent.create({
  name: "Spec-Driven Triage",
  instructions: "Route requests to the correct workflow stage.",
  handoffs: [specAgent, plannerAgent],
});

const result = await run(
  triageAgent,
  "为桌面客户端新增 Provider 健康检查功能"
);

console.log(result.finalOutput);
```

MCP 集成方向：

- GitHub MCP：创建 issue、读取 PR、写 review。
- Filesystem MCP：读写 spec、plan、tasks。
- Test Runner MCP：执行测试命令。
- Docs MCP / Context7：查当前库文档。
- Approval Flow：对写文件、发 issue、合并 PR 这类动作要求人工确认。

## 9. 功能示例：为 claw-client 增加 Provider 健康检查

下面用一个真实前端桌面客户端场景演示 Spec-Driven 如何落地。

### 9.1 Vibe Coding 版本

用户 prompt：

```text
帮我给 Provider 设置页加一个健康检查按钮，能显示 API key 是否可用。
```

Agent 可能会直接：

- 在 Settings 组件里加按钮。
- 前端直接调用 provider API。
- 把 API key 暂存在 state。
- 只处理成功 / 失败两个状态。
- 没有考虑 MiniMax 走 Rust 桥接、CSP、错误脱敏、测试。

这就是典型 vibe 风险：能跑，但可能绕过架构边界。

### 9.2 Spec-Driven 版本

使用当前 Spec Kit 命令：

```text
/speckit.specify 为 claw-client 增加 Provider 健康检查功能。用户在 Settings 的 Provider 列表中可以手动检查某个 Provider 是否配置了 API key、凭证是否可用、网络是否可达。功能必须支持 Anthropic、DeepSeek、OpenAI、MiniMax 和自定义 Provider。API key 不得在前端长期缓存，错误信息必须脱敏。健康检查不能发起昂贵生成请求，优先使用轻量模型列表或短消息测试。检查结果应显示状态、更新时间、错误类别和重试入口。仅桌面端，不考虑移动端或 H5。
```

生成的 spec 应包含：

```markdown
# Feature Spec: Provider Health Check

## Problem

用户配置 Provider 后无法快速判断 key、网络和 endpoint 是否可用，通常要到聊天发送失败时才发现问题。

## Requirements

- R1: 用户可以在 Provider 设置列表中手动触发单个 Provider 健康检查。
- R2: 系统必须区分未配置 key、认证失败、网络失败、provider 返回错误、未知错误。
- R3: API key 不得在前端长期缓存，不得进入日志、错误提示或持久化状态。
- R4: MiniMax 必须沿用 Rust 桥接，不绕过现有 CORS 决策。
- R5: 自定义 Provider 必须复用已有 test chat / model list 逻辑。
- R6: 检查结果显示最近检查时间、状态和脱敏错误摘要。

## Non-goals

- 不做自动后台定时轮询。
- 不新增移动端 / H5 逻辑。
- 不在健康检查中消耗大量 token。

## Acceptance Criteria

- AC1: 未配置 key 时，按钮可见但结果为 `missing_key`。
- AC2: 认证失败时显示 `auth_error`，不展示明文 key 或完整 Authorization header。
- AC3: MiniMax 检查走 Rust command，不直接从 WebView 调 minimax API。
- AC4: 自定义 Provider 使用当前配置 endpoint，错误提示展示脱敏 endpoint。
- AC5: 单元测试覆盖状态归类和错误脱敏。
```

计划阶段：

```text
/speckit.plan
```

技术计划示例：

```markdown
## Technical Plan

### Affected Areas

- `src/types/providers.ts`: 增加健康状态类型。
- `src/lib/providers/`: 增加 provider health adapter。
- `src-tauri/src/commands/minimax.rs`: 复用或新增轻量健康检查 command。
- `src/components/settings/`: 展示状态和重试入口。
- `src/stores/`: 如果需要持久化最近检查状态，使用 store 管理。

### Design

- Provider health check 返回统一结构：
  - `status`
  - `checkedAt`
  - `message`
  - `diagnostic`
- 前端只保存脱敏信息。
- 内置 provider 优先轻量检查，自定义 provider 复用 `test_custom_provider_chat`。

### Tests

- Vitest: 状态归类、错误脱敏、adapter 分发。
- Rust: MiniMax command 输入校验和错误映射。
- UI: Settings 状态渲染。
```

任务阶段：

```text
/speckit.tasks
```

任务示例：

```markdown
- T001: 定义 `ProviderHealthStatus`、`ProviderHealthResult` 类型。
- T002: 实现 `classifyProviderHealthError()` 并覆盖单测。
- T003: 为 OpenAI compatible provider 增加轻量检查函数。
- T004: 为 MiniMax 增加 Rust 桥接健康检查或复用现有 test command。
- T005: 为自定义 Provider 接入现有测试接口。
- T006: Settings UI 增加健康状态、检查按钮、loading 和错误脱敏显示。
- T007: 补充组件测试与 store 测试。
- T008: 运行 `pnpm typecheck && pnpm lint && pnpm test:run`，Rust 变更运行 `cargo test --lib`。
```

实现阶段：

```text
/speckit.implement
```

Agent 执行时必须逐条勾任务，不允许顺手改 provider 架构之外的功能。

## 10. Prompt 模板

### 10.1 从需求到 Spec

```text
请基于下面需求生成 Spec-Driven Development 的 feature spec。

要求：
- 只写 what / why，不提前写技术实现。
- 必须包含 Problem、Users、Scenarios、Requirements、Non-goals、Acceptance Criteria、Edge Cases、Evidence。
- 验收标准必须可测试。
- 对不明确的点列出 Clarifying Questions。

需求：
<paste requirement here>
```

### 10.2 从 Spec 到 Plan

```text
请基于 `specs/<feature>/spec.md` 生成技术计划 `plan.md`。

要求：
- 显式列出影响文件和模块边界。
- 写出数据结构、接口、迁移、安全、兼容性。
- 给出测试策略和验证命令。
- 标注风险、备选方案和不做事项。
- 不要开始实现。
```

### 10.3 从 Plan 到 Tasks

```text
请基于 `spec.md` 和 `plan.md` 生成 `tasks.md`。

要求：
- 每条任务带稳定 ID，例如 T001。
- 每条任务必须可执行、可验证。
- 标注可并行任务。
- 标注对应需求或验收标准。
- 不要把多个大模块塞进一条任务。
```

### 10.4 实现任务

```text
请只实现 `tasks.md` 中的 T003 和 T004。

边界：
- 不实现未列出的需求。
- 如发现 spec 与代码冲突，先说明冲突点。
- 完成后汇报修改文件、完成 task id、测试命令、失败或未执行原因。
```

## 11. 团队落地流程

### 11.1 单人项目

最小闭环：

1. `AGENTS.md` 写稳定规则。
2. 每个功能有 `spec.md`。
3. 复杂功能再写 `plan.md`、`tasks.md`。
4. 每次实现后在最终回复中列出测试证据。

### 11.2 小团队

推荐闭环：

1. 产品或技术负责人 approve spec。
2. Tech lead approve plan。
3. Agent 或工程师按 tasks 实现。
4. PR 模板强制填写 spec 链接和 task id。
5. Review 重点检查“是否越界”和“验收是否覆盖”。

PR 模板：

```markdown
## Spec

- Spec: `specs/001-feature/spec.md`
- Plan: `specs/001-feature/plan.md`
- Tasks: T001, T002, T003

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:run`
- [ ] `cargo test --lib`

## Scope Control

- [ ] 没有实现 spec 未覆盖的功能
- [ ] 没有无关重构
- [ ] 安全 / 兼容性 / 迁移已说明
```

### 11.3 多 Agent 团队

建议角色分工：

| 角色 | 输入 | 输出 | 禁止 |
| --- | --- | --- | --- |
| Product Spec Agent | 原始需求 | `spec.md` | 改代码 |
| Architecture Agent | `spec.md` | `plan.md` | 跳过风险分析 |
| Task Planner Agent | `spec.md` + `plan.md` | `tasks.md` | 生成不可验证任务 |
| Implementer Agent | approved tasks | 代码 + 测试 | 改未分配任务 |
| QA Agent | diff + tests | 验收报告 | 直接大改实现 |

多 Agent 防冲突规则：

- 每个 Agent 必须有明确文件范围。
- 同一文件不要分配给多个 Agent 同时修改。
- 使用 task id 和 PR 分支绑定工作。
- 合并前检查 spec 是否被实现变更反向污染。

## 12. CI 与质量门禁

推荐门禁：

| 门禁 | 检查内容 |
| --- | --- |
| Spec exists | 新功能 PR 必须引用 `specs/<feature>/spec.md` |
| Tasks linked | PR body 必须列出 task id |
| Tests run | 必须包含测试命令和结果 |
| Scope check | diff 不应包含无关重构 |
| Security check | 敏感信息、权限、日志脱敏 |
| Docs update | 稳定规则变更同步 AGENTS / CLAUDE / GEMINI |

简单脚本思路：

```bash
#!/usr/bin/env bash
set -euo pipefail

if git diff --name-only origin/main...HEAD | grep -q '^src/'; then
  if ! grep -q 'specs/' .git/PULL_REQUEST_TEMPLATE.md 2>/dev/null; then
    echo "PR template must reference spec path"
    exit 1
  fi
fi
```

更完整的做法是用 Danger、GitHub Actions 或内部 review bot 解析 PR body。

## 13. 常见反模式

### 13.1 把 Spec 写成实现方案

错误：

```markdown
使用 Zustand 增加一个 store，字段为 xxx，然后在组件 yyy 调用。
```

正确：

```markdown
用户可以在设置页看到最近一次健康检查结果，并能手动重试。
```

实现细节应进入 plan。

### 13.2 Acceptance Criteria 不可测试

错误：

```markdown
界面要好用。
```

正确：

```markdown
当 provider 未配置 key 时，检查按钮点击后显示 `missing_key` 状态，并展示“请先配置 API Key”的提示。
```

### 13.3 Tasks 太大

错误：

```markdown
- 完成前后端所有逻辑
```

正确：

```markdown
- T001: 定义统一结果类型。
- T002: 实现错误分类函数并测试。
- T003: 接入 OpenAI compatible provider。
```

### 13.4 Spec 不维护

如果实现中发现需求变更，必须先更新 spec，再更新 plan/tasks。否则 spec 会变成“历史文档”，失去驱动价值。

### 13.5 用流程压死探索

Spec-Driven 不意味着每个按钮颜色都要先写 3 页规格。探索期可以 vibe；一旦决定交付，再把结果沉淀成 spec。

## 14. 学习路线

### Day 1: 建立概念

- 读本指南第 1 到 6 章。
- 找一个小功能，写 `spec.md`。
- 不要实现，只练习把需求写成可验收条目。

### Day 2: 完成一次闭环

- 为小功能写 `plan.md` 和 `tasks.md`。
- 让 Agent 只实现 T001。
- 检查输出是否越界。
- 记录测试证据。

### Week 1: 接入项目规则

- 在 `AGENTS.md` / `CLAUDE.md` / `.cursor/rules` 中加入 Spec-Driven 规则。
- 建立 `specs/` 目录。
- 为一个真实功能跑完整流程。

### Week 2-4: 团队化

- PR 模板加入 spec/task/test。
- 建立 task-to-issue 流程。
- 为高风险模块加 QA checklist。
- 让不同 Agent 分别承担 spec、plan、implementation、QA。

## 15. 交付清单

新功能进入实现前：

- [ ] 有 `spec.md`
- [ ] 有明确 users / scenarios
- [ ] 有可测试 acceptance criteria
- [ ] 有 non-goals
- [ ] 有 edge cases
- [ ] 有 `plan.md`
- [ ] 有风险与测试策略
- [ ] 有 `tasks.md`

实现中：

- [ ] 只做当前 task id
- [ ] 不做无关重构
- [ ] 发现需求变化先更新 spec
- [ ] 每完成一项更新 task 状态

交付前：

- [ ] 类型检查通过
- [ ] lint 通过
- [ ] 单元测试通过
- [ ] Rust / 后端测试按需通过
- [ ] PR body 写明 spec、task id、测试证据
- [ ] 残余风险已说明

## 16. 资料来源

Context7 使用的官方文档库：

- GitHub Spec Kit：`/github/spec-kit`
- Claude Code：`/websites/code_claude`
- OpenAI Agents SDK JS：`/websites/openai_github_io_openai-agents-js`

官方链接：

- GitHub Spec Kit: <https://github.com/github/spec-kit>
- Spec Kit Quickstart: <https://github.com/github/spec-kit/blob/main/docs/quickstart.md>
- Spec Kit site: <https://github.github.io/spec-kit/>
- Claude Code docs: <https://code.claude.com/docs/>
- OpenAI Agents SDK JS docs: <https://openai.github.io/openai-agents-js/>
- OpenAI Agents SDK Python docs: <https://openai.github.io/openai-agents-python/>
- OpenAI Codex docs: <https://developers.openai.com/codex/>
- OpenAI Codex repository: <https://github.com/openai/codex>
- Cursor docs: <https://docs.cursor.com/>
- GitHub Copilot docs: <https://docs.github.com/en/copilot>
- Kiro docs: <https://kiro.dev/docs/>
- Cline docs: <https://docs.cline.bot/>
- Windsurf / Devin docs: <https://docs.devin.ai/>
- Gemini CLI repository: <https://github.com/google-gemini/gemini-cli>

## 17. 最后建议

把 Spec-Driven 当成一个“可控地使用 Agent 的工程协议”，不要当成文档仪式。

最有效的落地方式：

1. 先让一个真实功能完整跑通。
2. 再把好用的规则写进 Agent 平台入口。
3. 最后接入 issue、CI、PR review。

你不需要一开始就把流程做重。先做到三件事就会明显变稳：先写验收标准，后写技术计划，最后按 task id 实现。
