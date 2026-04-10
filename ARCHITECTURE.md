# Auto-Learning 架构与现状文档

---

## 1. 这个仓库是什么

Auto-Learning 是一个**让 AI Agent 能从经验中学习的基础设施**。

具体来说，它是一个 MCP（Model Context Protocol）Server，任何支持 MCP 的 AI Agent（Claude Code、Cursor、Windsurf、Codex 等）都可以通过它获得三种能力：

1. **记住东西** — 用户偏好、环境事实、行为纠正，跨会话持久化
2. **学会技能** — 把复杂工作流固化为可复用的 Skill 文件
3. **自动复盘** — 对话结束后用 LLM 自动提取值得保留的知识

这三种能力组合在一起，形成一个**学习闭环**：Agent 干活 → 积累经验 → 持久化 → 下次干活时调用 → 表现更好。

### 一句话总结

> 给 AI Agent 装上"长期记忆"和"经验积累"能力的 MCP Server。

---

## 2. 设计目标

### 2.1 核心目标

从 Hermes Agent（Nous Research）的闭环学习系统中提取核心模式，抽象为一个**通用的、与具体 Agent 框架无关的**学习基础设施。

Hermes 的学习系统嵌在它自己的 runtime 里，其他 Agent 用不了。我们的目标是把这套机制变成任何 Agent 都能用的独立服务。

### 2.2 具体设计目标（6 个）

| # | 目标 | 含义 |
|---|------|------|
| **G1** | 跨 Agent 通用 | 通过 MCP 协议暴露，不绑定任何特定 Agent 框架 |
| **G2** | Token 高效 | Review 引擎独立调 LLM，不消耗主 Agent 上下文窗口；搜索返回结构化结果而非原始文件 |
| **G3** | 闭环学习 | 支持完整的 recall → execute → review → persist → evolve 循环 |
| **G4** | 安全可控 | Agent 创建的内容（尤其是 Skill）必须经过安全扫描，防止注入和泄露 |
| **G5** | 人可审计 | 所有数据同时以 Markdown 文件形式存储，人类可以直接浏览、编辑、版本控制 |
| **G6** | 渐进增强 | 不依赖 API Key 也能用基础功能；有 API Key 时解锁自动 review |

### 2.3 非目标（明确不做的）

- 不做语义搜索（当前用 FTS5 全文搜索，不用向量数据库）
- 不做实时 Agent 行为修改（只提供知识，不直接改 prompt）
- 不做多用户/多租户（单用户本地使用）
- 不做 Skill 市场/社区共享（v1 不做）

---

## 3. 当前状态

### 3.1 版本：v0.1.0（MVP）

**已完成的功能：**

| 功能 | 状态 | 说明 |
|------|------|------|
| MCP Server 基础框架 | ✅ 完成 | stdio transport，12 个工具注册，正常连接 |
| 记忆系统（Memory） | ✅ 完成 | 写入、读取、搜索、删除、更新、垃圾回收 |
| 技能系统（Skill） | ✅ 完成 | 创建、修补、列出、查看，含安全扫描 |
| 会话系统（Session） | ✅ 完成 | 保存、搜索、近期列表 |
| Review 引擎 | ✅ 完成 | 调 Claude Haiku 自动提取知识，优雅降级 |
| 安全扫描 | ✅ 完成 | 10 条规则，检测注入/泄露/隐藏字符 |
| 存储层 | ✅ 完成 | SQLite FTS5 + Markdown 双存储 |
| Dashboard | ✅ 完成 | Markdown + HTML 审计报告 |
| Skill 协议 | ✅ 完成 | SKILL.md 定义触发规则 |
| 配置系统 | ✅ 完成 | YAML 配置 + 合理默认值 |

**代码规模：**

| 模块 | 文件数 | 行数 |
|------|--------|------|
| MCP Server 源码 | 13 个 .ts | ~1,515 行 |
| Dashboard | 1 个 .ts | ~471 行 |
| Skill 协议 | 2 个 .md | ~110 行 |
| 文档 | 4 个 .md | ~1,600 行 |
| **合计** | **20 个文件** | **~3,700 行** |

### 3.2 尚未完成的功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 单元测试 | 高 | `__tests__/` 目录已规划，代码未写 |
| `memory_update` MCP 工具 | 中 | Store 层已实现 `update()` 方法，但未暴露为 MCP tool |
| Skill 协议自动加载 | 中 | 当前 Skill 是被动的（需要 Agent 框架支持 skill 注入或手动触发） |
| 语义搜索 | 低 | 当前是 FTS5 关键词搜索，未来可接 embedding 模型 |
| 多 Profile 支持 | 低 | 当前是单 profile（~/.auto-learning/），未来可按项目/角色隔离 |
| Skill Hub / 社区共享 | 低 | 类似 Hermes 的 agentskills.io |

---

## 4. 距离设计目标的差距

| 目标 | 完成度 | 差距分析 |
|------|--------|---------|
| **G1 跨 Agent 通用** | 🟢 90% | MCP 协议已实现，理论上任何 MCP 兼容 Agent 可用。差距：未在 Cursor/Windsurf 等实际测试 |
| **G2 Token 高效** | 🟢 85% | Review 引擎独立调 Haiku，搜索返回结构化 JSON。差距：Skill 协议注入到主 Agent 时仍占 token |
| **G3 闭环学习** | 🟡 70% | recall（memory_search）→ persist（memory_write / skill_create）→ review（session_review）都有了。差距：**闭环的"自动触发"依赖 Skill 协议被 Agent 主动遵循**，当前没有强制机制 |
| **G4 安全可控** | 🟢 90% | 10 条扫描规则覆盖主要威胁。差距：无用户确认 override 机制（被阻止的内容无法手动放行） |
| **G5 人可审计** | 🟢 95% | 双存储（文件 + DB），Dashboard 报告，完整性检查。差距：直接编辑文件后 DB 索引不会自动同步 |
| **G6 渐进增强** | 🟢 95% | 无 API Key 时 review 优雅降级，其他功能完全可用。基本达标 |

### 最大的差距

**闭环自动化程度（G3）**。当前的学习闭环依赖 Agent 自觉遵循 Skill 协议：

- Hermes 的做法：runtime 内部有计数器，每 N 轮自动触发 background review
- 我们的做法：SKILL.md 里写了触发规则，但 Agent 可能不遵循

这是架构上的根本限制 — MCP Server 是被动的（等 Agent 调用），不能主动触发。要缩小这个差距，需要：
1. Agent 框架原生支持 skill 自动注入（依赖上游）
2. 或者在 MCP Server 侧实现"提醒"机制（比如 `learning_status` 返回时带提示"距离上次 review 已过 N 轮"）

---

## 5. 仓库结构

```
auto-learning/
│
├── mcp-server/                          # ── MCP Server（核心）──
│   ├── package.json                     # 依赖：MCP SDK, better-sqlite3, Anthropic SDK, zod, yaml
│   ├── tsconfig.json                    # TypeScript 配置（ES2022, Node16 modules, strict）
│   │
│   └── src/
│       ├── index.ts                     # 入口：初始化所有模块，注册 12 个工具，连接 stdio
│       ├── config.ts                    # 配置：读取 ~/.auto-learning/config.yaml，合并默认值
│       ├── dashboard.ts                 # 报告：读取 DB 生成 Markdown/HTML 审计报告
│       │
│       ├── storage/                     # ── 存储层 ──
│       │   ├── database.ts              # SQLite 初始化、FTS5 建表、版本迁移
│       │   ├── memory-store.ts          # 记忆 CRUD + FTS 搜索 + GC
│       │   ├── skill-store.ts           # 技能 CRUD + frontmatter 解析 + 安全扫描集成
│       │   └── session-store.ts         # 会话保存 + 搜索
│       │
│       ├── safety/                      # ── 安全层 ──
│       │   └── scanner.ts              # 10 条 regex 规则扫描 prompt 注入/命令注入/数据泄露
│       │
│       ├── review/                      # ── Review 引擎 ──
│       │   └── engine.ts               # 调 Claude Haiku API，从对话摘要中提取记忆和技能
│       │
│       └── tools/                       # ── MCP 工具定义 ──
│           ├── memory-tools.ts          # 5 个工具：write, read, search, delete, gc
│           ├── skill-tools.ts           # 4 个工具：create, patch, list, view
│           ├── session-tools.ts         # 2 个工具：review, search
│           └── status-tools.ts          # 1 个工具：learning_status
│
├── skill/                               # ── Skill 协议层 ──
│   ├── SKILL.md                         # 学习协议：告诉 Agent 什么时候调哪个工具
│   └── references/
│       └── trigger-rules.md             # 详细触发条件矩阵
│
├── docs/
│   └── plans/
│       └── 2026-04-09-auto-learning-mcp.md  # 实施计划（11 个 Task）
│
├── PROPOSAL.md                          # 完整方案设计（可行性评估 + 架构 + 与 Hermes 对比）
├── README.md                            # 用户文档（使用方法 + 原理 + 配置）
├── TESTING.md                           # 测试指南（11 个场景 + 15 项验证清单）
└── ARCHITECTURE.md                      # 本文档
```

### 模块依赖关系

```
index.ts
  ├── config.ts                    （无依赖）
  ├── storage/database.ts          ← config.ts
  ├── storage/memory-store.ts      ← database.ts, config.ts
  ├── storage/skill-store.ts       ← database.ts, config.ts, safety/scanner.ts
  ├── storage/session-store.ts     ← database.ts, config.ts
  ├── review/engine.ts             ← config.ts, memory-store, skill-store, session-store
  ├── tools/memory-tools.ts        ← memory-store
  ├── tools/skill-tools.ts         ← skill-store
  ├── tools/session-tools.ts       ← session-store, review/engine, memory-store, skill-store
  └── tools/status-tools.ts        ← memory-store, skill-store, session-store, review/engine

safety/scanner.ts                  （无依赖，纯函数）
dashboard.ts                       （独立脚本，直接读 DB）
```

---

## 6. 功能详解

### 6.1 记忆系统（Memory）

**解决的问题**：AI Agent 没有长期记忆，每次对话从零开始。用户反复纠正同样的错误。

**三种记忆类型**：

| 类型 | 用途 | 典型内容 |
|------|------|---------|
| `preference` | 用户的偏好和习惯 | "用户习惯用 pnpm" "回复要简洁" |
| `fact` | 环境事实和发现 | "这个项目用 PostgreSQL 15" "ESLint 9 要用 flat config" |
| `feedback` | 用户对 Agent 行为的纠正 | "不要 mock 数据库" "不要自动加注释" |

**每条记忆的属性**：

```
id          唯一标识（mem_{timestamp}_{random}）
type        preference / fact / feedback
content     正文内容（≤2000 字符）
tags        标签数组（用于搜索和分类）
confidence  置信度：high / medium / low
source      来源：user_direct / session_review
created_at  创建时间
updated_at  更新时间
expires_at  过期时间（可选）
file_path   对应的 Markdown 文件路径
```

**搜索机制**：SQLite FTS5 全文索引，使用 porter 词干算法 + unicode61 分词器。搜索时自动排除已过期的记忆。

**垃圾回收**：`memory_gc` 清理两类记忆：
- 已过期的（`expires_at < now`）
- 低置信度且超龄的（`confidence = low AND age > maxAgeDays`）

### 6.2 技能系统（Skill）

**解决的问题**：Agent 用试错方法解决了一个复杂问题，但下次遇到同样的问题又要重新试错。

**技能格式**：YAML frontmatter + Markdown body，与 Hermes Agent 生态兼容：

```yaml
---
name: deploy-to-staging
description: Deploy service to staging via Docker + AWS ECS
version: 1.0.0
metadata:
  auto-learning:
    tags: [docker, aws, ecs]
    created_by: session_review
---

# Deploy to Staging

1. Build Docker image...
2. Push to ECR...
3. Update ECS task definition...
```

**安全扫描**：每次创建或修补技能时，内容经过 10 条安全规则扫描：

| 类别 | 检测内容 | 规则数 |
|------|---------|--------|
| Prompt 注入 | 覆盖指令、重定义身份、隐瞒信息 | 4 |
| 命令注入 | Shell 命令替换、危险命令串联 | 2 |
| 数据泄露 | 读取敏感文件、上传密钥 | 3 |
| 隐藏内容 | 不可见 Unicode 字符 | 1 |

扫描不通过 → 技能被拒绝 → 返回具体触发了哪条规则。

**修补（Patch）**：不需要重写整个技能，只需指定要替换的旧文本和新文本。修补后重新扫描安全规则。

### 6.3 Review 引擎

**解决的问题**：Agent 完成任务后，哪些经验值得保留？靠 Agent 自己判断不可靠，需要一个独立的"复盘"机制。

**工作方式**：

```
Agent 完成复杂任务
       │
       ▼
Agent 构造结构化摘要
（Goal / Approach / Outcome / Learnings / Errors）
       │
       ▼
调用 session_review(摘要)
       │
       ▼
MCP Server 内部调 Claude Haiku ──── 独立 API 调用
       │                              不消耗主 Agent 上下文
       ▼
Haiku 分析摘要，输出 JSON：
  memories: [{type, content, tags}]
  skills: [{action, name, content}]
       │
       ▼
MCP Server 自动执行：
  - 对每条 memory → 调 memory_store.write()
  - 对每个 skill → 调 skill_store.create() 或 patch()
  - 记录 session → 调 session_store.save()
       │
       ▼
返回给 Agent：{memories, skills, actions_taken}
```

**降级策略**：

| 条件 | 行为 |
|------|------|
| API Key 已设置 | 正常调 Haiku 做 review |
| API Key 未设置 | 返回 `review_unavailable` + 提示手动保存 |
| API 调用失败 | 返回 `review_error` + 错误信息 |
| Haiku 返回无法解析的内容 | 返回 `review_error: failed to parse` |
| 单条 memory/skill 写入失败 | 继续处理其他条目，失败的记录在 `actions_taken` |

### 6.4 会话系统（Session）

**解决的问题**：记录"这次对话学到了什么"，支持后续搜索和回溯。

每次 `session_review` 成功提取知识后，自动保存一条会话记录：
- 日期
- 对话摘要（前 2000 字符）
- 本次提取的记忆数量
- 本次提取的技能数量

`session_search` 支持关键词搜索和按时间范围过滤。

### 6.5 Dashboard 审计报告

**解决的问题**：人类用户需要知道"Agent 到底学了什么""学得对不对"。

7 个板块：

| 板块 | 内容 |
|------|------|
| 总览 | 记忆/技能/会话数量、DB 大小、文件数 |
| 记忆分布 | 按类型（偏好/事实/反馈）和置信度（高/中/低）的柱状图 |
| 全部记忆 | 完整列表：类型、内容、标签、置信度、来源、时间 |
| 已学习技能 | 名称、类别、描述、标签、创建/更新时间 |
| 会话记录 | 日期、提取数量、摘要 |
| 学习曲线 | 每日知识积累趋势 |
| 标签云 | 高频标签排序 |
| 数据完整性 | DB 记录数 vs 文件数是否一致、是否有孤立文件 |

两种输出格式：`npm run dashboard`（Markdown）、`npm run dashboard:html`（暗色主题 HTML）。

---

## 7. 工作原理和逻辑

### 7.1 启动流程

```
Node.js 启动 dist/index.js
       │
       ▼
loadConfig()
  - 读取 ~/.auto-learning/config.yaml（如果存在）
  - 合并默认值（Haiku 模型、2000 字符限制等）
  - 创建数据目录（memory/preferences, memory/facts, memory/feedback, skills, sessions）
       │
       ▼
openDatabase()
  - 打开 ~/.auto-learning/index.db（SQLite）
  - 设置 WAL 模式（并发安全）
  - 检查 schema 版本，运行待执行的迁移
  - 建表：memories, memories_fts, skills, skills_fts, sessions, meta
       │
       ▼
实例化 4 个 Store + ReviewEngine
  - MemoryStore(db, config)
  - SkillStore(db, config)
  - SessionStore(db, config)
  - ReviewEngine(config)  ← 检查 API Key，决定 available 状态
       │
       ▼
注册 12 个 MCP 工具
  - registerMemoryTools(server, memoryStore)    → 5 个工具
  - registerSkillTools(server, skillStore)       → 4 个工具
  - registerSessionTools(server, ...)            → 2 个工具
  - registerStatusTools(server, ...)             → 1 个工具
       │
       ▼
连接 StdioServerTransport
  - 监听 stdin（JSON-RPC 2.0 请求）
  - 响应到 stdout
  - 日志输出到 stderr
```

### 7.2 数据写入流程（以 memory_write 为例）

```
Agent 调用 memory_write(type="feedback", content="不要 mock 数据库", tags=["testing"])
       │
       ▼
MCP Server 收到 JSON-RPC tools/call 请求
       │
       ▼
Zod 校验输入参数（type 必须是 enum 之一，content 必须是 string）
       │
       ▼
MemoryStore.write() 执行：
  │
  ├── 1. 校验：content 非空 + 长度 ≤ 2000 字符
  │
  ├── 2. 生成 ID：mem_{timestamp}_{random6chars}
  │
  ├── 3. 构造 Markdown 文件内容（YAML frontmatter + body）
  │
  ├── 4. 写入文件：~/.auto-learning/memory/feedback/mem_xxx.md
  │
  ├── 5. INSERT INTO memories（id, type, content, tags, confidence, ...）
  │
  └── 6. INSERT INTO memories_fts（id, content, tags）← FTS5 索引
       │
       ▼
返回 JSON-RPC 响应：{"id": "mem_xxx", "status": "created"}
```

### 7.3 数据搜索流程（以 memory_search 为例）

```
Agent 调用 memory_search(query="数据库", type="feedback")
       │
       ▼
MemoryStore.search() 执行：
  │
  ├── 1. 构造 SQL：
  │      SELECT m.*, rank
  │      FROM memories_fts f JOIN memories m ON m.id = f.id
  │      WHERE memories_fts MATCH '数据库'
  │        AND m.type = 'feedback'
  │        AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))
  │      ORDER BY rank
  │      LIMIT 10
  │
  └── 2. FTS5 使用 porter 词干匹配 + BM25 排序
       │
       ▼
返回：[{id, content: "不要 mock 数据库...", type: "feedback", tags, confidence, rank}]
```

### 7.4 技能创建流程（含安全扫描）

```
Agent 调用 skill_create(name="deploy-to-staging", category="devops", content="---\nname: ...")
       │
       ▼
SkillStore.create() 执行：
  │
  ├── 1. 校验名称：/^[a-z0-9][a-z0-9._-]*$/ + 长度 ≤ 64
  │
  ├── 2. 校验内容长度 ≤ 100,000 字符
  │
  ├── 3. 解析 YAML frontmatter → 必须有 name + description 字段
  │
  ├── 4. 检查同名技能是否已存在 → 已存在则报错
  │
  ├── 5. 安全扫描 scanContent(content)：
  │      ├── 逐行匹配 10 条 regex 规则
  │      ├── 发现威胁 → 返回 {status: "blocked", safety_report: "..."}
  │      └── 无威胁 → 继续
  │
  ├── 6. 创建目录：~/.auto-learning/skills/devops/deploy-to-staging/
  │
  ├── 7. 写入文件：SKILL.md
  │
  ├── 8. INSERT INTO skills（name, category, description, ...）
  │
  └── 9. INSERT INTO skills_fts（name, description, tags）
       │
       ▼
返回：{path: "~/.auto-learning/skills/devops/deploy-to-staging/SKILL.md", status: "created", safety_report: "PASS"}
```

### 7.5 Session Review 完整流程

```
Agent 调用 session_review(conversation_summary="Goal: 配置 ESLint...\nApproach: ...")
       │
       ▼
检查 ReviewEngine.available
  ├── false → 返回 {status: "review_unavailable", fallback: "Use memory_write directly"}
  └── true → 继续
       │
       ▼
调用 Anthropic API：
  model: claude-haiku-4-5-20251001
  temperature: 0.3
  max_tokens: 2000
  messages: [{role: "user", content: REVIEW_PROMPT + summary}]
       │
       ▼
解析 Haiku 返回的 JSON（去除 markdown code fence）：
  {
    "memories": [
      {"type": "fact", "content": "ESLint 9 需要 flat config", "tags": ["eslint"], "confidence": "high"}
    ],
    "skills": []
  }
       │
       ▼
遍历 memories，逐条调用 memoryStore.write()
遍历 skills，逐条调用 skillStore.create() 或 skillStore.patch()
       │
       ▼
如果有任何成功提取 → 调用 sessionStore.save() 记录本次会话
       │
       ▼
返回：{
  memories: [...],
  skills: [...],
  actions_taken: ["memory_created: fact", ...]
}
```

### 7.6 学习闭环（理想状态下的完整循环）

```
┌─────────────────────────────────────────────────────────────────┐
│                        学习闭环                                  │
│                                                                 │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐               │
│   │ 1. RECALL │────→│ 2. EXECUTE│────→│ 3. REVIEW │              │
│   │  知识召回  │     │  任务执行  │     │  经验复盘  │              │
│   └──────────┘     └──────────┘     └──────────┘               │
│        ▲                                    │                    │
│        │                                    ▼                    │
│   ┌──────────┐                        ┌──────────┐              │
│   │ 5. EVOLVE │◀───────────────────────│ 4. PERSIST│              │
│   │  技能进化  │                        │  知识持久化│              │
│   └──────────┘                        └──────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

1. RECALL：新任务开始 → memory_search + skill_list → 注入相关知识
2. EXECUTE：Agent 执行任务 → 遇到用户纠正/发现事实 → 立即 memory_write
3. REVIEW：复杂任务完成 → 构造摘要 → session_review → Haiku 提取知识
4. PERSIST：提取的记忆 → memory_store → 文件 + DB
            提取的技能 → skill_store → SKILL.md + DB
5. EVOLVE：下次类似任务 → 搜索匹配 → 使用已学知识
            发现技能过时 → skill_patch → 技能自我更新
```

### 7.7 双存储模型的同步逻辑

```
写入时：
  1. 先写 Markdown 文件（人可读）
  2. 再写 SQLite（可搜索）
  → 如果 DB 写入失败，文件已存在但 DB 无记录 = 孤立文件

读取时：
  - 搜索走 SQLite（FTS5 快速匹配）
  - 查看完整内容走文件（skill_view 读取 SKILL.md）

删除时：
  1. 先删 DB 记录
  2. 再删文件
  → Dashboard 的完整性检查可以发现不一致

当前限制：
  - 直接编辑 Markdown 文件 → DB 索引不会自动更新
  - 需要重新通过 MCP 工具写入才能同步
  - 这是 v1 的已知限制，未来可加 file watcher
```

---

## 8. 技术决策记录

| 决策 | 选择 | 理由 | 替代方案 |
|------|------|------|---------|
| 协议 | MCP（stdio） | 跨 Agent 通用，Claude Code 原生支持 | REST API（需要端口管理） |
| 语言 | TypeScript | MCP SDK 原生支持，类型安全 | Python（Hermes 用的，但 MCP TS SDK 更成熟） |
| 数据库 | SQLite + FTS5 | 零配置，嵌入式，全文搜索内置 | PostgreSQL（过重）、向量 DB（语义搜索但复杂） |
| 搜索 | FTS5 全文搜索 | 毫秒级，不需要 embedding 模型 | 向量搜索（更智能但需要额外模型和存储） |
| Review 模型 | Claude Haiku | 便宜（~$0.001/次）、快速、足够聪明 | Opus（太贵）、本地模型（需要 GPU） |
| 文件格式 | YAML frontmatter + Markdown | 人可读，Hermes 兼容，版本控制友好 | JSON（不够人可读）、纯 Markdown（元数据难管理） |
| 安全 | Regex 规则扫描 | 快速，可解释，零依赖 | LLM 判断（慢且不确定）、沙箱执行（复杂） |

---

## 9. 与 Hermes Agent 的关系

本项目的学习机制灵感来自 Hermes Agent 的 5 个子系统。关键差异：

| Hermes 的做法 | 我们的做法 | 为什么改 |
|-------------|----------|---------|
| Background thread fork 一个完整 AIAgent 做 review | MCP Server 内部调 Haiku API | 不依赖特定 Agent runtime |
| Review 输入是完整对话 snapshot | Review 输入是 Agent 提炼的结构化摘要 | 省 token，Agent 自己做信息压缩 |
| Memory store 在 runtime 内存中，frozen snapshot 注入 prompt | Memory 在 SQLite + 文件中，按需搜索返回 | 不占系统 prompt 空间 |
| Nudge 计数器（每 N 轮自动触发） | Skill 协议定义触发规则（Agent 自觉遵循） | MCP 是被动的，无法内置计数器 |
| 学习逻辑嵌在 Hermes runtime | 独立 MCP Server | 任何 Agent 可用 |

详细的可行性分析和方案设计见 [PROPOSAL.md](./PROPOSAL.md)。

---

## 10. 路线图

### v0.2（近期）

- [ ] 单元测试覆盖核心 Store 和 Scanner
- [ ] 暴露 `memory_update` 为 MCP 工具
- [ ] 安全扫描 override 机制（用户确认后放行）
- [ ] 文件变更监听 → DB 自动同步
- [ ] 跨平台测试（Cursor, Windsurf）

### v0.3（中期）

- [ ] 语义搜索（接 embedding 模型）
- [ ] 多 Profile 支持（按项目隔离记忆空间）
- [ ] Review 引擎支持更多 LLM provider（OpenAI, local models）
- [ ] learning_status 主动提醒（"距上次 review 已过 N 轮"）

### v1.0（长期）

- [ ] Skill Hub — 社区共享学到的技能
- [ ] Trajectory 导出 — 导出为 fine-tuning 训练数据
- [ ] Multi-agent 共享 — 多个 Agent 共享同一个学习后端
- [ ] 学习效果度量 — 追踪已学知识的实际使用率
