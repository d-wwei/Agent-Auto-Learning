import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SkillStore } from "../storage/skill-store.js";

export function registerSkillTools(server: McpServer, store: SkillStore) {
  server.tool(
    "skill_create",
    "Create a new skill from a learned procedure. Content must be valid SKILL.md with YAML frontmatter.",
    {
      name: z.string().describe("Skill name (kebab-case)"),
      category: z.string().describe("Skill category"),
      content: z.string().describe("Full SKILL.md content with YAML frontmatter"),
    },
    async ({ name, category, content }) => {
      try {
        const result = store.create({ name, category, content });
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "skill_patch",
    "Patch an existing skill by replacing a string. Used to update or fix skills.",
    {
      name: z.string().describe("Skill name to patch"),
      old_string: z.string().describe("Text to find and replace"),
      new_string: z.string().describe("Replacement text"),
    },
    async ({ name, old_string, new_string }) => {
      try {
        const result = store.patch({ name, old_string, new_string });
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "skill_list",
    "List all learned skills. Returns name, description, category, and last updated time.",
    {
      category: z.string().optional().describe("Filter by category"),
    },
    async ({ category }) => {
      const skills = store.list({ category });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              count: skills.length,
              skills: skills.map((s) => ({ name: s.name, description: s.description, category: s.category, updated: s.updated_at })),
            }),
          },
        ],
      };
    },
  );

  server.tool(
    "skill_view",
    "View the full content of a specific skill.",
    { name: z.string().describe("Skill name") },
    async ({ name }) => {
      const result = store.view(name);
      if (!result) return { content: [{ type: "text" as const, text: `Skill '${name}' not found` }], isError: true };
      return { content: [{ type: "text" as const, text: result.content }] };
    },
  );
}
