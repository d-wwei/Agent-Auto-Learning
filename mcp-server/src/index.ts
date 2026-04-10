#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./storage/database.js";
import { MemoryStore } from "./storage/memory-store.js";
import { SkillStore } from "./storage/skill-store.js";
import { SessionStore } from "./storage/session-store.js";
import { ReviewEngine } from "./review/engine.js";
import { detectMemoryProvider } from "./providers/index.js";
import { registerHighLevelTools } from "./tools/high-level-tools.js";

async function main() {
  const config = loadConfig();
  const db = openDatabase(config);
  const memoryStore = new MemoryStore(db, config);
  const skillStore = new SkillStore(db, config);
  const sessionStore = new SessionStore(db, config);
  const reviewEngine = new ReviewEngine(config);

  const memoryProvider = await detectMemoryProvider(config, memoryStore);

  const server = new McpServer({
    name: "auto-learning",
    version: "0.3.0",
  });

  registerHighLevelTools(server, memoryProvider, skillStore, sessionStore, reviewEngine);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`auto-learning-mcp v0.3.0: connected (3 tools) memory_provider=${memoryProvider.info().name}`);
}

main().catch((err) => {
  console.error("auto-learning-mcp: fatal error:", err);
  process.exit(1);
});
