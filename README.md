# Auto-Learning：AI Agent 自学习与进化系统

让任何支持 MCP 的 AI Agent 具备**从经验中学习**的能力 — 记住用户偏好、积累环境知识、将复杂工作流固化为可复用技能，并在未来的对话中自动召回。

---

## 这是什么？

Auto-Learning 是一个**三层系统**：

- **认知底座**（cognitive-protocol.md）：~30 行永远在线的规则，改变 Agent 的行为模式 — 让它天然具备"任务前搜索、执行中捕获、完成后复盘"的意识
- **MCP Server**（3 个工具）：管理记忆、技能、会话的存储和检索，内置 LLM 驱动的知识提取引擎
- **文件存储**（~/.auto-learning/）：所有数据同时以 Markdown 文件 + SQLite 索引双重存储，人类可直接浏览审计

装上之后，你的 AI Agent 会像一个有记忆的助手一样工作 — **你纠正过的错误不会再犯，你说过的偏好不需要重复，复杂任务的解法会被自动保存下来给下次用。**

---

## 能做什么？（使用场景）

### 场景 1：记住你的偏好

```
你：不要在测试里 mock 数据库，我们之前因为 mock 和生产不一致踩过坑
Agent：（自动调用 learn，保存为 feedback 类型记忆）

— 三天后，新的对话 —

你：帮我写这个模块的测试
Agent：（自动调用 recall，找到之前的反馈）
Agent：好的，我会用真实数据库连接写集成测试，不使用 mock。
```

### 场景 2：积累环境知识

```
Agent 在执行任务中发现这个项目用 pnpm 而不是 npm
→ 自动调用 learn(action=memory, type=fact)
→ 保存："This project uses pnpm, not npm"

下次在这个项目工作时：
Agent：（recall 搜索到这条记忆）直接用 pnpm install
```

### 场景 3：学会复杂工作流

```
你让 Agent 部署一个服务，Agent 经过 8 步试错终于成功
→ 会话结束时，Agent 调用 learn(action=review) 提交结构化摘要
→ Review 引擎（Haiku）自动提取知识，创建 skill：deploy-to-staging
→ 下次你说"帮我部署"，recall 搜到这个 skill，直接按流程走
```

### 场景 4：自我修正

```
Agent 使用了一个旧版本的 skill，发现某一步已经过时
→ 自动调用 learn(action=skill_patch) 更新这一步
→ 下次使用这个 skill 时，已经是修正后的版本
```

---

## 快速开始

### 前置条件

- Node.js 18+
- 任何支持 MCP 的 AI Agent（Claude Code, Cursor, Windsurf, Codex, Gemini CLI 等）

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/d-wwei/Agent-Auto-Learning.git
cd Agent-Auto-Learning

# 2. 安装依赖并构建
cd mcp-server
npm install
npm run build

# 3. 注册 MCP Server 到 Claude Code
claude mcp add --scope user auto-learning \
  -- node /你的路径/Agent-Auto-Learning/mcp-server/dist/index.js

# 4. 安装认知底座（自动检测平台）
npm run setup
```

`npm run setup` 会自动检测你使用的 Agent 平台（Claude Code / Codex / Gemini CLI / Cursor），将认知底座注入到对应的配置文件中。

### 启用 Review 引擎（可选但推荐）

Review 引擎能自动从对话中提取知识。需要设置 Anthropic API Key：

```bash
claude mcp remove auto-learning
claude mcp add --scope user auto-learning \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -- node /你的路径/Agent-Auto-Learning/mcp-server/dist/index.js
```

Review 引擎使用 Claude Haiku（成本极低，约 $0.001/次 review），不消耗主 Agent 的上下文窗口。

**不设置 API Key 也完全可以用** — 只是 `learn(action=review)` 自动提取功能不可用，你可以用 `learn(action=memory)` 手动保存知识。

### 验证

重启 Agent，输入：

```
调用 learning_status
```

看到返回 JSON 就说明一切正常。

---

## 3 个 MCP 工具

v0.2.0 将之前的 12 个工具合并为 3 个高阶入口，Agent 只需要记住两个动作：**开始前 recall，结束后 learn**。

### `recall` — 搜索先验知识

在任务开始前调用，一次返回相关记忆 + 匹配技能。

```
recall(query: "ESLint TypeScript 配置")
→ 返回：
  memories: [{type: "fact", content: "ESLint 9 requires flat config...", tags: ["eslint"]}]
  skills: [{name: "eslint-flat-config", description: "..."}]
  loaded_skill: {name: "eslint-flat-config", content: "完整技能内容..."}  // 唯一匹配时自动加载
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string (必填) | 搜索关键词 |
| `limit` | number (可选) | 最大记忆结果数，默认 5 |

### `learn` — 持久化知识

通过 `action` 参数智能路由到不同操作：

| action | 用途 | 必填参数 |
|--------|------|---------|
| `memory` | 保存一条记忆（偏好/事实/反馈） | `type`, `content` |
| `review` | 提交对话摘要，自动提取知识 | `content`（结构化摘要） |
| `skill_create` | 创建一个可复用技能 | `name`, `category`, `content`（SKILL.md） |
| `skill_patch` | 修补已有技能 | `name`, `old_string`, `new_string` |
| `delete` | 删除一条记忆 | `id` |
| `gc` | 清理过期/低质量记忆 | `max_age_days?`, `dry_run?` |

### `learning_status` — 学习系统状态

无参数，返回记忆/技能/会话数量、review 引擎状态、已学技能列表、最近会话。

### 上下文开销

3 个工具总共约 **619 tokens**（v0.1.0 的 12 个工具是 1,145 tokens，减少 46%）。对于 200K context 的模型占 0.3%，可忽略。

---

## 认知底座

认知底座是 ~30 行永远在线的规则，注入到 Agent 的系统配置中（CLAUDE.md / AGENTS.md / .cursorrules 等），改变 Agent 的行为模式。

### 核心认知转变

| 默认模式 | 目标模式 |
|---------|---------|
| 每次对话独立，任务完成即结束 | 每次对话是学习机会，经验跨会话累积 |
| 遇到问题从零开始试错 | 先搜索是否有先验知识 |
| 用户纠正后口头承认 | 立即持久化纠正，下次不再犯 |
| 复杂任务完成后直接结束 | 结构化复盘，提取可复用知识 |

### 包含的文件

```
cognitive-base/
├── cognitive-protocol.md    # ~30 行核心规则（注入系统配置，永远在线）
├── anti-patterns.md         # 6 种学习失败模式及检测方法
├── examples.md              # 3 个 before/after 场景对比
└── install/                 # 各平台安装指南
    ├── claude-code.md
    ├── codex.md
    ├── cursor.md
    └── gemini.md
```

`npm run setup` 会自动安装认知底座到你的 Agent 平台。也可以手动安装 — 将 `cognitive-protocol.md` 的内容复制到你的 Agent 系统配置文件中。

---

## 工作原理

### 学习闭环

```
1. RECALL（召回）
   新任务开始 → recall(query) → 注入相关记忆和技能

2. EXECUTE（执行）
   Agent 正常工作
   → 用户纠正 → learn(action=memory, type=feedback)
   → 发现事实 → learn(action=memory, type=fact)

3. REVIEW（复盘）
   复杂任务完成 → 构造结构化摘要 → learn(action=review)
   → Review 引擎（Haiku）分析 → 自动提取记忆和技能

4. PERSIST（持久化）
   记忆 → ~/.auto-learning/memory/*.md + SQLite FTS5
   技能 → ~/.auto-learning/skills/*/SKILL.md + SQLite FTS5

5. EVOLVE（进化）
   下次类似任务 → recall 搜到之前学的 → 更好地执行
   发现技能过时 → learn(action=skill_patch) → 技能自我更新
```

### 三层架构

```
┌─────────────────────────────────────────────────────┐
│  AI Agent                                           │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  认知底座 (cognitive-protocol.md)              │  │
│  │  永远在线，改变 Agent 行为模式                   │  │
│  │  ~30 行规则，~200 tokens                       │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  MCP Server (3 tools, ~619 tokens)            │  │
│  │  recall / learn / learning_status              │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │                                │
│                     ▼                                │
│  ┌───────────────────────────────────────────────┐  │
│  │  存储 (~/.auto-learning/)                     │  │
│  │  Markdown 文件（人可读）+ SQLite FTS5（可搜索） │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Review 引擎

Review 引擎是 MCP Server 内部独立调用 Claude Haiku API 的，不消耗主 Agent 的上下文窗口：

- Agent 完成复杂任务后，构造结构化摘要（~500 字）
- 调用 `learn(action=review, content=摘要)`
- MCP Server 内部调 Haiku 分析摘要，输出要保存的 memories 和 skills
- 自动写入存储，Agent 只收到确认

没有 API Key 时优雅降级：返回提示信息，建议用 `learn(action=memory)` 手动保存。

### 安全扫描

Agent 创建的技能经过 10 条安全规则扫描（prompt 注入、命令注入、数据泄露、隐藏字符）。不通过则拒绝并返回详细报告。

---

## Dashboard 审计报告

查看 Agent 学到了什么：

```bash
cd mcp-server

# Markdown 格式（终端查看）
npm run dashboard

# HTML 格式（浏览器查看，暗色主题）
npm run dashboard:html > dashboard.html && open dashboard.html
```

报告包含：总览、记忆分布（按类型/置信度）、全部记忆列表、已学技能、会话记录、学习曲线、标签云、数据完整性检查。

---

## 配置

创建 `~/.auto-learning/config.yaml` 可以自定义行为（文件不存在时使用默认值）：

```yaml
review:
  enabled: true                          # 是否启用自动知识提取
  model: "claude-haiku-4-5-20251001"     # Review 用哪个模型
  apiKeyEnv: "ANTHROPIC_API_KEY"         # API key 环境变量名
  maxTokens: 2000                        # Review 输出上限
  temperature: 0.3                       # 偏确定性

limits:
  memoryMaxChars: 2000      # 单条记忆最大字符数
  skillMaxChars: 100000     # 单个技能文件最大字符数
  skillNameMaxLen: 64       # 技能名称最大长度
```

---

## 数据存储

所有数据存储在 `~/.auto-learning/` 下，双重存储模型：

| 存储 | 用途 |
|------|------|
| Markdown 文件 | 人可读，可直接编辑，可版本控制 |
| SQLite + FTS5 | 毫秒级全文搜索 |

```
~/.auto-learning/
├── config.yaml              # 可选配置
├── index.db                 # SQLite 数据库
├── memory/
│   ├── preferences/         # 用户偏好
│   ├── facts/               # 环境事实
│   └── feedback/            # 行为反馈
├── skills/
│   └── {category}/{name}/SKILL.md
└── sessions/
    └── session_*.md
```

---

## 项目结构

```
Agent-Auto-Learning/
├── cognitive-base/              # 认知底座
│   ├── cognitive-protocol.md    # ~30 行核心规则
│   ├── anti-patterns.md         # 6 种学习失败模式
│   ├── examples.md              # 3 个 before/after 场景
│   └── install/                 # 各平台安装指南
├── mcp-server/                  # MCP Server
│   └── src/
│       ├── index.ts             # 入口
│       ├── config.ts            # 配置
│       ├── dashboard.ts         # 审计报告生成
│       ├── setup.ts             # 自动安装脚本
│       ├── storage/             # SQLite + 文件存储
│       ├── safety/              # 安全扫描
│       ├── review/              # LLM Review 引擎
│       └── tools/
│           └── high-level-tools.ts  # 3 个高阶工具
├── skill/                       # Skill 协议（兼容 Hermes 格式）
├── PROPOSAL.md                  # 完整方案设计
├── ARCHITECTURE.md              # 架构文档
└── TESTING.md                   # 测试指南
```

---

## 设计来源

本项目的学习机制参考了 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 的闭环学习系统。关键改进：

| Hermes | Auto-Learning |
|--------|---------------|
| 单体（嵌在 agent runtime） | 分层（认知底座 + MCP Server） |
| 12+ 工具，Agent 需要理解每个 | 3 个高阶入口（recall / learn / status） |
| 后台 fork agent thread 做 review | MCP Server 独立调 Haiku |
| 仅 Hermes 可用 | 任何 MCP 兼容 Agent |
| ~1,145 tokens 上下文开销 | ~619 tokens（↓46%） |

详细对比见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
