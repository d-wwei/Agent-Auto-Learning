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
          type: "text" as const,
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
