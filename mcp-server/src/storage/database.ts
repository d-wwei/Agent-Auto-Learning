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
    `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')`,
  ],
};

export function openDatabase(config: Config): Database.Database {
  const dbPath = join(config.dataDir, "index.db");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  let currentVersion = 0;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    if (row) currentVersion = parseInt(row.value, 10);
  } catch {
    // meta table doesn't exist yet
  }

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
