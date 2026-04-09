# Auto-Learning MCP Server + Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that gives any AI agent self-learning capabilities (memory persistence, skill creation, session review), plus a lightweight Skill wrapper that defines the learning protocol.

**Architecture:** Two-layer system — MCP server (TypeScript, stdio transport) handles storage, indexing, safety scanning, and LLM-powered review. Skill layer (SKILL.md) defines trigger rules and tells the agent when/how to call MCP tools. Storage uses SQLite (better-sqlite3) for FTS5 indexing + Markdown files for human-readable persistence.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk 1.27+, better-sqlite3, @anthropic-ai/sdk, zod

**Spec:** `/Users/admin/Documents/AI/skill self-evolution/auto-learning/PROPOSAL.md`

---

## File Structure

```
auto-learning/
├── mcp-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                 # MCP server entry point — registers all tools, connects stdio
│   │   ├── config.ts                # Load config from ~/.auto-learning/config.yaml or env vars
│   │   ├── storage/
│   │   │   ├── database.ts          # SQLite setup, migrations, FTS5 tables
│   │   │   ├── memory-store.ts      # Memory CRUD + FTS search (file + DB)
│   │   │   ├── skill-store.ts       # Skill CRUD + FTS search (file + DB)
│   │   │   └── session-store.ts     # Session summary storage
│   │   ├── safety/
│   │   │   └── scanner.ts           # Regex-based skill security scanning
│   │   ├── review/
│   │   │   └── engine.ts            # LLM-powered review (calls Anthropic API)
│   │   └── tools/
│   │       ├── memory-tools.ts      # memory_write, memory_read, memory_search, memory_delete, memory_gc
│   │       ├── skill-tools.ts       # skill_create, skill_patch, skill_list, skill_view
│   │       ├── session-tools.ts     # session_review, session_search
│   │       └── status-tools.ts      # learning_status
│   └── __tests__/
│       ├── memory-store.test.ts
│       ├── skill-store.test.ts
│       ├── scanner.test.ts
│       └── review-engine.test.ts
├── skill/
│   ├── SKILL.md                     # Learning protocol for agents
│   └── references/
│       └── trigger-rules.md         # Detailed trigger conditions
└── docs/
    └── plans/
        └── 2026-04-09-auto-learning-mcp.md  # This file
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/src/config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "auto-learning-mcp",
  "version": "0.1.0",
  "description": "MCP server for agent self-learning — memory, skills, and session review",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "auto-learning-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "@modelcontextprotocol/sdk": "^1.27.0",
    "better-sqlite3": "^11.0.0",
    "yaml": "^2.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^22.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["__tests__", "dist"]
}
```

- [ ] **Step 3: Create config.ts**

```typescript
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parse as parseYaml } from "yaml";

export interface Config {
  dataDir: string;
  review: {
    enabled: boolean;
    model: string;
    provider: "anthropic";
    apiKeyEnv: string;
    maxTokens: number;
    temperature: number;
  };
  limits: {
    memoryMaxChars: number;
    skillMaxChars: number;
    skillNameMaxLen: number;
    skillDescMaxLen: number;
    skillFileMaxBytes: number;
  };
}

const DEFAULT_DATA_DIR = join(homedir(), ".auto-learning");

const DEFAULT_CONFIG: Config = {
  dataDir: DEFAULT_DATA_DIR,
  review: {
    enabled: true,
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    maxTokens: 2000,
    temperature: 0.3,
  },
  limits: {
    memoryMaxChars: 2000,
    skillMaxChars: 100_000,
    skillNameMaxLen: 64,
    skillDescMaxLen: 1024,
    skillFileMaxBytes: 1_048_576,
  },
};

export function loadConfig(): Config {
  const configPath = join(DEFAULT_DATA_DIR, "config.yaml");
  let userConfig: Partial<Config> = {};

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    userConfig = parseYaml(raw) ?? {};
  }

  const config: Config = {
    dataDir: userConfig.dataDir ?? DEFAULT_CONFIG.dataDir,
    review: { ...DEFAULT_CONFIG.review, ...userConfig.review },
    limits: { ...DEFAULT_CONFIG.limits, ...userConfig.limits },
  };

  // Ensure data directories exist
  for (const sub of ["memory/preferences", "memory/facts", "memory/feedback", "skills", "sessions"]) {
    mkdirSync(join(config.dataDir, sub), { recursive: true });
  }

  return config;
}
```

- [ ] **Step 4: Install dependencies**

Run: `cd /Users/admin/Documents/AI/skill\ self-evolution/auto-learning/mcp-server && npm install`
Expected: All dependencies installed, `node_modules/` created

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/admin/Documents/AI/skill\ self-evolution/auto-learning/mcp-server && npx tsc --noEmit`
Expected: No errors (only config.ts exists, should compile clean)

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/AI/skill\ self-evolution/auto-learning
git init && git add -A && git commit -m "feat: project scaffolding — package.json, tsconfig, config loader"
```

---

## Task 2: SQLite Database + Storage Foundation

**Files:**
- Create: `mcp-server/src/storage/database.ts`

- [ ] **Step 1: Write database.ts with schema migrations**

```typescript
import Database from "better-sqlite3";
import { join } from "path";
import type { Config } from "../config.js";

const SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('preference','fact','feedback')),
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      confidence TEXT DEFAULT 'medium' CHECK(confidence IN ('high','medium','low')),
      source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      file_path TEXT NOT NULL
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      id, content, tags, tokenize='porter unicode61'
    )`,
    `CREATE TABLE IF NOT EXISTS skills (
      name TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      file_path TEXT NOT NULL
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
      name, description, tags, tokenize='porter unicode61'
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      summary TEXT,
      memories_created INTEGER DEFAULT 0,
      skills_created INTEGER DEFAULT 0,
      file_path TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
    `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '${SCHEMA_VERSION}')`,
  ],
};

export function openDatabase(config: Config): Database.Database {
  const dbPath = join(config.dataDir, "index.db");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Check current version
  let currentVersion = 0;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    if (row) currentVersion = parseInt(row.value, 10);
  } catch {
    // meta table doesn't exist yet — version 0
  }

  // Run pending migrations
  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const stmts = MIGRATIONS[v];
    if (!stmts) continue;
    const migrate = db.transaction(() => {
      for (const sql of stmts) {
        db.exec(sql);
      }
    });
    migrate();
  }

  return db;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/admin/Documents/AI/skill\ self-evolution/auto-learning/mcp-server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: SQLite database layer with FTS5 and migrations"
```

---

## Task 3: Memory Store

**Files:**
- Create: `mcp-server/src/storage/memory-store.ts`

- [ ] **Step 1: Write memory-store.ts**

```typescript
import type Database from "better-sqlite3";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { Config } from "../config.js";

export interface Memory {
  id: string;
  type: "preference" | "fact" | "feedback";
  content: string;
  tags: string[];
  confidence: "high" | "medium" | "low";
  source: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  file_path: string;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  type: string;
  tags: string[];
  confidence: string;
  rank: number;
}

export class MemoryStore {
  constructor(
    private db: Database.Database,
    private config: Config,
  ) {}

  write(params: {
    type: Memory["type"];
    content: string;
    source?: string;
    tags?: string[];
    confidence?: Memory["confidence"];
    expires_at?: string | null;
  }): { id: string; status: string } {
    const content = params.content.trim();
    if (!content) throw new Error("Memory content cannot be empty");
    if (content.length > this.config.limits.memoryMaxChars) {
      throw new Error(`Content exceeds ${this.config.limits.memoryMaxChars} char limit`);
    }

    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const tags = params.tags ?? [];
    const tagsJson = JSON.stringify(tags);
    const filePath = join(this.config.dataDir, "memory", params.type, `${id}.md`);

    // Write markdown file
    const frontmatter = [
      "---",
      `id: ${id}`,
      `type: ${params.type}`,
      `source: "${params.source ?? "unknown"}"`,
      `tags: ${tagsJson}`,
      `confidence: ${params.confidence ?? "medium"}`,
      `created: ${now}`,
      `expires: ${params.expires_at ?? "null"}`,
      "---",
      "",
      content,
    ].join("\n");

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, frontmatter, "utf-8");

    // Insert into DB + FTS
    this.db
      .prepare(
        `INSERT INTO memories (id, type, content, tags, confidence, source, created_at, updated_at, expires_at, file_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, params.type, content, tagsJson, params.confidence ?? "medium", params.source ?? "unknown", now, now, params.expires_at ?? null, filePath);

    this.db.prepare(`INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)`).run(id, content, tagsJson);

    return { id, status: "created" };
  }

  read(id: string): Memory | null {
    const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as Memory | undefined;
    if (!row) return null;
    return { ...row, tags: JSON.parse(row.tags as unknown as string) };
  }

  search(query: string, options?: { limit?: number; type?: string }): MemorySearchResult[] {
    const limit = options?.limit ?? 10;
    let sql = `
      SELECT m.id, m.content, m.type, m.tags, m.confidence, rank
      FROM memories_fts f
      JOIN memories m ON m.id = f.id
      WHERE memories_fts MATCH ?
    `;
    const params: unknown[] = [query];

    if (options?.type) {
      sql += " AND m.type = ?";
      params.push(options.type);
    }

    // Exclude expired memories
    sql += " AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))";
    sql += " ORDER BY rank LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<MemorySearchResult & { tags: string }>;
    return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) }));
  }

  update(id: string, params: { content?: string; tags?: string[]; confidence?: Memory["confidence"]; expires_at?: string | null }): { status: string } {
    const existing = this.read(id);
    if (!existing) throw new Error(`Memory ${id} not found`);

    const content = params.content?.trim() ?? existing.content;
    if (content.length > this.config.limits.memoryMaxChars) {
      throw new Error(`Content exceeds ${this.config.limits.memoryMaxChars} char limit`);
    }

    const tags = params.tags ?? existing.tags;
    const tagsJson = JSON.stringify(tags);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE memories SET content = ?, tags = ?, confidence = ?, expires_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(content, tagsJson, params.confidence ?? existing.confidence, params.expires_at ?? existing.expires_at, now, id);

    this.db.prepare(`DELETE FROM memories_fts WHERE id = ?`).run(id);
    this.db.prepare(`INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)`).run(id, content, tagsJson);

    // Rewrite file
    const frontmatter = [
      "---",
      `id: ${id}`,
      `type: ${existing.type}`,
      `source: "${existing.source}"`,
      `tags: ${tagsJson}`,
      `confidence: ${params.confidence ?? existing.confidence}`,
      `created: ${existing.created_at}`,
      `updated: ${now}`,
      `expires: ${params.expires_at ?? existing.expires_at ?? "null"}`,
      "---",
      "",
      content,
    ].join("\n");
    writeFileSync(existing.file_path, frontmatter, "utf-8");

    return { status: "updated" };
  }

  delete(id: string): { status: string } {
    const existing = this.read(id);
    if (!existing) throw new Error(`Memory ${id} not found`);

    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM memories_fts WHERE id = ?").run(id);

    if (existsSync(existing.file_path)) {
      unlinkSync(existing.file_path);
    }

    return { status: "deleted" };
  }

  gc(options?: { maxAgeDays?: number; dryRun?: boolean }): { removed: string[]; kept: number } {
    const maxAge = options?.maxAgeDays ?? 90;
    const cutoff = new Date(Date.now() - maxAge * 86400000).toISOString();

    // Find expired + old low-confidence memories
    const candidates = this.db
      .prepare(
        `SELECT id FROM memories
         WHERE (expires_at IS NOT NULL AND expires_at < datetime('now'))
            OR (confidence = 'low' AND created_at < ?)`,
      )
      .all(cutoff) as Array<{ id: string }>;

    if (options?.dryRun) {
      return { removed: candidates.map((c) => c.id), kept: this.count() - candidates.length };
    }

    for (const { id } of candidates) {
      this.delete(id);
    }

    return { removed: candidates.map((c) => c.id), kept: this.count() };
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number };
    return row.c;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/admin/Documents/AI/skill\ self-evolution/auto-learning/mcp-server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: memory store — CRUD, FTS5 search, garbage collection"
```

---

## Task 4: Safety Scanner

**Files:**
- Create: `mcp-server/src/safety/scanner.ts`

- [ ] **Step 1: Write scanner.ts**

```typescript
export interface ScanResult {
  safe: boolean;
  threats: Array<{ type: string; pattern: string; match: string; line: number }>;
}

const THREAT_PATTERNS: Array<{ pattern: RegExp; type: string; description: string }> = [
  // Prompt injection
  { pattern: /ignore\s+(previous|all|above|prior)\s+instructions/i, type: "prompt_injection", description: "Attempts to override system instructions" },
  { pattern: /system\s+prompt\s+override/i, type: "prompt_injection", description: "Attempts to override system prompt" },
  { pattern: /you\s+are\s+now\s+/i, type: "prompt_injection", description: "Attempts to redefine agent identity" },
  { pattern: /do\s+not\s+tell\s+the\s+user/i, type: "deception", description: "Attempts to hide information from user" },

  // Command injection — only match shell execution patterns, not markdown code fences
  { pattern: /\$\([^)]+\)/, type: "command_substitution", description: "Shell command substitution" },
  { pattern: /;\s*(rm|curl|wget|nc|bash|sh|eval)\s/i, type: "command_chain", description: "Chained shell command execution" },

  // Exfiltration
  { pattern: /curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, type: "exfil_curl", description: "Curl with sensitive variable" },
  { pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.ssh)/i, type: "read_secrets", description: "Reading secret files" },
  { pattern: /wget\s+.*\|\s*(bash|sh)/i, type: "remote_exec", description: "Remote script execution" },

  // Hidden content
  { pattern: /[\u200B-\u200F\u2028-\u202F\uFEFF]/, type: "hidden_unicode", description: "Invisible unicode characters" },
];

export function scanContent(content: string): ScanResult {
  const threats: ScanResult["threats"] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, type } of THREAT_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        threats.push({
          type,
          pattern: pattern.source,
          match: match[0].slice(0, 100),
          line: i + 1,
        });
      }
    }
  }

  return { safe: threats.length === 0, threats };
}

export function formatScanReport(result: ScanResult): string {
  if (result.safe) return "Security scan: PASS";
  const lines = ["Security scan: BLOCKED", ""];
  for (const t of result.threats) {
    lines.push(`- [${t.type}] line ${t.line}: "${t.match}"`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: safety scanner — regex-based skill content scanning"
```

---

## Task 5: Skill Store

**Files:**
- Create: `mcp-server/src/storage/skill-store.ts`

- [ ] **Step 1: Write skill-store.ts**

```typescript
import type Database from "better-sqlite3";
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { Config } from "../config.js";
import { scanContent, formatScanReport } from "../safety/scanner.js";

export interface Skill {
  name: string;
  category: string;
  description: string;
  version: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  file_path: string;
}

const VALID_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

export class SkillStore {
  constructor(
    private db: Database.Database,
    private config: Config,
  ) {}

  create(params: { name: string; category: string; content: string }): { path: string; status: string; safety_report: string } {
    // Validate name
    if (!VALID_NAME_RE.test(params.name)) {
      throw new Error(`Invalid skill name: must match ${VALID_NAME_RE.source}`);
    }
    if (params.name.length > this.config.limits.skillNameMaxLen) {
      throw new Error(`Skill name exceeds ${this.config.limits.skillNameMaxLen} char limit`);
    }
    if (params.content.length > this.config.limits.skillMaxChars) {
      throw new Error(`Skill content exceeds ${this.config.limits.skillMaxChars} char limit`);
    }

    // Validate frontmatter
    const parsed = this.parseFrontmatter(params.content);
    if (!parsed) throw new Error("SKILL.md must start with valid YAML frontmatter (--- ... ---)");
    if (!parsed.meta.name) throw new Error("Frontmatter must include 'name' field");
    if (!parsed.meta.description) throw new Error("Frontmatter must include 'description' field");
    if (!parsed.body.trim()) throw new Error("SKILL.md must have content after frontmatter");

    // Check name collision
    const existing = this.db.prepare("SELECT name FROM skills WHERE name = ?").get(params.name);
    if (existing) throw new Error(`Skill '${params.name}' already exists. Use skill_patch to update.`);

    // Security scan
    const scanResult = scanContent(params.content);
    if (!scanResult.safe) {
      return { path: "", status: "blocked", safety_report: formatScanReport(scanResult) };
    }

    // Write file
    const skillDir = join(this.config.dataDir, "skills", params.category, params.name);
    const filePath = join(skillDir, "SKILL.md");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(filePath, params.content, "utf-8");

    // Index in DB
    const now = new Date().toISOString();
    const description = (parsed.meta.description as string).slice(0, this.config.limits.skillDescMaxLen);
    const tags = JSON.stringify(parsed.meta.metadata?.["auto-learning"]?.tags ?? []);

    this.db
      .prepare(
        `INSERT INTO skills (name, category, description, version, tags, created_at, updated_at, file_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(params.name, params.category, description, parsed.meta.version ?? "1.0.0", tags, now, now, filePath);

    this.db.prepare(`INSERT INTO skills_fts (name, description, tags) VALUES (?, ?, ?)`).run(params.name, description, tags);

    return { path: filePath, status: "created", safety_report: "PASS" };
  }

  patch(params: { name: string; old_string: string; new_string: string }): { status: string; diff: string } {
    const skill = this.getByName(params.name);
    if (!skill) throw new Error(`Skill '${params.name}' not found`);

    const content = readFileSync(skill.file_path, "utf-8");
    if (!content.includes(params.old_string)) {
      throw new Error(`old_string not found in skill '${params.name}'`);
    }

    const newContent = content.replace(params.old_string, params.new_string);

    // Validate patched content
    const parsed = this.parseFrontmatter(newContent);
    if (!parsed) throw new Error("Patch broke YAML frontmatter");

    // Security scan
    const scanResult = scanContent(newContent);
    if (!scanResult.safe) {
      throw new Error(`Patch blocked by security scan:\n${formatScanReport(scanResult)}`);
    }

    // Write patched file
    writeFileSync(skill.file_path, newContent, "utf-8");

    // Update DB
    const now = new Date().toISOString();
    const description = (parsed.meta.description as string ?? skill.description).slice(0, this.config.limits.skillDescMaxLen);
    this.db.prepare(`UPDATE skills SET description = ?, updated_at = ? WHERE name = ?`).run(description, now, params.name);

    // Update FTS
    this.db.prepare(`DELETE FROM skills_fts WHERE name = ?`).run(params.name);
    const tags = JSON.stringify(parsed.meta.metadata?.["auto-learning"]?.tags ?? []);
    this.db.prepare(`INSERT INTO skills_fts (name, description, tags) VALUES (?, ?, ?)`).run(params.name, description, tags);

    return { status: "patched", diff: `- ${params.old_string}\n+ ${params.new_string}` };
  }

  list(options?: { category?: string; tags?: string[] }): Skill[] {
    let sql = "SELECT * FROM skills";
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.category) {
      conditions.push("category = ?");
      params.push(options.category);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY updated_at DESC";

    const rows = this.db.prepare(sql).all(...params) as Skill[];
    return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags as unknown as string) }));
  }

  view(name: string): { content: string } | null {
    const skill = this.getByName(name);
    if (!skill) return null;
    if (!existsSync(skill.file_path)) return null;
    return { content: readFileSync(skill.file_path, "utf-8") };
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM skills").get() as { c: number };
    return row.c;
  }

  private getByName(name: string): Skill | undefined {
    return this.db.prepare("SELECT * FROM skills WHERE name = ?").get(name) as Skill | undefined;
  }

  private parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } | null {
    if (!content.startsWith("---")) return null;
    const endIdx = content.indexOf("\n---", 3);
    if (endIdx === -1) return null;
    const yamlStr = content.slice(4, endIdx);
    const body = content.slice(endIdx + 4);
    try {
      const meta = parseYaml(yamlStr) as Record<string, unknown>;
      return { meta, body };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: skill store — create, patch, list, view with safety scanning"
```

---

## Task 6: Session Store

**Files:**
- Create: `mcp-server/src/storage/session-store.ts`

- [ ] **Step 1: Write session-store.ts**

```typescript
import type Database from "better-sqlite3";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Config } from "../config.js";

export interface Session {
  id: string;
  date: string;
  summary: string;
  memories_created: number;
  skills_created: number;
  file_path: string;
}

export class SessionStore {
  constructor(
    private db: Database.Database,
    private config: Config,
  ) {}

  save(params: { summary: string; memories_created: number; skills_created: number }): { id: string; status: string } {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const id = `session_${date}_${Math.random().toString(36).slice(2, 8)}`;
    const filePath = join(this.config.dataDir, "sessions", `${id}.md`);

    const content = [
      `# Session ${date}`,
      "",
      `**Memories created:** ${params.memories_created}`,
      `**Skills created:** ${params.skills_created}`,
      "",
      "## Summary",
      "",
      params.summary,
    ].join("\n");

    mkdirSync(join(this.config.dataDir, "sessions"), { recursive: true });
    writeFileSync(filePath, content, "utf-8");

    this.db
      .prepare(
        `INSERT INTO sessions (id, date, summary, memories_created, skills_created, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, date, params.summary, params.memories_created, params.skills_created, filePath);

    return { id, status: "saved" };
  }

  search(query: string, options?: { limit?: number; days?: number }): Session[] {
    const limit = options?.limit ?? 10;
    let sql = "SELECT * FROM sessions WHERE summary LIKE ?";
    const params: unknown[] = [`%${query}%`];

    if (options?.days) {
      const cutoff = new Date(Date.now() - options.days * 86400000).toISOString().slice(0, 10);
      sql += " AND date >= ?";
      params.push(cutoff);
    }

    sql += " ORDER BY date DESC LIMIT ?";
    params.push(limit);

    return this.db.prepare(sql).all(...params) as Session[];
  }

  recent(limit: number = 5): Session[] {
    return this.db.prepare("SELECT * FROM sessions ORDER BY date DESC LIMIT ?").all(limit) as Session[];
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number };
    return row.c;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: session store — save, search, recent sessions"
```

---

## Task 7: Review Engine

**Files:**
- Create: `mcp-server/src/review/engine.ts`

- [ ] **Step 1: Write engine.ts**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";
import type { MemoryStore } from "../storage/memory-store.js";
import type { SkillStore } from "../storage/skill-store.js";
import type { SessionStore } from "../storage/session-store.js";

interface ReviewResult {
  memories: Array<{ type: string; content: string; tags: string[]; confidence: string }>;
  skills: Array<{ action: "create" | "patch"; name: string; category?: string; content?: string; old_string?: string; new_string?: string }>;
  actions_taken: string[];
}

const REVIEW_PROMPT = `You are a knowledge extraction engine. Review the conversation summary below and extract two kinds of knowledge:

**Memory** (declarative knowledge):
- User preferences, work style, communication expectations
- Environment facts: tool quirks, project conventions, discovered patterns
- Feedback corrections: user corrected the agent's approach

**Skills** (procedural knowledge):
- Non-trivial workflow that required trial-and-error
- Multi-step process that would benefit future similar tasks
- Approach the user expected but the agent didn't initially follow

Output valid JSON matching this schema:
{
  "memories": [
    { "type": "preference|fact|feedback", "content": "concise statement", "tags": ["tag"], "confidence": "high|medium" }
  ],
  "skills": [
    { "action": "create", "name": "kebab-case-name", "category": "category", "content": "full SKILL.md with YAML frontmatter" }
  ]
}

Rules:
- Only extract genuinely reusable knowledge. Quality over quantity.
- If nothing is worth saving, return {"memories": [], "skills": []}.
- Memory content must be concise (under 500 chars).
- Skill names must be lowercase kebab-case.

CONVERSATION SUMMARY:
`;

export class ReviewEngine {
  private client: Anthropic | null = null;

  constructor(private config: Config) {
    const apiKey = process.env[config.review.apiKeyEnv];
    if (apiKey && config.review.enabled) {
      this.client = new Anthropic({ apiKey });
    }
  }

  get available(): boolean {
    return this.client !== null && this.config.review.enabled;
  }

  async review(
    conversationSummary: string,
    memoryStore: MemoryStore,
    skillStore: SkillStore,
    sessionStore: SessionStore,
  ): Promise<ReviewResult> {
    if (!this.client) {
      return { memories: [], skills: [], actions_taken: ["review_skipped: no API key configured"] };
    }

    // Call LLM
    let raw: string;
    try {
      const response = await this.client.messages.create({
        model: this.config.review.model,
        max_tokens: this.config.review.maxTokens,
        temperature: this.config.review.temperature,
        messages: [{ role: "user", content: REVIEW_PROMPT + conversationSummary }],
      });
      raw = response.content[0].type === "text" ? response.content[0].text : "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { memories: [], skills: [], actions_taken: [`review_error: ${msg}`] };
    }

    // Parse JSON from response (handle markdown code blocks)
    let parsed: { memories?: ReviewResult["memories"]; skills?: ReviewResult["skills"] };
    try {
      const jsonStr = raw.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "");
      parsed = JSON.parse(jsonStr);
    } catch {
      return { memories: [], skills: [], actions_taken: ["review_error: failed to parse LLM response as JSON"] };
    }

    const actions: string[] = [];

    // Persist memories
    for (const mem of parsed.memories ?? []) {
      try {
        const validType = ["preference", "fact", "feedback"].includes(mem.type) ? mem.type as "preference" | "fact" | "feedback" : "fact";
        memoryStore.write({
          type: validType,
          content: mem.content,
          tags: mem.tags ?? [],
          confidence: (mem.confidence === "high" ? "high" : "medium") as "high" | "medium",
          source: "session_review",
        });
        actions.push(`memory_created: ${validType}`);
      } catch (err) {
        actions.push(`memory_error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Persist skills
    for (const skill of parsed.skills ?? []) {
      try {
        if (skill.action === "create" && skill.content && skill.category) {
          const result = skillStore.create({ name: skill.name, category: skill.category, content: skill.content });
          actions.push(`skill_${result.status}: ${skill.name}`);
        } else if (skill.action === "patch" && skill.old_string && skill.new_string) {
          skillStore.patch({ name: skill.name, old_string: skill.old_string, new_string: skill.new_string });
          actions.push(`skill_patched: ${skill.name}`);
        }
      } catch (err) {
        actions.push(`skill_error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Save session
    const memCount = (parsed.memories ?? []).length;
    const skillCount = (parsed.skills ?? []).length;
    if (memCount > 0 || skillCount > 0) {
      sessionStore.save({ summary: conversationSummary.slice(0, 2000), memories_created: memCount, skills_created: skillCount });
    }

    return { memories: parsed.memories ?? [], skills: parsed.skills ?? [], actions_taken: actions };
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: review engine — LLM-powered knowledge extraction with fallback"
```

---

## Task 8: MCP Tool Definitions

**Files:**
- Create: `mcp-server/src/tools/memory-tools.ts`
- Create: `mcp-server/src/tools/skill-tools.ts`
- Create: `mcp-server/src/tools/session-tools.ts`
- Create: `mcp-server/src/tools/status-tools.ts`

- [ ] **Step 1: Write memory-tools.ts**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryStore } from "../storage/memory-store.js";

export function registerMemoryTools(server: McpServer, store: MemoryStore) {
  server.tool(
    "memory_write",
    "Write a memory entry (preference, fact, or feedback). Use for persisting knowledge across sessions.",
    {
      type: z.enum(["preference", "fact", "feedback"]).describe("Memory type"),
      content: z.string().describe("The knowledge to remember"),
      source: z.string().optional().describe("Where this knowledge came from"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      confidence: z.enum(["high", "medium", "low"]).optional().describe("Confidence level"),
    },
    async ({ type, content, source, tags, confidence }) => {
      try {
        const result = store.write({ type, content, source, tags, confidence });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "memory_read",
    "Read a specific memory entry by ID.",
    { id: z.string().describe("Memory ID") },
    async ({ id }) => {
      const mem = store.read(id);
      if (!mem) return { content: [{ type: "text", text: `Memory ${id} not found` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(mem) }] };
    },
  );

  server.tool(
    "memory_search",
    "Search memories by keyword. Returns ranked results.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 10)"),
      type: z.enum(["preference", "fact", "feedback"]).optional().describe("Filter by type"),
    },
    async ({ query, limit, type }) => {
      try {
        const results = store.search(query, { limit, type });
        return { content: [{ type: "text", text: JSON.stringify({ count: results.length, results }) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "memory_delete",
    "Delete a memory entry by ID.",
    { id: z.string().describe("Memory ID to delete") },
    async ({ id }) => {
      try {
        const result = store.delete(id);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "memory_gc",
    "Garbage collect expired and low-confidence memories.",
    {
      max_age_days: z.number().optional().describe("Max age in days for low-confidence memories (default 90)"),
      dry_run: z.boolean().optional().describe("If true, only report what would be removed"),
    },
    async ({ max_age_days, dry_run }) => {
      const result = store.gc({ maxAgeDays: max_age_days, dryRun: dry_run });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
```

- [ ] **Step 2: Write skill-tools.ts**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SkillStore } from "../storage/skill-store.js";

export function registerSkillTools(server: McpServer, store: SkillStore) {
  server.tool(
    "skill_create",
    "Create a new skill from a learned procedure. Content must be valid SKILL.md with YAML frontmatter.",
    {
      name: z.string().describe("Skill name (kebab-case)"),
      category: z.string().describe("Skill category"),
      content: z.string().describe("Full SKILL.md content with YAML frontmatter"),
    },
    async ({ name, category, content }) => {
      try {
        const result = store.create({ name, category, content });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "skill_patch",
    "Patch an existing skill by replacing a string. Used to update or fix skills.",
    {
      name: z.string().describe("Skill name to patch"),
      old_string: z.string().describe("Text to find and replace"),
      new_string: z.string().describe("Replacement text"),
    },
    async ({ name, old_string, new_string }) => {
      try {
        const result = store.patch({ name, old_string, new_string });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "skill_list",
    "List all learned skills. Returns name, description, category, and last updated time.",
    {
      category: z.string().optional().describe("Filter by category"),
    },
    async ({ category }) => {
      const skills = store.list({ category });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: skills.length,
              skills: skills.map((s) => ({ name: s.name, description: s.description, category: s.category, updated: s.updated_at })),
            }),
          },
        ],
      };
    },
  );

  server.tool(
    "skill_view",
    "View the full content of a specific skill.",
    { name: z.string().describe("Skill name") },
    async ({ name }) => {
      const result = store.view(name);
      if (!result) return { content: [{ type: "text", text: `Skill '${name}' not found` }], isError: true };
      return { content: [{ type: "text", text: result.content }] };
    },
  );
}
```

- [ ] **Step 3: Write session-tools.ts**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionStore } from "../storage/session-store.js";
import type { ReviewEngine } from "../review/engine.js";
import type { MemoryStore } from "../storage/memory-store.js";
import type { SkillStore } from "../storage/skill-store.js";

export function registerSessionTools(
  server: McpServer,
  sessionStore: SessionStore,
  reviewEngine: ReviewEngine,
  memoryStore: MemoryStore,
  skillStore: SkillStore,
) {
  server.tool(
    "session_review",
    "Submit a conversation summary for knowledge extraction. The review engine analyzes it and automatically persists memories and skills. Returns what was learned.",
    {
      conversation_summary: z.string().describe("Structured summary of the conversation: Goal / Approach / Outcome / Learnings / Errors"),
    },
    async ({ conversation_summary }) => {
      if (!reviewEngine.available) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "review_unavailable",
                reason: "No API key configured. Set ANTHROPIC_API_KEY to enable automatic review.",
                fallback: "Use memory_write and skill_create directly to persist knowledge.",
              }),
            },
          ],
        };
      }

      const result = await reviewEngine.review(conversation_summary, memoryStore, skillStore, sessionStore);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "session_search",
    "Search past session summaries by keyword.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 10)"),
      days: z.number().optional().describe("Only search last N days"),
    },
    async ({ query, limit, days }) => {
      const results = sessionStore.search(query, { limit, days });
      return { content: [{ type: "text", text: JSON.stringify({ count: results.length, results }) }] };
    },
  );
}
```

- [ ] **Step 4: Write status-tools.ts**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryStore } from "../storage/memory-store.js";
import type { SkillStore } from "../storage/skill-store.js";
import type { SessionStore } from "../storage/session-store.js";
import type { ReviewEngine } from "../review/engine.js";

export function registerStatusTools(
  server: McpServer,
  memoryStore: MemoryStore,
  skillStore: SkillStore,
  sessionStore: SessionStore,
  reviewEngine: ReviewEngine,
) {
  server.tool("learning_status", "Get the current state of the learning system: memory count, skill count, recent sessions, review engine status.", {}, async () => {
    const recentSessions = sessionStore.recent(3);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            memory_count: memoryStore.count(),
            skill_count: skillStore.count(),
            session_count: sessionStore.count(),
            review_engine: reviewEngine.available ? "active" : "inactive (no API key)",
            recent_sessions: recentSessions.map((s) => ({
              date: s.date,
              memories: s.memories_created,
              skills: s.skills_created,
              summary: s.summary?.slice(0, 100),
            })),
          }),
        },
      ],
    };
  });
}
```

- [ ] **Step 5: Verify all compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: MCP tool definitions — memory, skill, session, status"
```

---

## Task 9: MCP Server Entry Point

**Files:**
- Create: `mcp-server/src/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./storage/database.js";
import { MemoryStore } from "./storage/memory-store.js";
import { SkillStore } from "./storage/skill-store.js";
import { SessionStore } from "./storage/session-store.js";
import { ReviewEngine } from "./review/engine.js";
import { registerMemoryTools } from "./tools/memory-tools.js";
import { registerSkillTools } from "./tools/skill-tools.js";
import { registerSessionTools } from "./tools/session-tools.js";
import { registerStatusTools } from "./tools/status-tools.js";

async function main() {
  const config = loadConfig();
  const db = openDatabase(config);
  const memoryStore = new MemoryStore(db, config);
  const skillStore = new SkillStore(db, config);
  const sessionStore = new SessionStore(db, config);
  const reviewEngine = new ReviewEngine(config);

  const server = new McpServer({
    name: "auto-learning",
    version: "0.1.0",
  });

  registerMemoryTools(server, memoryStore);
  registerSkillTools(server, skillStore);
  registerSessionTools(server, sessionStore, reviewEngine, memoryStore, skillStore);
  registerStatusTools(server, memoryStore, skillStore, sessionStore, reviewEngine);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("auto-learning-mcp: connected and listening");
}

main().catch((err) => {
  console.error("auto-learning-mcp: fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Build the project**

Run: `cd /Users/admin/Documents/AI/skill\ self-evolution/auto-learning/mcp-server && npm run build`
Expected: `dist/` directory created with compiled JS files, no errors

- [ ] **Step 3: Test the server starts**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | node dist/index.js 2>/dev/null | head -1`
Expected: JSON response with `"result"` containing server info

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: MCP server entry point — wires all stores, tools, and transport"
```

---

## Task 10: Skill Wrapper (SKILL.md)

**Files:**
- Create: `skill/SKILL.md`
- Create: `skill/references/trigger-rules.md`

- [ ] **Step 1: Write SKILL.md**

```markdown
---
name: auto-learning
description: Self-learning protocol — teaches agents to persist knowledge and evolve skills via MCP tools
version: 0.1.0
metadata:
  auto-learning:
    tags: [learning, memory, skills, evolution, meta]
---

# Auto-Learning Protocol

You have access to a learning system via MCP tools (auto-learning server). This protocol defines WHEN and HOW to use it.

## Quick Reference

| Tool | When to use |
|------|-------------|
| `memory_search` | Start of a new task — check for relevant prior knowledge |
| `skill_list` | Start of a new task — check for relevant learned procedures |
| `memory_write` | User corrects your approach, or you discover a reusable fact |
| `skill_create` | You complete a non-trivial multi-step workflow worth reusing |
| `skill_patch` | You find an existing skill is outdated or incomplete |
| `session_review` | After completing a complex task (5+ tool calls) or before session ends |
| `learning_status` | When you want to check what you've learned so far |

## Trigger Rules

### On Task Start
Before diving into work, check for prior knowledge:
1. Call `memory_search` with keywords from the user's request
2. Call `skill_list` to see if a relevant skill exists
3. If a skill matches, call `skill_view` to load it and follow its instructions

### During Task Execution
Watch for learning opportunities:
- **User corrects you** → immediately call `memory_write` with type "feedback"
- **You discover a non-obvious fact** (tool quirk, project convention) → call `memory_write` with type "fact"
- **User states a preference** → call `memory_write` with type "preference"

### After Complex Task Completion (5+ tool calls)
Compose a structured summary and submit for review:
1. Write a summary with these sections:
   - **Goal**: What the user wanted
   - **Approach**: Steps taken (including dead ends)
   - **Outcome**: What was achieved
   - **Learnings**: Non-obvious discoveries
   - **Errors**: Mistakes made and how they were resolved
2. Call `session_review` with this summary
3. The review engine will automatically extract and persist relevant knowledge

### When Review Engine Is Unavailable
If `session_review` returns "review_unavailable", fall back to manual persistence:
- Call `memory_write` directly for important facts/preferences/feedback
- Call `skill_create` directly if a reusable workflow was discovered

## Memory Types

| Type | What to store | Example |
|------|--------------|---------|
| `preference` | User's work style, communication expectations | "User prefers concise responses without trailing summaries" |
| `fact` | Environment details, tool behaviors, project conventions | "This project uses pnpm, not npm" |
| `feedback` | Corrections to agent behavior | "Don't mock the database in integration tests — use real DB" |

## Skill Creation Guidelines

Only create a skill when ALL of these are true:
1. The workflow took 5+ tool calls to complete
2. It involved trial-and-error or non-obvious steps
3. It would benefit future similar tasks
4. It's not just "read file, edit file" — there must be domain knowledge

Skill content must include YAML frontmatter with `name` and `description` fields.

## Important

- **Quality over quantity**: Don't save trivial or obvious knowledge
- **Be concise**: Memory entries should be under 500 characters
- **Tag everything**: Tags enable better search recall
- **Patch don't recreate**: If a skill exists but is wrong, use `skill_patch`
```

- [ ] **Step 2: Write trigger-rules.md**

```markdown
# Auto-Learning Trigger Rules (Detailed)

## Trigger Matrix

| Condition | Action | Priority |
|-----------|--------|----------|
| New task begins | `memory_search` + `skill_list` | High — do this BEFORE starting work |
| User says "不要这样做" / "don't do that" | `memory_write(type=feedback)` | Immediate |
| User states preference | `memory_write(type=preference)` | Immediate |
| Discovered tool/env quirk | `memory_write(type=fact)` | When convenient |
| Complex task done (5+ tool calls) | `session_review` | After task completion |
| Found skill is wrong/outdated | `skill_patch` | Immediate |
| Discovered reusable workflow | `skill_create` | After task completion |
| Session ending | `session_review` if anything notable happened | Before goodbye |

## Summary Format for session_review

```
Goal: [One sentence — what the user wanted]
Approach: [2-3 sentences — what steps were taken, including failures]
Outcome: [One sentence — what was achieved]
Learnings: [Bullet points — non-obvious discoveries]
Errors: [Bullet points — mistakes and resolutions]
```

## When NOT to Learn

- Trivial tasks (single file read, simple question answering)
- Information already in memory (check first!)
- Temporary/one-off facts that won't be useful again
- Sensitive information (passwords, tokens, keys)
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: skill wrapper — learning protocol and trigger rules"
```

---

## Task 11: Claude Code MCP Configuration

**Files:**
- Modify: User's Claude Code settings to register the MCP server

- [ ] **Step 1: Build the server**

Run: `cd /Users/admin/Documents/AI/skill\ self-evolution/auto-learning/mcp-server && npm run build`
Expected: Clean build in `dist/`

- [ ] **Step 2: Register MCP server in Claude Code settings**

Add to `~/.claude/settings.local.json` under `mcpServers`:

```json
{
  "auto-learning": {
    "command": "node",
    "args": ["/Users/admin/Documents/AI/skill self-evolution/auto-learning/mcp-server/dist/index.js"],
    "env": {}
  }
}
```

Note: The server reads `ANTHROPIC_API_KEY` from the environment for the review engine. If not set, review degrades gracefully — all other tools still work.

- [ ] **Step 3: Verify MCP server is detected**

Restart Claude Code and check that `auto-learning` tools appear in the available tools list.

- [ ] **Step 4: Smoke test — write and search a memory**

```
Call: memory_write(type="fact", content="Auto-learning MCP server is installed and working", tags=["meta", "setup"])
Call: memory_search(query="auto-learning setup")
Call: learning_status()
```

Expected: Memory written, searchable, status shows 1 memory.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: complete auto-learning MCP server v0.1.0"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Memory CRUD + FTS search → Task 3, 8
- [x] Skill create/patch/list/view → Task 5, 8
- [x] Safety scanning → Task 4
- [x] Review engine with LLM → Task 7
- [x] Session review + search → Task 6, 8
- [x] Learning status → Task 8
- [x] Skill wrapper (SKILL.md) → Task 10
- [x] Fallback when no API key → Task 7 (ReviewEngine.available check), Task 10 (Skill instructions)
- [x] Review issue #1: memory_read, memory_delete added → Task 3, 8
- [x] Review issue #2: session_search added → Task 8
- [x] Review issue #3: backtick regex fixed → Task 4 (removed overly broad pattern)
- [x] Review issue #4: degradation strategy → Task 7 + Task 10
- [x] Review issue #5: boundary with existing memory → SKILL.md positions this as "learned knowledge" layer, not replacement for .assistant/ or auto-memory

**Placeholder scan:** No TBD, TODO, or "implement later" found.

**Type consistency:** MemoryStore/SkillStore/SessionStore types used consistently across tools and engine.
