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
