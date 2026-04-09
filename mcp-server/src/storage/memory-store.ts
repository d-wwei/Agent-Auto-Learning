import type Database from "better-sqlite3";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
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
      .prepare(`UPDATE memories SET content = ?, tags = ?, confidence = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
      .run(content, tagsJson, params.confidence ?? existing.confidence, params.expires_at ?? existing.expires_at, now, id);

    this.db.prepare(`DELETE FROM memories_fts WHERE id = ?`).run(id);
    this.db.prepare(`INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)`).run(id, content, tagsJson);

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
