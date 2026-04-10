import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Config } from "../config.js";
import type { MemoryStore } from "../storage/memory-store.js";
import type { MemoryProvider } from "./memory-provider.js";
import { BuiltinMemoryProvider } from "./builtin-provider.js";
import { AgentRecallProvider } from "./agent-recall-provider.js";

const AGENT_RECALL_DB = join(homedir(), ".agent-recall", "agent-recall.db");

export async function detectMemoryProvider(config: Config, memoryStore: MemoryStore): Promise<MemoryProvider> {
  const mode = config.memory.provider;

  if (mode === "builtin") {
    console.error("auto-learning: memory provider = builtin (explicit config)");
    return new BuiltinMemoryProvider(memoryStore);
  }

  if (mode === "agent-recall") {
    const provider = new AgentRecallProvider(config);
    if (await provider.isHealthy()) {
      console.error(`auto-learning: memory provider = agent-recall (explicit config, healthy)`);
      return provider;
    }
    console.error("auto-learning: agent-recall configured but unhealthy, falling back to builtin");
    return new BuiltinMemoryProvider(memoryStore);
  }

  // mode === "auto"
  if (!existsSync(AGENT_RECALL_DB)) {
    console.error("auto-learning: memory provider = builtin (no agent-recall detected)");
    return new BuiltinMemoryProvider(memoryStore);
  }

  const provider = new AgentRecallProvider(config);
  if (await provider.isHealthy()) {
    console.error("auto-learning: memory provider = agent-recall (auto-detected, healthy)");
    return provider;
  }

  console.error("auto-learning: agent-recall detected but worker not running, falling back to builtin");
  return new BuiltinMemoryProvider(memoryStore);
}
