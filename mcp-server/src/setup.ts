#!/usr/bin/env node
/**
 * Auto-Learning Setup — installs cognitive base into agent config.
 *
 * Usage: npx auto-learning-mcp setup
 *        node dist/setup.js
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve cognitive-protocol.md relative to compiled dist/ or src/
function findProtocol(): string {
  // When running from dist/, go up to project root, then into cognitive-base/
  const candidates = [
    resolve(__dirname, "..", "..", "cognitive-base", "cognitive-protocol.md"),
    resolve(__dirname, "..", "cognitive-base", "cognitive-protocol.md"),
    resolve(process.cwd(), "cognitive-base", "cognitive-protocol.md"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Fallback: look relative to the package root
  const packageRoot = resolve(__dirname, "..");
  const fallback = resolve(packageRoot, "..", "cognitive-base", "cognitive-protocol.md");
  if (existsSync(fallback)) return fallback;
  throw new Error(
    `Cannot find cognitive-protocol.md. Searched:\n${candidates.concat(fallback).map((p) => `  - ${p}`).join("\n")}`,
  );
}

interface PlatformTarget {
  name: string;
  file: string;
  detected: boolean;
  method: "append" | "reference";
}

function detectPlatforms(): PlatformTarget[] {
  const home = homedir();
  const cwd = process.cwd();

  return [
    {
      name: "Claude Code",
      file: join(home, ".claude", "CLAUDE.md"),
      detected: existsSync(join(home, ".claude")),
      method: "reference" as const,
    },
    {
      name: "Codex",
      file: join(cwd, "AGENTS.md"),
      detected: existsSync(join(cwd, "AGENTS.md")) || process.env.CODEX_HOME !== undefined,
      method: "append" as const,
    },
    {
      name: "Gemini CLI",
      file: join(cwd, "GEMINI.md"),
      detected: existsSync(join(cwd, "GEMINI.md")) || existsSync(join(home, ".gemini")),
      method: "append" as const,
    },
    {
      name: "Cursor",
      file: join(cwd, ".cursorrules"),
      detected: existsSync(join(cwd, ".cursorrules")) || existsSync(join(cwd, ".cursor")),
      method: "append" as const,
    },
  ];
}

function install(target: PlatformTarget, protocolPath: string): void {
  const protocolContent = readFileSync(protocolPath, "utf-8");
  const marker = "# Experiential Learning Protocol";

  // Check if already installed
  if (existsSync(target.file)) {
    const existing = readFileSync(target.file, "utf-8");
    if (existing.includes(marker)) {
      console.log(`  ⏭  ${target.name}: already installed in ${target.file}`);
      return;
    }
  }

  mkdirSync(dirname(target.file), { recursive: true });

  if (target.method === "reference") {
    // For Claude Code: add an @reference
    const ref = `\n@${protocolPath}\n`;
    if (existsSync(target.file)) {
      const existing = readFileSync(target.file, "utf-8");
      if (existing.includes(protocolPath)) {
        console.log(`  ⏭  ${target.name}: reference already in ${target.file}`);
        return;
      }
      writeFileSync(target.file, existing.trimEnd() + "\n" + ref, "utf-8");
    } else {
      writeFileSync(target.file, ref, "utf-8");
    }
  } else {
    // For other platforms: append content
    const block = `\n\n${protocolContent}\n`;
    if (existsSync(target.file)) {
      const existing = readFileSync(target.file, "utf-8");
      writeFileSync(target.file, existing.trimEnd() + block, "utf-8");
    } else {
      writeFileSync(target.file, protocolContent, "utf-8");
    }
  }

  console.log(`  ✅  ${target.name}: installed into ${target.file}`);
}

function main() {
  console.log("");
  console.log("🧠 Auto-Learning Setup");
  console.log("━".repeat(50));
  console.log("");

  // Find protocol file
  let protocolPath: string;
  try {
    protocolPath = findProtocol();
    console.log(`📄 Cognitive base: ${protocolPath}`);
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Detect platforms
  const platforms = detectPlatforms();
  const detected = platforms.filter((p) => p.detected);

  if (detected.length === 0) {
    console.log("");
    console.log("⚠️  No supported agent platform detected.");
    console.log("   Supported: Claude Code, Codex, Gemini CLI, Cursor");
    console.log("");
    console.log("   Manual install: copy the content of cognitive-protocol.md");
    console.log("   into your agent's system prompt or config file.");
    process.exit(0);
  }

  console.log(`🔍 Detected platforms: ${detected.map((p) => p.name).join(", ")}`);
  console.log("");

  // Install to all detected platforms
  for (const target of detected) {
    install(target, protocolPath);
  }

  // Ensure data directory exists
  const dataDir = join(homedir(), ".auto-learning");
  mkdirSync(dataDir, { recursive: true });

  console.log("");
  console.log("━".repeat(50));
  console.log("✅ Setup complete. Restart your agent to activate.");
  console.log("");
}

main();
