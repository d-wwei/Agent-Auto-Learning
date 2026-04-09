# Auto-Learning: 通用 Agent 自学习与进化系统

> 将 Hermes Agent 的闭环学习机制抽象为通用 Agent Skill + MCP Server

---

## 1. 背景与动机

### 1.1 Hermes Agent 的学习机制

Hermes Agent（Nous Research）是目前唯一内置闭环学习系统的 AI Agent。其核心能力：

- **经验积累**：从对话中自动提取可复用知识
- **技能进化**：将复杂工作流固化为可复用 Skill
- **知识召回**：在相关场景自动注入历史经验
- **自我修正**：发现 Skill 过时或错误时主动 patch

### 1.2 核心机制拆解

Hermes 实现了一个**闭环学习系统**，由 5 个独立但协作的子系统组成：

| 子系统 | 做什么 | 怎么触发 | 存什么 |
|--------|--------|---------|--------|
| **Background Review** | 后台 fork 一个 review agent 分析对话 | 每 N 轮/N 次迭代自动触发 | 写入 memory 或 skills |
| **Memory System** | 积累陈述性知识（用户偏好、环境事实） | 主动调用 + 后台 review | MEMORY.md / USER.md |
| **Skills System** | 积累程序性知识（可复用的工作流） | 后台 review + 手动创建 | SKILL.md 文件 |
| **Context Compression** | 长对话的迭代式摘要压缩 | 上下文超过阈值自动触发 | 结构化摘要替换中间消息 |
| **Session Search** | 跨会话检索历史经验 | 主动查询 | SQLite FTS5 索引 |

### 1.3 Hermes 关键设计决策

- Review agent 和主 agent **共享 memory store**，写入立即生效
- Memory 采用 **frozen snapshot** 注入系统 prompt，保持 cache 稳定性
- Skills 采用**两层渐进式披露**：索引始终注入，完整内容按需加载
- Agent 创建的 skills 必须过**安全扫描**，失败则回滚
- 所有写操作使用**原子写入**（tempfile + os.replace）

### 1.4 Hermes 学习闭环的完整流程

```
Experience（经验）
  Agent 与工具/用户交互，完成任务
    ↓
Reflection（反思）—— 后台非阻塞
  Fork review agent，拿到对话 snapshot
  Review agent 审查：有没有值得保存的事实？有没有值得固化的工作流？
    ↓
Persistence（持久化）
  事实 → MEMORY.md / USER.md
  工作流 → SKILL.md 文件
  外部 memory backend 同步（Honcho / Mem0 等）
    ↓
Adaptation（适应）
  下次对话注入已学习的 memory
  相关 skill 按需加载
  用户偏好影响 agent 行为
    ↓
Measurement（度量）
  Token 使用量、成本追踪
  工具使用趋势分析
  生成 trajectory 数据用于模型训练
```

---

## 2. 可行性评估

### 2.1 结论

**可行，采用 MCP Server + Skill 两层架构。**

### 2.2 可移植性分析

#### 高可移植（纯 prompt + 文件 level）

| 能力 | 可移植性 | 理由 |
|------|---------|------|
| 结构化 memory 积累 | **高** | 任何能读写文件的 agent 都能做 |
| Skill 创建/更新/patch | **高** | SKILL.md 格式本身就是 agent-agnostic 的 |
| 迭代式上下文摘要 | **高** | 纯 prompt engineering，不依赖特定 runtime |
| Review prompt 模板 | **高** | 可直接复用 Hermes 的 prompt |
| 安全扫描规则 | **中** | 正则 pattern 可移植，但需要 agent 有执行能力 |

#### 需要适配

| 能力 | 挑战 | 应对方案 |
|------|------|---------|
| **后台 review** | 大多数 agent 框架没有 background thread | MCP server 内部调 LLM 完成 review |
| **Nudge 计数器** | 需要 runtime state tracking | MCP server 内部维护状态 |
| **跨会话检索** | 需要 FTS 索引 | MCP server 内置 SQLite FTS5 |
| **Frozen snapshot** | 需要 prompt injection 控制 | 通过 skill 的 prompt 指令模拟 |

#### 不可移植

- Hermes 的 `AIAgent` 实例化（fork review agent）— Hermes 特有的 runtime
- 插件化 memory provider（Honcho/Mem0 等）— 每个有独立 API
- Token 级别的精确压缩控制 — 依赖具体模型的 tokenizer

### 2.3 为什么选择 MCP + Skill 两层架构

纯 Skill 方案的问题：
- Memory/skill 检索需要把文件内容塞进上下文 → Token 浪费
- 状态管理（计数器、索引）无处安放 → 依赖 agent runtime
- 安全扫描逻辑写在 prompt 里 → 不可靠
- 跨 agent 复用困难 → 每个平台要重写

MCP + Skill 方案的优势：

| 优势 | 说明 |
|------|------|
| **Token 效率** | Memory/skill 检索结果由 MCP 结构化返回，不把原始文件内容塞进上下文 |
| **跨平台** | 任何支持 MCP 的 agent 直接用（Claude Code, Cursor, Windsurf, Codex 等） |
| **有状态** | MCP server 维护 SQLite 索引、计数器、session 历史，不依赖 agent runtime |
| **安全隔离** | 安全扫描在 MCP 层完成，agent 看不到也改不了扫描逻辑 |
| **Review 解耦** | MCP server 可以自己调 LLM API（用便宜模型），不消耗主 agent 的上下文和 token |

---

## 3. 系统架构

### 3.1 整体结构

```
auto-learning/
├── mcp-server/                     # 底层 MCP Server
│   ├── src/
│   │   ├── server.ts               # MCP server 入口（stdio transport）
│   │   ├── tools/
│   │   │   ├── memory.ts           # memory_write / memory_search / memory_gc
│   │   │   ├── skills.ts           # skill_create / skill_patch / skill_list / skill_view
│   │   │   ├── review.ts           # session_review（调 LLM 做知识提取）
│   │   │   └── status.ts           # learning_status / learning_stats
│   │   ├── storage/
│   │   │   ├── memory-store.ts     # Memory 文件存储 + SQLite FTS5 索引
│   │   │   ├── skill-store.ts      # Skill 文件管理 + 原子写入
│   │   │   └── session-store.ts    # Session 摘要存储
│   │   ├── safety/
│   │   │   └── scanner.ts          # Skill 安全扫描（从 Hermes 移植 regex rules）
│   │   └── review/
│   │       ├── prompts.ts          # Review prompt 模板
│   │       └── engine.ts           # Review 引擎（调 LLM API 做知识提取）
│   ├── package.json
│   └── tsconfig.json
│
└── skill/                          # 上层 Skill 包装
    ├── SKILL.md                    # 学习协议 + MCP tool 调用指南（轻量）
    └── references/
        └── trigger-rules.md        # 触发规则详解
```

### 3.2 分层职责

```
┌─────────────────────────────────────────────────┐
│  AI Agent (Claude Code / Cursor / Codex / ...)  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Skill Layer (SKILL.md)                   │  │
│  │  - 定义触发规则（何时学）                    │  │
│  │  - 构造 review 输入（学什么）                │  │
│  │  - 使用召回结果（怎么用）                    │  │
│  │  - 极轻量，几乎不占 token                   │  │
│  └──────────────────┬────────────────────────┘  │
│                     │ MCP tool calls             │
│                     ▼                            │
│  ┌───────────────────────────────────────────┐  │
│  │  MCP Server (auto-learning-mcp)           │  │
│  │  - Memory CRUD + FTS 搜索                  │  │
│  │  - Skill 创建/patch/验证/安全扫描            │  │
│  │  - Review 引擎（调 LLM 做知识提取）          │  │
│  │  - Session 摘要存储                         │  │
│  │  - 状态管理（SQLite）                       │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                            │
│                     ▼                            │
│  ┌───────────────────────────────────────────┐  │
│  │  Storage (~/.auto-learning/)              │  │
│  │  ├── memory/          (记忆文件)           │  │
│  │  ├── skills/          (技能文件)           │  │
│  │  ├── sessions/        (会话摘要)           │  │
│  │  └── index.db         (SQLite FTS5)       │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 3.3 MCP Server 暴露的 Tools

#### Memory 工具

| Tool | 输入 | 输出 | 用途 |
|------|------|------|------|
| `memory_write` | `{type, content, source, tags}` | `{id, status}` | 写入一条记忆 |
| `memory_search` | `{query, limit?, type?}` | `{results: [{id, content, relevance}]}` | 语义/关键词搜索 |
| `memory_gc` | `{max_age_days?, dry_run?}` | `{removed, kept}` | 过期记忆清理 |

#### Skill 工具

| Tool | 输入 | 输出 | 用途 |
|------|------|------|------|
| `skill_create` | `{name, category, content}` | `{path, status, safety_report}` | 创建 skill（含安全扫描） |
| `skill_patch` | `{name, old_string, new_string}` | `{status, diff}` | Patch 已有 skill |
| `skill_list` | `{category?, tags?}` | `{skills: [{name, description, updated}]}` | 列出可用 skills |
| `skill_view` | `{name}` | `{content}` | 查看完整 skill 内容 |

#### Review 工具

| Tool | 输入 | 输出 | 用途 |
|------|------|------|------|
| `session_review` | `{conversation_summary}` | `{memories: [], skills: [], actions_taken}` | 对话 review → 提取知识 |
| `learning_status` | `{}` | `{memory_count, skill_count, last_review, stats}` | 学习系统状态 |

### 3.4 Skill Layer 核心内容

Skill（SKILL.md）只做三件事，保持极轻量：

**1. 定义触发规则** — 什么时候调哪个 MCP tool

| 触发条件 | 动作 |
|---------|------|
| 复杂任务完成（5+ tool calls） | → `session_review` |
| 用户纠正了 agent 的方法 | → `memory_write` (feedback 类型) |
| 会话结束前 | → `session_review` + `learning_status` |
| 新任务开始 | → `memory_search` + `skill_list` |
| 发现 skill 过时 | → `skill_patch` |

**2. 提供 review 输入构造指南** — 告诉 agent 怎么构造 `session_review` 的输入

- 不传完整对话（太贵），只传结构化摘要
- Agent 自己提炼 summary 再传给 MCP
- 摘要格式：Goal / Approach / Outcome / Learnings / Errors

**3. 知识召回指令** — 新任务时怎么用检索结果

- `memory_search` 返回匹配记忆 → 作为决策参考
- `skill_list` 返回匹配技能 → 加载并遵循

---

## 4. Review 引擎设计

### 4.1 核心问题

Review 放在哪里执行？

| 方案 | 优点 | 缺点 |
|------|------|------|
| Agent 自己 review（纯 Skill） | 简单 | 消耗主 agent token，阻塞时间长 |
| MCP server 调 LLM（本方案） | Token 隔离，可用便宜模型 | MCP server 需要 API key |
| 不做自动 review，全靠手动 | 最简单 | 学习效果差 |

**选择：MCP server 调 LLM。** 理由：

- 可用 Haiku 等便宜快速模型做知识提取，成本极低
- 不消耗主 agent 的上下文窗口
- Review 结果直接写入 storage，agent 只收到确认

### 4.2 Review Prompt 模板

从 Hermes 抽象出的三个核心 prompt：

#### Memory Review Prompt

```
Review the conversation summary below and extract knowledge worth persisting.

Focus on:
1. User preferences, work style, communication expectations
2. Environment facts (tool quirks, project conventions, discovered patterns)
3. Feedback corrections (user corrected agent's approach)

For each item, output:
- type: "preference" | "fact" | "feedback"
- content: concise statement
- confidence: "high" | "medium"
- tags: [relevant tags]

If nothing is worth saving, return empty list.
```

#### Skill Review Prompt

```
Review the conversation summary below and determine if a reusable procedure was discovered.

Focus on:
- Non-trivial approach requiring trial-and-error
- Workflow the user expected but agent didn't initially follow
- Multi-step process that would benefit future similar tasks

If worth saving as a skill, output:
- name: kebab-case skill name
- category: broad category
- description: one-line description
- content: full SKILL.md content with YAML frontmatter

If an existing skill should be updated, output:
- action: "patch"
- name: existing skill name
- old_string: text to replace
- new_string: replacement text
- reason: why the patch is needed

If nothing is worth saving, return empty.
```

#### Combined Review Prompt

```
Review the conversation summary and consider both:

**Memory**: User preferences, environment facts, feedback corrections?
**Skills**: Reusable procedures, non-trivial workflows, corrected approaches?

Only act if genuinely worth saving. Quality over quantity.
```

### 4.3 Review 引擎配置

```yaml
# MCP server config
review:
  model: "claude-haiku-4-5-20251001"   # 便宜快速，做知识提取够用
  provider: "anthropic"                 # 支持 anthropic / openai / openrouter
  api_key_env: "ANTHROPIC_API_KEY"      # 从环境变量读
  max_tokens: 2000                      # Review 输出上限
  temperature: 0.3                      # 偏确定性
```

---

## 5. 存储设计

### 5.1 目录结构

```
~/.auto-learning/
├── config.yaml              # 全局配置
├── index.db                 # SQLite 数据库（FTS5 索引 + 元数据）
├── memory/
│   ├── preferences/         # 用户偏好类记忆
│   │   └── *.md
│   ├── facts/               # 环境事实类记忆
│   │   └── *.md
│   └── feedback/            # 反馈修正类记忆
│       └── *.md
├── skills/
│   ├── {category}/
│   │   └── {skill-name}/
│   │       ├── SKILL.md
│   │       ├── references/
│   │       ├── templates/
│   │       └── scripts/
│   └── ...
└── sessions/
    └── {date}-{id}.md       # Session 摘要
```

### 5.2 Memory 文件格式

```markdown
---
id: mem_20260409_001
type: feedback
source: "conversation:2026-04-09"
tags: [testing, tdd]
confidence: high
created: 2026-04-09T14:30:00Z
expires: null
---

用户偏好：在这个项目中不使用 mock 测试数据库，要用真实数据库。
原因：上季度 mock 测试通过但生产环境迁移失败。
```

### 5.3 Skill 文件格式

沿用 Hermes 的 SKILL.md 格式（YAML frontmatter + Markdown body），保证生态兼容：

```markdown
---
name: skill-name
description: One-line description
version: 1.0.0
metadata:
  auto-learning:
    tags: [tag1, tag2]
    created_by: session_review
    created_from: "session:2026-04-09"
---

# Detailed Instructions

[Markdown instructions for how to use this skill]
```

### 5.4 SQLite Schema

```sql
-- 记忆索引
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- preference | fact | feedback
  content TEXT NOT NULL,
  tags TEXT,                 -- JSON array
  confidence TEXT,
  source TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  file_path TEXT NOT NULL
);
CREATE VIRTUAL TABLE memories_fts USING fts5(content, tags);

-- 技能索引
CREATE TABLE skills (
  name TEXT PRIMARY KEY,
  category TEXT,
  description TEXT,
  version TEXT,
  tags TEXT,                 -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  file_path TEXT NOT NULL
);
CREATE VIRTUAL TABLE skills_fts USING fts5(name, description, tags);

-- 会话索引
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  summary TEXT,
  memories_created INTEGER DEFAULT 0,
  skills_created INTEGER DEFAULT 0,
  file_path TEXT NOT NULL
);
```

---

## 6. 安全设计

### 6.1 Skill 安全扫描

从 Hermes `skills_guard.py` 移植的核心规则：

```typescript
const THREAT_PATTERNS = [
  // Prompt injection
  { pattern: /ignore\s+(previous|all|above)\s+instructions/i, type: "prompt_injection" },
  { pattern: /system\s+prompt\s+override/i, type: "sys_prompt_override" },

  // Command injection
  { pattern: /\$\(.*\)/, type: "command_substitution" },
  { pattern: /`.*`/, type: "backtick_execution" },

  // Exfiltration
  { pattern: /curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET)/i, type: "exfil_curl" },
  { pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc)/i, type: "read_secrets" },

  // Hidden content
  { pattern: /[\u200B-\u200F\u2028-\u202F]/, type: "hidden_unicode" },
];
```

### 6.2 安全流程

```
skill_create / skill_patch
    ↓
验证 YAML frontmatter（必需字段、大小限制）
    ↓
安全扫描（regex pattern matching）
    ↓
  ┌─ PASS → 原子写入文件 → 更新索引 → 返回成功
  └─ FAIL → 回滚 → 返回安全报告（具体触发了哪条规则）
```

### 6.3 大小限制

| 限制 | 值 | 理由 |
|------|-----|------|
| Skill name | 64 chars | 防止文件路径过长 |
| Skill description | 1024 chars | 控制索引注入大小 |
| SKILL.md content | 100,000 chars | ~36K tokens，单个 skill 上限 |
| 支持文件大小 | 1 MiB | 防止存储膨胀 |
| Memory 单条 | 2,000 chars | 保持 memory 精炼 |

---

## 7. 与 Hermes 的对比

| 维度 | Hermes | Auto-learning (本方案) |
|------|--------|----------------------|
| **架构** | 单体（学习逻辑嵌在 agent runtime） | 分层（MCP server + Skill） |
| **Review 时机** | 后台 thread，不阻塞 | MCP call，短暂阻塞（用 Haiku 快速完成） |
| **Review 输入** | 完整对话 snapshot（大量 token） | Agent 提炼的结构化 summary（省 token） |
| **状态管理** | Runtime 内存 + 文件 | MCP server 内部 SQLite |
| **Memory 提供者** | 可插拔（Honcho/Mem0/etc.） | 内置文件存储 + FTS5（简化但够用） |
| **Skill 格式** | YAML frontmatter + Markdown | 相同（保持生态兼容） |
| **安全扫描** | 内置 skills_guard.py | 移植相同规则到 MCP server |
| **跨 agent 复用** | 不可能（Hermes only） | 任何 MCP 兼容 agent |
| **Token 开销** | 高（完整对话 review） | 低（summary review + 结构化返回） |
| **部署** | pip install hermes-agent | npm install + MCP 配置 |

---

## 8. 实施计划

### Phase 1: MCP Server 骨架（~1.5 天）

**目标**：可用的 MCP server，支持基础 memory 和 skill 操作

- [ ] MCP server 基础框架（TypeScript, stdio transport）
- [ ] `memory_write` / `memory_search` 实现（SQLite FTS5）
- [ ] `skill_create` / `skill_patch` / `skill_list` / `skill_view` 实现
- [ ] 安全扫描模块
- [ ] 原子文件写入
- [ ] `learning_status` 实现
- [ ] 基础配置管理

### Phase 2: Review 引擎（~1 天）

**目标**：自动知识提取能力

- [ ] Review prompt 模板（从 Hermes 抽象）
- [ ] LLM API 调用层（支持 Anthropic / OpenAI）
- [ ] `session_review` tool 实现
- [ ] Review 结果自动写入 memory/skill store
- [ ] 配置化模型选择

### Phase 3: Skill 包装（~0.5 天）

**目标**：Agent 端的学习协议

- [ ] SKILL.md 编写：触发协议 + MCP tool 调用指南
- [ ] trigger-rules.md 详细触发规则
- [ ] 在 Claude Code 中测试 MCP 配置

### Phase 4: 端到端验证（~0.5 天）

**目标**：完整闭环验证

- [ ] 场景 1：执行复杂任务 → 自动 review → 知识积累
- [ ] 场景 2：新会话 → 知识召回 → 影响行为
- [ ] 场景 3：Skill 创建 → 下次匹配 → 自动加载
- [ ] 场景 4：Skill 过时 → 检测 → 自动 patch
- [ ] Token 用量对比测试

### Phase 5: 跨平台适配（可选，~1 天）

- [ ] Cursor / Windsurf 兼容性测试
- [ ] Codex CLI 兼容性测试
- [ ] 平台适配文档

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| MCP call 阻塞主对话 | 用户体验 | Review 用 Haiku（快速）；memory_search 走 FTS（毫秒级） |
| Agent 不遵循 Skill 的触发规则 | 学习不触发 | Skill 设为 rigid 模式；提供明确的触发检查清单 |
| Memory 膨胀 | 上下文浪费 | 过期策略 + `memory_gc` 定期清理 |
| Review 提取质量差 | 积累噪音 | 带 confidence 评分；低置信度标记为 pending |
| 安全扫描误报 | 合法 skill 被拒 | 提供 override 机制（需用户确认） |
| LLM API key 管理 | 配置复杂 | 支持环境变量；可 fallback 为不启用 review 引擎 |

---

## 10. 未来扩展

### 10.1 短期（v1.1）

- **Memory 语义搜索**：集成 embedding 模型，从 FTS5 升级到向量检索
- **Skill Hub**：类似 Hermes agentskills.io，共享社区 skill
- **多 profile 支持**：不同项目/角色独立 memory 空间

### 10.2 中期（v2.0）

- **Memory Provider 插件化**：支持 Honcho / Mem0 等外部 memory 后端
- **主动学习**：MCP server 分析 memory pattern，主动提问用户确认
- **Skill 版本管理**：Git-based skill versioning，支持 diff 和 rollback

### 10.3 长期

- **Trajectory 导出**：将学习数据导出为 fine-tuning 格式
- **Multi-agent 共享学习**：多个 agent 共享同一个 MCP server，知识互通
- **学习效果度量**：追踪"学到的知识实际被使用了多少次"

---

## 附录 A: Hermes 源码关键文件索引

| 文件 | 行号 | 内容 |
|------|------|------|
| `run_agent.py` | 1680-1822 | `_spawn_background_review()`, review prompts |
| `run_agent.py` | 6920-6930 | Memory nudge trigger |
| `run_agent.py` | 7157-7161 | Skill nudge iteration counter |
| `run_agent.py` | 9146-9174 | Review spawn after response |
| `tools/skill_manager_tool.py` | 全文 | Skill CRUD + 安全扫描 + 原子写入 |
| `tools/skills_guard.py` | 全文 | 安全扫描规则 |
| `agent/memory_manager.py` | 全文 | Memory 编排（多 provider） |
| `agent/builtin_memory_provider.py` | 全文 | 文件存储 memory provider |
| `agent/context_compressor.py` | 全文 | 迭代式上下文压缩 |
| `agent/prompt_builder.py` | 144-186 | Memory/Skill guidance prompts |
| `agent/prompt_builder.py` | 529-746 | Skills system prompt 构建 |
| `agent/skill_utils.py` | 全文 | Skill 发现 + metadata 解析 |

## 附录 B: 名词对照

| Hermes 术语 | 本方案对应 | 说明 |
|------------|----------|------|
| Background Review | `session_review` MCP tool | 从后台 thread 变为 MCP call |
| Memory Store | `memory_write` / `memory_search` | 从 runtime 内存变为 MCP 管理 |
| Skill Manager | `skill_create` / `skill_patch` | 从 agent 内置 tool 变为 MCP tool |
| Nudge Interval | Skill trigger rules | 从 runtime 计数器变为 prompt 规则 |
| MEMORY.md / USER.md | `~/.auto-learning/memory/*.md` | 存储位置变化，格式类似 |
| SKILL.md | `~/.auto-learning/skills/*/SKILL.md` | 格式完全兼容 Hermes |
| skills_guard | MCP scanner module | 相同规则，不同执行位置 |
