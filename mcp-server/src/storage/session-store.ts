import type Database from "better-sqlite3";
import { writeFileSync, mkdirSync } from "fs";
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
