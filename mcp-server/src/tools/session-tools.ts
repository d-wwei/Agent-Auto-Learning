import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionStore } from "../storage/session-store.js";
import type { ReviewEngine } from "../review/engine.js";
import type { MemoryProvider } from "../providers/memory-provider.js";
import type { SkillStore } from "../storage/skill-store.js";

export function registerSessionTools(
  server: McpServer,
  sessionStore: SessionStore,
  reviewEngine: ReviewEngine,
  memoryProvider: MemoryProvider,
  skillStore: SkillStore,
) {
  server.tool(
    "session_review",
    "Submit a conversation summary for knowledge extraction. The review engine analyzes it and automatically persists memories and skills.",
    {
      conversation_summary: z.string().describe("Structured summary: Goal / Approach / Outcome / Learnings / Errors"),
    },
    async ({ conversation_summary }) => {
      if (!reviewEngine.available) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "review_unavailable",
                reason: "No API key configured. Set ANTHROPIC_API_KEY to enable automatic review.",
                fallback: "Use memory_write and skill_create directly to persist knowledge.",
              }),
            },
          ],
        };
      }

      const result = await reviewEngine.review(conversation_summary, memoryProvider, skillStore, sessionStore);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "session_search",
    "Search past session summaries by keyword.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 10)"),
      days: z.number().optional().describe("Only search last N days"),
    },
    async ({ query, limit, days }) => {
      const results = sessionStore.search(query, { limit, days });
      return { content: [{ type: "text" as const, text: JSON.stringify({ count: results.length, results }) }] };
    },
  );
}
