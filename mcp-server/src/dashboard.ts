#!/usr/bin/env node
/**
 * Auto-Learning Dashboard Generator
 *
 * Reads the SQLite database and markdown files, outputs a human-readable
 * audit report in markdown format. Can be redirected to a file or viewed
 * in terminal.
 *
 * Usage:
 *   npm run dashboard                    # print to stdout
 *   npm run dashboard > dashboard.md     # save to file
 *   npm run dashboard -- --html          # wrap in styled HTML
 */

import Database from "better-sqlite3";
import { existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

const DATA_DIR = join(homedir(), ".auto-learning");
const DB_PATH = join(DATA_DIR, "index.db");

// ── Helpers ──────────────────────────────────────────────────────────────

function fileSize(path: string): string {
  try {
    const bytes = statSync(path).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  } catch {
    return "—";
  }
}

function countFiles(dir: string, ext = ".md"): number {
  try {
    return readdirSync(dir, { recursive: true })
      .filter((f) => String(f).endsWith(ext)).length;
  } catch {
    return 0;
  }
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function truncate(s: string | null, max: number): string {
  if (!s) return "—";
  const clean = s.replace(/\n/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

function bar(value: number, max: number, width = 20): string {
  if (max === 0) return "░".repeat(width);
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// ── Main ─────────────────────────────────────────────────────────────────

function generate(): string {
  const lines: string[] = [];
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  lines.push(`# 🧠 Auto-Learning Dashboard`);
  lines.push("");
  lines.push(`> 生成时间：${now}  `);
  lines.push(`> 数据目录：\`${DATA_DIR}\``);
  lines.push("");

  // ── Check if DB exists ─────────────────────────────────────────────
  if (!existsSync(DB_PATH)) {
    lines.push("## ⚠️ 学习系统尚未启动");
    lines.push("");
    lines.push("没有找到数据库文件。MCP Server 可能还没有被调用过。");
    lines.push("");
    lines.push("启动方法：在 Claude Code 中调用任意 auto-learning 工具（如 `learning_status`）。");
    return lines.join("\n");
  }

  const db = new Database(DB_PATH, { readonly: true });

  // ── Summary Stats ──────────────────────────────────────────────────
  const memCount = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number }).c;
  const skillCount = (db.prepare("SELECT COUNT(*) as c FROM skills").get() as { c: number }).c;
  const sessionCount = (db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number }).c;
  const dbSize = fileSize(DB_PATH);

  lines.push("---");
  lines.push("");
  lines.push("## 📊 总览");
  lines.push("");
  lines.push("| 指标 | 数量 |");
  lines.push("|------|------|");
  lines.push(`| 记忆总数 | **${memCount}** |`);
  lines.push(`| 技能总数 | **${skillCount}** |`);
  lines.push(`| 会话记录 | **${sessionCount}** |`);
  lines.push(`| 数据库大小 | ${dbSize} |`);
  lines.push(`| 文件总数 | ${countFiles(DATA_DIR)} 个 .md 文件 |`);
  lines.push("");

  // ── Memory Breakdown ───────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push("## 🧩 记忆分布");
  lines.push("");

  const memByType = db
    .prepare("SELECT type, COUNT(*) as c FROM memories GROUP BY type ORDER BY c DESC")
    .all() as Array<{ type: string; c: number }>;

  const memByConf = db
    .prepare("SELECT confidence, COUNT(*) as c FROM memories GROUP BY confidence ORDER BY c DESC")
    .all() as Array<{ confidence: string; c: number }>;

  if (memByType.length === 0) {
    lines.push("*暂无记忆数据。*");
    lines.push("");
  } else {
    lines.push("### 按类型");
    lines.push("");
    const typeLabel: Record<string, string> = {
      preference: "🎯 偏好 (preference)",
      fact: "📌 事实 (fact)",
      feedback: "🔄 反馈 (feedback)",
    };
    for (const row of memByType) {
      const label = typeLabel[row.type] ?? row.type;
      lines.push(`- ${label}: **${row.c}** 条 ${bar(row.c, memCount)}`);
    }
    lines.push("");

    lines.push("### 按置信度");
    lines.push("");
    const confLabel: Record<string, string> = { high: "🟢 高", medium: "🟡 中", low: "🔴 低" };
    for (const row of memByConf) {
      const label = confLabel[row.confidence] ?? row.confidence;
      lines.push(`- ${label}: **${row.c}** 条 ${bar(row.c, memCount)}`);
    }
    lines.push("");

    // Expiring soon
    const expiring = db
      .prepare(
        "SELECT COUNT(*) as c FROM memories WHERE expires_at IS NOT NULL AND expires_at < datetime('now', '+7 days')",
      )
      .get() as { c: number };
    if (expiring.c > 0) {
      lines.push(`> ⏰ **${expiring.c}** 条记忆将在 7 天内过期`);
      lines.push("");
    }
  }

  // ── Memory List ────────────────────────────────────────────────────
  lines.push("### 全部记忆");
  lines.push("");

  const allMemories = db
    .prepare("SELECT id, type, content, tags, confidence, source, created_at FROM memories ORDER BY created_at DESC")
    .all() as Array<{
    id: string;
    type: string;
    content: string;
    tags: string;
    confidence: string;
    source: string;
    created_at: string;
  }>;

  if (allMemories.length === 0) {
    lines.push("*暂无记忆。*");
    lines.push("");
  } else {
    lines.push("| # | 类型 | 内容 | 标签 | 置信度 | 来源 | 时间 |");
    lines.push("|---|------|------|------|--------|------|------|");
    allMemories.forEach((m, i) => {
      const tags = JSON.parse(m.tags) as string[];
      const tagStr = tags.length > 0 ? tags.map((t) => `\`${t}\``).join(" ") : "—";
      const confIcon = m.confidence === "high" ? "🟢" : m.confidence === "medium" ? "🟡" : "🔴";
      lines.push(
        `| ${i + 1} | ${m.type} | ${truncate(m.content, 60)} | ${tagStr} | ${confIcon} ${m.confidence} | ${m.source ?? "—"} | ${relativeTime(m.created_at)} |`,
      );
    });
    lines.push("");
  }

  // ── Skills ─────────────────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push("## ⚡ 已学习的技能");
  lines.push("");

  const allSkills = db
    .prepare("SELECT name, category, description, version, tags, created_at, updated_at FROM skills ORDER BY updated_at DESC")
    .all() as Array<{
    name: string;
    category: string;
    description: string;
    version: string;
    tags: string;
    created_at: string;
    updated_at: string;
  }>;

  if (allSkills.length === 0) {
    lines.push("*暂无技能。Agent 完成复杂任务后会自动创建技能。*");
    lines.push("");
  } else {
    for (const s of allSkills) {
      const tags = JSON.parse(s.tags) as string[];
      const tagStr = tags.length > 0 ? tags.map((t) => `\`${t}\``).join(" ") : "";
      lines.push(`### 📦 ${s.name} (v${s.version})`);
      lines.push("");
      lines.push(`- **类别**：${s.category}`);
      lines.push(`- **描述**：${s.description}`);
      if (tagStr) lines.push(`- **标签**：${tagStr}`);
      lines.push(`- **创建**：${relativeTime(s.created_at)}`);
      lines.push(`- **更新**：${relativeTime(s.updated_at)}`);
      lines.push("");
    }
  }

  // ── Sessions ───────────────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push("## 📝 会话记录");
  lines.push("");

  const allSessions = db
    .prepare("SELECT id, date, summary, memories_created, skills_created FROM sessions ORDER BY date DESC")
    .all() as Array<{
    id: string;
    date: string;
    summary: string;
    memories_created: number;
    skills_created: number;
  }>;

  if (allSessions.length === 0) {
    lines.push("*暂无会话记录。调用 `session_review` 后会自动生成。*");
    lines.push("");
  } else {
    lines.push("| 日期 | 提取记忆数 | 提取技能数 | 摘要 |");
    lines.push("|------|-----------|-----------|------|");
    for (const s of allSessions) {
      lines.push(
        `| ${s.date} | ${s.memories_created} | ${s.skills_created} | ${truncate(s.summary, 80)} |`,
      );
    }
    lines.push("");
  }

  // ── Learning Curve ─────────────────────────────────────────────────
  if (allSessions.length > 1) {
    lines.push("---");
    lines.push("");
    lines.push("## 📈 学习曲线");
    lines.push("");

    // Group by date
    const byDate = new Map<string, { memories: number; skills: number }>();
    for (const s of allSessions) {
      const existing = byDate.get(s.date) ?? { memories: 0, skills: 0 };
      existing.memories += s.memories_created;
      existing.skills += s.skills_created;
      byDate.set(s.date, existing);
    }

    // Also count memories created directly (not through review)
    const memByDate = db
      .prepare(
        "SELECT DATE(created_at) as d, COUNT(*) as c FROM memories GROUP BY DATE(created_at) ORDER BY d",
      )
      .all() as Array<{ d: string; c: number }>;

    lines.push("### 每日知识积累");
    lines.push("");
    lines.push("| 日期 | 新增记忆 | 新增技能 | 活跃度 |");
    lines.push("|------|---------|---------|--------|");

    const maxDaily = Math.max(...memByDate.map((r) => r.c), 1);
    for (const row of memByDate) {
      const skillData = byDate.get(row.d);
      const skillsToday = skillData?.skills ?? 0;
      lines.push(`| ${row.d} | ${row.c} | ${skillsToday} | ${bar(row.c, maxDaily, 15)} |`);
    }
    lines.push("");
  }

  // ── Tag Cloud ──────────────────────────────────────────────────────
  const tagRows = db.prepare("SELECT tags FROM memories").all() as Array<{ tags: string }>;
  const tagCount = new Map<string, number>();
  for (const row of tagRows) {
    for (const tag of JSON.parse(row.tags) as string[]) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  if (tagCount.size > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## 🏷️ 标签云");
    lines.push("");

    const sorted = [...tagCount.entries()].sort((a, b) => b[1] - a[1]);
    const tagParts = sorted.map(([tag, count]) => `\`${tag}\`(${count})`);
    lines.push(tagParts.join("  "));
    lines.push("");
  }

  // ── Data Integrity ─────────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push("## 🔍 数据完整性检查");
  lines.push("");

  // Check: DB count vs file count
  const memFiles = countFiles(join(DATA_DIR, "memory"));
  const skillFiles = countFiles(join(DATA_DIR, "skills"));
  const sessionFiles = countFiles(join(DATA_DIR, "sessions"));

  const checks: Array<{ label: string; pass: boolean; detail: string }> = [
    {
      label: "数据库文件存在",
      pass: existsSync(DB_PATH),
      detail: DB_PATH,
    },
    {
      label: "记忆文件数 = 数据库记录数",
      pass: memFiles === memCount,
      detail: `文件 ${memFiles} / DB ${memCount}`,
    },
    {
      label: "技能文件数 = 数据库记录数",
      pass: skillFiles === skillCount,
      detail: `文件 ${skillFiles} / DB ${skillCount}`,
    },
    {
      label: "会话文件数 = 数据库记录数",
      pass: sessionFiles === sessionCount,
      detail: `文件 ${sessionFiles} / DB ${sessionCount}`,
    },
  ];

  // Check for orphaned files (files without DB entries)
  const dbMemIds = new Set(
    (db.prepare("SELECT id FROM memories").all() as Array<{ id: string }>).map((r) => r.id),
  );
  let orphanedFiles = 0;
  for (const type of ["preferences", "facts", "feedback"]) {
    const dir = join(DATA_DIR, "memory", type);
    try {
      for (const f of readdirSync(dir)) {
        const id = basename(f, ".md");
        if (!dbMemIds.has(id)) orphanedFiles++;
      }
    } catch {
      /* dir doesn't exist */
    }
  }
  checks.push({
    label: "无孤立文件（有文件但无 DB 记录）",
    pass: orphanedFiles === 0,
    detail: orphanedFiles > 0 ? `${orphanedFiles} 个孤立文件` : "全部一致",
  });

  for (const check of checks) {
    const icon = check.pass ? "✅" : "❌";
    lines.push(`- ${icon} **${check.label}**：${check.detail}`);
  }
  lines.push("");

  // ── Footer ─────────────────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push("*此报告由 `npm run dashboard` 自动生成，基于 `~/.auto-learning/index.db` 数据。*");

  db.close();
  return lines.join("\n");
}

// ── HTML Wrapper ─────────────────────────────────────────────────────────

function wrapHtml(markdown: string): string {
  // Minimal HTML wrapper that renders markdown nicely
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auto-Learning Dashboard</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
  h1 { color: #58a6ff; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }
  h2 { color: #58a6ff; margin-top: 2rem; }
  h3 { color: #8b949e; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #21262d; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: #161b22; color: #58a6ff; }
  tr:nth-child(even) { background: #161b22; }
  code { background: #161b22; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.9em; color: #f0883e; }
  blockquote { border-left: 3px solid #f0883e; margin: 1rem 0; padding: 0.5rem 1rem; color: #8b949e; background: #161b22; }
  hr { border: none; border-top: 1px solid #21262d; margin: 2rem 0; }
  em { color: #8b949e; }
  strong { color: #e6edf3; }
  ul { padding-left: 1.5rem; }
  li { margin: 0.25rem 0; }
</style>
</head>
<body>
<pre style="white-space: pre-wrap; font-family: inherit;">${markdown.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
<script>
// Very basic markdown-to-HTML (tables, headers, bold, code, lists)
const pre = document.querySelector('pre');
let html = pre.textContent;
// Headers
html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
// HR
html = html.replace(/^---$/gm, '<hr>');
// Bold
html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
// Inline code
html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
// Blockquote
html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
// Italic
html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
// Tables
html = html.replace(/((?:^\\|.+\\|$\\n?)+)/gm, (match) => {
  const rows = match.trim().split('\\n').filter(r => r.trim());
  if (rows.length < 2) return match;
  let table = '<table>';
  rows.forEach((row, i) => {
    if (row.match(/^\\|[\\s-|]+\\|$/)) return; // separator
    const cells = row.split('|').filter(c => c.trim() !== '');
    const tag = i === 0 ? 'th' : 'td';
    table += '<tr>' + cells.map(c => '<' + tag + '>' + c.trim() + '</' + tag + '>').join('') + '</tr>';
  });
  table += '</table>';
  return table;
});
// Lists
html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
html = html.replace(/(<li>.*<\\/li>\\n?)+/g, (m) => '<ul>' + m + '</ul>');
pre.outerHTML = html;
</script>
</body>
</html>`;
}

// ── Entry ────────────────────────────────────────────────────────────────

const markdown = generate();

if (process.argv.includes("--html")) {
  console.log(wrapHtml(markdown));
} else {
  console.log(markdown);
}
