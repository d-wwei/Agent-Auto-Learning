import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryStore } from "../storage/memory-store.js";

export function registerMemoryTools(server: McpServer, store: MemoryStore) {
  server.tool(
    "memory_write",
    "Write a memory entry (preference, fact, or feedback). Use for persisting knowledge across sessions.",
    {
      type: z.enum(["preference", "fact", "feedback"]).describe("Memory type"),
      content: z.string().describe("The knowledge to remember"),
      source: z.string().optional().describe("Where this knowledge came from"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      confidence: z.enum(["high", "medium", "low"]).optional().describe("Confidence level"),
    },
    async ({ type, content, source, tags, confidence }) => {
      try {
        const result = store.write({ type, content, source, tags, confidence });
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "memory_read",
    "Read a specific memory entry by ID.",
    { id: z.string().describe("Memory ID") },
    async ({ id }) => {
      const mem = store.read(id);
      if (!mem) return { content: [{ type: "text" as const, text: `Memory ${id} not found` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(mem) }] };
    },
  );

  server.tool(
    "memory_search",
    "Search memories by keyword. Returns ranked results.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 10)"),
      type: z.enum(["preference", "fact", "feedback"]).optional().describe("Filter by type"),
    },
    async ({ query, limit, type }) => {
      try {
        const results = store.search(query, { limit, type });
        return { content: [{ type: "text" as const, text: JSON.stringify({ count: results.length, results }) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "memory_delete",
    "Delete a memory entry by ID.",
    { id: z.string().describe("Memory ID to delete") },
    async ({ id }) => {
      try {
        const result = store.delete(id);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "memory_gc",
    "Garbage collect expired and low-confidence memories.",
    {
      max_age_days: z.number().optional().describe("Max age in days for low-confidence memories (default 90)"),
      dry_run: z.boolean().optional().describe("If true, only report what would be removed"),
    },
    async ({ max_age_days, dry_run }) => {
      const result = store.gc({ maxAgeDays: max_age_days, dryRun: dry_run });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );
}
