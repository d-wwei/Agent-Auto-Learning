import type Database from "better-sqlite3";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
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
    if (!VALID_NAME_RE.test(params.name)) {
      throw new Error(`Invalid skill name: must match ${VALID_NAME_RE.source}`);
    }
    if (params.name.length > this.config.limits.skillNameMaxLen) {
      throw new Error(`Skill name exceeds ${this.config.limits.skillNameMaxLen} char limit`);
    }
    if (params.content.length > this.config.limits.skillMaxChars) {
      throw new Error(`Skill content exceeds ${this.config.limits.skillMaxChars} char limit`);
    }

    const parsed = this.parseFrontmatter(params.content);
    if (!parsed) throw new Error("SKILL.md must start with valid YAML frontmatter (--- ... ---)");
    if (!parsed.meta.name) throw new Error("Frontmatter must include 'name' field");
    if (!parsed.meta.description) throw new Error("Frontmatter must include 'description' field");
    if (!parsed.body.trim()) throw new Error("SKILL.md must have content after frontmatter");

    const existing = this.db.prepare("SELECT name FROM skills WHERE name = ?").get(params.name);
    if (existing) throw new Error(`Skill '${params.name}' already exists. Use skill_patch to update.`);

    const scanResult = scanContent(params.content);
    if (!scanResult.safe) {
      return { path: "", status: "blocked", safety_report: formatScanReport(scanResult) };
    }

    const skillDir = join(this.config.dataDir, "skills", params.category, params.name);
    const filePath = join(skillDir, "SKILL.md");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(filePath, params.content, "utf-8");

    const now = new Date().toISOString();
    const description = (parsed.meta.description as string).slice(0, this.config.limits.skillDescMaxLen);
    const metadataAny = parsed.meta.metadata as Record<string, Record<string, unknown>> | undefined;
    const tags = JSON.stringify(metadataAny?.["auto-learning"]?.["tags"] ?? []);

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

    const parsed = this.parseFrontmatter(newContent);
    if (!parsed) throw new Error("Patch broke YAML frontmatter");

    const scanResult = scanContent(newContent);
    if (!scanResult.safe) {
      throw new Error(`Patch blocked by security scan:\n${formatScanReport(scanResult)}`);
    }

    writeFileSync(skill.file_path, newContent, "utf-8");

    const now = new Date().toISOString();
    const description = (parsed.meta.description as string ?? skill.description).slice(0, this.config.limits.skillDescMaxLen);
    this.db.prepare(`UPDATE skills SET description = ?, updated_at = ? WHERE name = ?`).run(description, now, params.name);

    this.db.prepare(`DELETE FROM skills_fts WHERE name = ?`).run(params.name);
    const patchMetaAny = parsed.meta.metadata as Record<string, Record<string, unknown>> | undefined;
    const tags = JSON.stringify(patchMetaAny?.["auto-learning"]?.["tags"] ?? []);
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
