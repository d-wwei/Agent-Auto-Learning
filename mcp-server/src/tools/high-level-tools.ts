import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryStore } from "../storage/memory-store.js";
import type { SkillStore } from "../storage/skill-store.js";
import type { SessionStore } from "../storage/session-store.js";
import type { ReviewEngine } from "../review/engine.js";

export function registerHighLevelTools(
  server: McpServer,
  memoryStore: MemoryStore,
  skillStore: SkillStore,
  sessionStore: SessionStore,
  reviewEngine: ReviewEngine,
) {
  // ── recall ─────────────────────────────────────────────────────
  server.tool(
    "recall",
    "Search prior knowledge before starting a task. Returns relevant memories and matching skills in one call.",
    {
      query: z.string().describe("Keywords describing the task or topic"),
      limit: z.number().optional().describe("Max memory results (default 5)"),
    },
    async ({ query, limit }) => {
      try {
        const memories = memoryStore.search(query, { limit: limit ?? 5 });
        const allSkills = skillStore.list();

        // Simple keyword matching for skills
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/);
        const matchingSkills = allSkills.filter((s) => {
          const searchable = `${s.name} ${s.description} ${(s.tags as unknown as string[]).join(" ")}`.toLowerCase();
          return queryWords.some((w) => searchable.includes(w));
        });

        const result: Record<string, unknown> = {
          memories: {
            count: memories.length,
            items: memories.map((m) => ({
              type: m.type,
              content: m.content,
              tags: m.tags,
              confidence: m.confidence,
            })),
          },
          skills: {
            count: matchingSkills.length,
            items: matchingSkills.map((s) => ({
              name: s.name,
              description: s.description,
              category: s.category,
            })),
          },
        };

        // Auto-load skill content if exactly one match
        if (matchingSkills.length === 1) {
          const content = skillStore.view(matchingSkills[0].name);
          if (content) {
            (result.skills as Record<string, unknown>).loaded_skill = {
              name: matchingSkills[0].name,
              content: content.content,
            };
          }
        }

        const hasKnowledge = memories.length > 0 || matchingSkills.length > 0;
        (result as Record<string, unknown>).summary = hasKnowledge
          ? `Found ${memories.length} memories and ${matchingSkills.length} relevant skills.`
          : "No prior knowledge found for this topic. Starting fresh.";

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // ── learn ──────────────────────────────────────────────────────
  server.tool(
    "learn",
    "Persist knowledge from the current session. Smart routing: corrections/facts/preferences → memory, structured summaries → session review (auto-extracts memories and skills), explicit skill content → skill creation. Also supports delete, patch, and gc operations.",
    {
      action: z
        .enum(["memory", "review", "skill_create", "skill_patch", "delete", "gc"])
        .describe(
          "What to do: 'memory' = save a fact/preference/feedback, 'review' = submit conversation summary for auto-extraction, 'skill_create' = save a reusable procedure, 'skill_patch' = fix an existing skill, 'delete' = remove a memory by id, 'gc' = garbage collect old memories",
        ),
      // For memory action
      type: z.enum(["preference", "fact", "feedback"]).optional().describe("Memory type (required for action=memory)"),
      content: z.string().optional().describe("The knowledge to persist (required for memory/review/skill_create)"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      confidence: z.enum(["high", "medium", "low"]).optional().describe("Confidence level (for memory)"),
      // For skill_create action
      name: z.string().optional().describe("Skill name in kebab-case (for skill_create/skill_patch)"),
      category: z.string().optional().describe("Skill category (for skill_create)"),
      // For skill_patch action
      old_string: z.string().optional().describe("Text to replace (for skill_patch)"),
      new_string: z.string().optional().describe("Replacement text (for skill_patch)"),
      // For delete action
      id: z.string().optional().describe("Memory ID (for delete)"),
      // For gc action
      max_age_days: z.number().optional().describe("Max age in days for gc (default 90)"),
      dry_run: z.boolean().optional().describe("Preview gc without deleting"),
    },
    async (params) => {
      try {
        switch (params.action) {
          case "memory": {
            if (!params.type) throw new Error("'type' is required for action=memory");
            if (!params.content) throw new Error("'content' is required for action=memory");
            const result = memoryStore.write({
              type: params.type,
              content: params.content,
              tags: params.tags,
              confidence: params.confidence,
              source: "agent_direct",
            });
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          }

          case "review": {
            if (!params.content) throw new Error("'content' (conversation summary) is required for action=review");
            if (!reviewEngine.available) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      status: "review_unavailable",
                      reason: "No API key configured. Set ANTHROPIC_API_KEY to enable automatic review.",
                      fallback: "Use action=memory to persist individual facts/preferences/feedback.",
                    }),
                  },
                ],
              };
            }
            const result = await reviewEngine.review(params.content, memoryStore, skillStore, sessionStore);
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
          }

          case "skill_create": {
            if (!params.name) throw new Error("'name' is required for action=skill_create");
            if (!params.category) throw new Error("'category' is required for action=skill_create");
            if (!params.content) throw new Error("'content' (SKILL.md) is required for action=skill_create");
            const result = skillStore.create({ name: params.name, category: params.category, content: params.content });
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          }

          case "skill_patch": {
            if (!params.name) throw new Error("'name' is required for action=skill_patch");
            if (!params.old_string) throw new Error("'old_string' is required for action=skill_patch");
            if (!params.new_string) throw new Error("'new_string' is required for action=skill_patch");
            const result = skillStore.patch({ name: params.name, old_string: params.old_string, new_string: params.new_string });
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          }

          case "delete": {
            if (!params.id) throw new Error("'id' is required for action=delete");
            const result = memoryStore.delete(params.id);
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          }

          case "gc": {
            const result = memoryStore.gc({ maxAgeDays: params.max_age_days, dryRun: params.dry_run });
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          }

          default:
            throw new Error(`Unknown action: ${params.action}`);
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // ── learning_status ────────────────────────────────────────────
  server.tool(
    "learning_status",
    "Overview of the learning system: memory count, skill count, recent sessions, review engine status.",
    {},
    async () => {
      const recentSessions = sessionStore.recent(3);
      const allSkills = skillStore.list();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                memory_count: memoryStore.count(),
                skill_count: skillStore.count(),
                session_count: sessionStore.count(),
                review_engine: reviewEngine.available ? "active" : "inactive (no API key)",
                skills: allSkills.map((s) => ({ name: s.name, description: s.description, category: s.category })),
                recent_sessions: recentSessions.map((s) => ({
                  date: s.date,
                  memories: s.memories_created,
                  skills: s.skills_created,
                  summary: s.summary?.slice(0, 100),
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
