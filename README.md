# Auto-Learning：AI Agent 自学习与进化系统

让任何支持 MCP 的 AI Agent 具备**从经验中学习**的能力 — 记住用户偏好、积累环境知识、将复杂工作流固化为可复用技能，并在未来的对话中自动召回。

---

## 这是什么？

Auto-Learning 是一个 **MCP Server + Skill** 的两层系统：

- **底层 MCP Server**：管理记忆、技能、会话的存储和检索，内置 LLM 驱动的知识提取引擎
- **上层 Skill 协议**：告诉 Agent 什么时候该学、该学什么、该怎么用学到的知识

装上之后，你的 AI Agent 会像一个有记忆的助手一样工作 — **你纠正过的错误不会再犯，你说过的偏好不需要重复，复杂任务的解法会被自动保存下来给下次用。**

---

## 能做什么？（使用场景）

### 场景 1：记住你的偏好

```
你：不要在测试里 mock 数据库，我们之前因为 mock 和生产不一致踩过坑
Agent：（自动调用 memory_write，保存为 feedback 类型记忆）

— 三天后，新的对话 —

你：帮我写这个模块的测试
Agent：（自动调用 memory_search，找到之前的反馈）
Agent：好的，我会用真实数据库连接写集成测试，不使用 mock。
```

### 场景 2：积累环境知识

```
Agent 在执行任务中发现这个项目用 pnpm 而不是 npm
→ 自动保存为 fact 类型记忆："This project uses pnpm, not npm"

下次在这个项目工作时：
Agent：（搜索到这条记忆）直接用 pnpm install，不会再试 npm
```

### 场景 3：学会复杂工作流

```
你让 Agent 部署一个服务，Agent 经过 8 步试错终于成功
→ 会话结束时，review 引擎分析整个过程
→ 自动创建一个 skill：deploy-to-staging
→ 下次你说"帮我部署"，Agent 搜到这个 skill，直接按流程走
```

### 场景 4：自我修正

```
Agent 使用了一个旧版本的 skill，发现某一步已经过时
→ 自动调用 skill_patch 更新这一步
→ 下次使用这个 skill 时，已经是修正后的版本
```

---

## 快速开始

### 前置条件

- Node.js 18+
- 任何支持 MCP 的 AI Agent（Claude Code, Cursor, Windsurf 等）

### 安装

```bash
# 1. 克隆仓库
git clone <repo-url> auto-learning
cd auto-learning

# 2. 安装依赖并构建
cd mcp-server
npm install
npm run build

# 3. 注册到 Claude Code
claude mcp add --scope user auto-learning -- node /你的路径/auto-learning/mcp-server/dist/index.js
```

### 验证

重启 Claude Code，然后输入：

```
调用 learning_status 看看学习系统的状态
```

你应该看到类似这样的返回：

```json
{
  "memory_count": 0,
  "skill_count": 0,
  "session_count": 0,
  "review_engine": "inactive (no API key)",
  "recent_sessions": []
}
```

### 启用 Review 引擎（可选但推荐）

Review 引擎能自动从对话中提取知识。需要设置 Anthropic API Key：

```bash
# 方法 1：在 shell 配置中设置
export ANTHROPIC_API_KEY=sk-ant-...

# 方法 2：在 Claude Code MCP 配置中设置
claude mcp add --scope user auto-learning \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -- node /你的路径/auto-learning/mcp-server/dist/index.js
```

Review 引擎使用 Claude Haiku（成本极低，约 $0.001/次 review），不会消耗主 Agent 的上下文窗口。

**不设置 API Key 也完全可以用** — 只是 `session_review` 自动提取功能不可用，你可以直接调用 `memory_write` 和 `skill_create` 手动保存知识。

---

## 12 个 MCP 工具详解

### 记忆工具（5 个）

| 工具 | 做什么 | 输入 | 输出 |
|------|--------|------|------|
| `memory_write` | 写入一条记忆 | type, content, source?, tags?, confidence? | `{id, status}` |
| `memory_read` | 读取指定记忆 | id | 完整的记忆对象 |
| `memory_search` | 全文搜索记忆 | query, limit?, type? | 按相关度排序的结果列表 |
| `memory_delete` | 删除一条记忆 | id | `{status}` |
| `memory_gc` | 清理过期/低质量记忆 | max_age_days?, dry_run? | 删除了哪些、保留了多少 |

**记忆有三种类型：**

- **preference**：用户的工作风格、沟通偏好（"用户喜欢简洁回复"）
- **fact**：环境事实、工具行为、项目约定（"这个项目用 pnpm"）
- **feedback**：用户对 Agent 行为的修正（"不要 mock 数据库"）

每条记忆还有 **confidence 评分**（high/medium/low）和 **tags**，用于搜索和过期清理。

### 技能工具（4 个）

| 工具 | 做什么 | 输入 | 输出 |
|------|--------|------|------|
| `skill_create` | 创建新技能 | name, category, content (SKILL.md) | `{path, status, safety_report}` |
| `skill_patch` | 修补已有技能 | name, old_string, new_string | `{status, diff}` |
| `skill_list` | 列出所有技能 | category? | 技能列表（name, description, category, updated） |
| `skill_view` | 查看技能完整内容 | name | SKILL.md 全文 |

技能使用 YAML frontmatter + Markdown 格式（与 Hermes Agent 生态兼容）：

```yaml
---
name: deploy-to-staging
description: Deploy service to staging environment
version: 1.0.0
metadata:
  auto-learning:
    tags: [devops, deployment]
    created_by: session_review
---

# Deploy to Staging

1. First run lint checks...
2. Build the Docker image...
...
```

**安全机制**：每次创建或修补技能时，内容会经过安全扫描（检测 prompt 注入、命令注入、数据泄露、隐藏字符）。不通过扫描的技能会被拒绝并返回详细报告。

### 会话工具（2 个）

| 工具 | 做什么 | 输入 | 输出 |
|------|--------|------|------|
| `session_review` | 提交对话摘要，自动提取知识 | conversation_summary | 提取的 memories + skills + 执行动作 |
| `session_search` | 搜索历史会话 | query, limit?, days? | 匹配的会话列表 |

`session_review` 是学习闭环的核心 — Agent 将对话摘要发给 review 引擎，引擎用 LLM 分析后自动调用 `memory_write` 和 `skill_create` 持久化知识。

### 状态工具（1 个）

| 工具 | 做什么 | 输入 | 输出 |
|------|--------|------|------|
| `learning_status` | 查看学习系统状态 | 无 | memory/skill/session 数量、review 引擎状态、最近会话 |

---

## 工作原理

### 整体架构

```
┌──────────────────────────────────────────────────┐
│  AI Agent (Claude Code / Cursor / Windsurf)      │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Skill Layer (SKILL.md)                    │  │
│  │  定义触发规则：什么时候该调哪个 MCP tool     │  │
│  └──────────────────┬─────────────────────────┘  │
│                     │ MCP tool calls              │
│                     ▼                             │
│  ┌────────────────────────────────────────────┐  │
│  │  MCP Server (auto-learning-mcp)            │  │
│  │                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐  │  │
│  │  │ Memory   │ │ Skill    │ │ Session   │  │  │
│  │  │ Store    │ │ Store    │ │ Store     │  │  │
│  │  └────┬─────┘ └────┬─────┘ └─────┬─────┘  │  │
│  │       │             │             │         │  │
│  │  ┌────┴─────────────┴─────────────┴─────┐  │  │
│  │  │  SQLite + FTS5 (全文搜索索引)          │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  │                                            │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  Review Engine (调 Claude Haiku)      │  │  │
│  │  │  自动从对话摘要中提取记忆和技能         │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  │                                            │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  Safety Scanner                      │  │  │
│  │  │  Regex 扫描防注入/泄露/隐藏内容        │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│                     │                             │
│                     ▼                             │
│  ┌────────────────────────────────────────────┐  │
│  │  ~/.auto-learning/                         │  │
│  │  ├── memory/          Markdown 记忆文件     │  │
│  │  ├── skills/          SKILL.md 技能文件     │  │
│  │  ├── sessions/        会话摘要             │  │
│  │  ├── index.db         SQLite FTS5 索引     │  │
│  │  └── config.yaml      配置（可选）          │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 学习闭环

```
1. RECALL（召回）
   新任务开始 → memory_search + skill_list
   → 注入相关的历史知识和技能

2. EXECUTE（执行）
   Agent 正常工作，同时监听学习机会
   → 用户纠正 → 立即 memory_write(feedback)
   → 发现事实 → memory_write(fact)

3. REVIEW（复盘）
   复杂任务完成后 → 构造结构化摘要 → session_review
   → Review 引擎（Haiku）分析 → 自动提取记忆和技能

4. PERSIST（持久化）
   记忆 → ~/.auto-learning/memory/{type}/{id}.md + SQLite
   技能 → ~/.auto-learning/skills/{category}/{name}/SKILL.md + SQLite

5. EVOLVE（进化）
   下次类似任务 → 搜索到之前学的内容 → 更好地执行
   发现技能过时 → skill_patch → 技能自我更新
```

### 双存储模型

每条数据同时存在两个地方：

| 存储 | 用途 | 优势 |
|------|------|------|
| **Markdown 文件** | 人可读的持久化 | 可以用编辑器直接查看、编辑、版本控制 |
| **SQLite + FTS5** | 快速搜索和索引 | 毫秒级全文搜索、结构化查询 |

这意味着你随时可以打开 `~/.auto-learning/memory/` 目录，像浏览笔记一样浏览 Agent 学到的所有知识。

### Review 引擎原理

Review 引擎不在主 Agent 的上下文窗口内运行 — 它是 MCP Server 内部独立调用 Claude Haiku API 的：

```
Agent 的上下文窗口（Opus / Sonnet）     Review 引擎（Haiku）
┌───────────────────────┐              ┌──────────────────────┐
│ 用户消息              │              │ 对话摘要（~500字）     │
│ 工具调用              │              │ 提取 prompt          │
│ 任务执行              │              │ → 输出 JSON          │
│ ...                   │              │   memories: [...]     │
│                       │  摘要传递     │   skills: [...]       │
│ session_review(摘要) ──┼─────────────→│                      │
│                       │  结果返回     │                      │
│ ←──────────────────────┼─────────────│                      │
│ "提取了2条记忆,1个技能"│              │                      │
└───────────────────────┘              └──────────────────────┘
```

好处：
- **不占主 Agent 的 token** — review 用的是独立的 API 调用
- **成本极低** — Haiku 的价格约 $0.001/次
- **Agent 只传摘要** — 不传完整对话，节省 token
- **自动持久化** — review 引擎提取的知识直接写入 storage，Agent 只收到确认

### 安全扫描

每个 Agent 创建或修补的技能都会经过 10 条安全规则扫描：

| 类别 | 检测内容 | 示例 |
|------|---------|------|
| Prompt 注入 | 试图覆盖系统指令 | "ignore previous instructions" |
| 身份劫持 | 试图重定义 Agent 身份 | "you are now a..." |
| 信息隐藏 | 试图对用户隐瞒信息 | "do not tell the user" |
| 命令注入 | Shell 命令替换 | `$(rm -rf /)` |
| 命令链 | 危险命令串联 | `; curl evil.com` |
| 数据泄露 | 读取敏感文件 | `cat .env` |
| 远程执行 | 下载并执行远程脚本 | `wget ... \| bash` |
| 隐藏字符 | 不可见 Unicode 字符 | 零宽字符 |

扫描不通过的技能会被拒绝，并返回具体触发了哪条规则。

---

## 数据存储

所有数据存储在 `~/.auto-learning/` 下：

```
~/.auto-learning/
├── config.yaml              # 可选配置（覆盖默认值）
├── index.db                 # SQLite 数据库（FTS5 全文索引）
├── memory/
│   ├── preferences/         # 用户偏好
│   │   └── mem_1712345678_abc123.md
│   ├── facts/               # 环境事实
│   │   └── mem_1712345679_def456.md
│   └── feedback/            # 行为反馈
│       └── mem_1712345680_ghi789.md
├── skills/
│   └── devops/
│       └── deploy-to-staging/
│           └── SKILL.md
└── sessions/
    └── session_2026-04-09_jkl012.md
```

每个记忆文件是可读的 Markdown：

```markdown
---
id: mem_1712345678_abc123
type: feedback
source: "session_review"
tags: ["testing","database"]
confidence: high
created: 2026-04-09T14:30:00.000Z
expires: null
---

不要在集成测试中 mock 数据库。用真实数据库连接。
原因：上季度 mock 测试通过但生产环境迁移失败。
```

---

## 配置

创建 `~/.auto-learning/config.yaml` 可以自定义行为（文件不存在时使用默认值）：

```yaml
# Review 引擎配置
review:
  enabled: true                          # 是否启用自动知识提取
  model: "claude-haiku-4-5-20251001"     # 用哪个模型做 review
  apiKeyEnv: "ANTHROPIC_API_KEY"         # 从哪个环境变量读 API key
  maxTokens: 2000                        # review 输出 token 上限
  temperature: 0.3                       # 偏确定性

# 大小限制
limits:
  memoryMaxChars: 2000      # 单条记忆最大字符数
  skillMaxChars: 100000     # 单个技能文件最大字符数
  skillNameMaxLen: 64       # 技能名称最大长度
  skillDescMaxLen: 1024     # 技能描述最大长度
```

---

## 设计来源

本项目的学习机制参考了 [Hermes Agent](https://github.com/NousResearch/hermes-agent)（Nous Research）的闭环学习系统，并做了以下关键改进：

| 维度 | Hermes | Auto-Learning |
|------|--------|---------------|
| 架构 | 单体（嵌在 agent runtime） | 分层（MCP Server + Skill） |
| Review 机制 | 后台 fork agent thread | MCP Server 独立调 LLM |
| Review 输入 | 完整对话 snapshot | Agent 提炼的结构化摘要 |
| 跨 Agent 复用 | 仅 Hermes | 任何 MCP 兼容 Agent |
| Token 开销 | 高 | 低（摘要 + 结构化返回） |

详细的可行性分析和方案设计见 [PROPOSAL.md](./PROPOSAL.md)。

---

## 项目结构

```
auto-learning/
├── mcp-server/                  # MCP Server（TypeScript）
│   ├── src/
│   │   ├── index.ts             # 入口 — 注册工具、连接 stdio
│   │   ├── config.ts            # 配置加载
│   │   ├── storage/
│   │   │   ├── database.ts      # SQLite + FTS5 + 迁移
│   │   │   ├── memory-store.ts  # 记忆 CRUD + 搜索 + GC
│   │   │   ├── skill-store.ts   # 技能 CRUD + 安全扫描
│   │   │   └── session-store.ts # 会话存储 + 搜索
│   │   ├── safety/
│   │   │   └── scanner.ts       # 安全扫描（10 条规则）
│   │   ├── review/
│   │   │   └── engine.ts        # LLM 知识提取引擎
│   │   └── tools/
│   │       ├── memory-tools.ts  # 5 个记忆工具
│   │       ├── skill-tools.ts   # 4 个技能工具
│   │       ├── session-tools.ts # 2 个会话工具
│   │       └── status-tools.ts  # 1 个状态工具
│   ├── package.json
│   └── tsconfig.json
├── skill/                       # Skill 协议（给 Agent 看的）
│   ├── SKILL.md                 # 学习协议 + 触发规则
│   └── references/
│       └── trigger-rules.md     # 详细触发条件
├── docs/
│   └── plans/                   # 实施计划
└── PROPOSAL.md                  # 完整方案设计文档
```

---

## 技术栈

- **TypeScript** — MCP Server 实现语言
- **@modelcontextprotocol/sdk** — MCP 协议框架（stdio transport）
- **better-sqlite3** — 嵌入式数据库（FTS5 全文搜索）
- **@anthropic-ai/sdk** — Claude API（Review 引擎用 Haiku）
- **zod** — MCP 工具参数校验
- **yaml** — 配置文件解析
