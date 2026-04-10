import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";
import type { MemoryProvider } from "../providers/memory-provider.js";
import type { SkillStore } from "../storage/skill-store.js";
import type { SessionStore } from "../storage/session-store.js";

interface ReviewResult {
  memories: Array<{ type: string; content: string; tags: string[]; confidence: string }>;
  skills: Array<{ action: "create" | "patch"; name: string; category?: string; content?: string; old_string?: string; new_string?: string }>;
  actions_taken: string[];
}

const REVIEW_PROMPT = `You are a knowledge extraction engine. Review the conversation summary below and extract two kinds of knowledge:

**Memory** (declarative knowledge):
- User preferences, work style, communication expectations
- Environment facts: tool quirks, project conventions, discovered patterns
- Feedback corrections: user corrected the agent's approach

**Skills** (procedural knowledge):
- Non-trivial workflow that required trial-and-error
- Multi-step process that would benefit future similar tasks
- Approach the user expected but the agent didn't initially follow

Output valid JSON matching this schema:
{
  "memories": [
    { "type": "preference|fact|feedback", "content": "concise statement", "tags": ["tag"], "confidence": "high|medium" }
  ],
  "skills": [
    { "action": "create", "name": "kebab-case-name", "category": "category", "content": "full SKILL.md with YAML frontmatter" }
  ]
}

Rules:
- Only extract genuinely reusable knowledge. Quality over quantity.
- If nothing is worth saving, return {"memories": [], "skills": []}.
- Memory content must be concise (under 500 chars).
- Skill names must be lowercase kebab-case.

CONVERSATION SUMMARY:
`;

export class ReviewEngine {
  private client: Anthropic | null = null;

  constructor(private config: Config) {
    const apiKey = process.env[config.review.apiKeyEnv];
    if (apiKey && config.review.enabled) {
      this.client = new Anthropic({ apiKey });
    }
  }

  get available(): boolean {
    return this.client !== null && this.config.review.enabled;
  }

  async review(
    conversationSummary: string,
    memoryProvider: MemoryProvider,
    skillStore: SkillStore,
    sessionStore: SessionStore,
  ): Promise<ReviewResult> {
    if (!this.client) {
      return { memories: [], skills: [], actions_taken: ["review_skipped: no API key configured"] };
    }

    let raw: string;
    try {
      const response = await this.client.messages.create({
        model: this.config.review.model,
        max_tokens: this.config.review.maxTokens,
        temperature: this.config.review.temperature,
        messages: [{ role: "user", content: REVIEW_PROMPT + conversationSummary }],
      });
      raw = response.content[0].type === "text" ? response.content[0].text : "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { memories: [], skills: [], actions_taken: [`review_error: ${msg}`] };
    }

    let parsed: { memories?: ReviewResult["memories"]; skills?: ReviewResult["skills"] };
    try {
      const jsonStr = raw.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "");
      parsed = JSON.parse(jsonStr);
    } catch {
      return { memories: [], skills: [], actions_taken: ["review_error: failed to parse LLM response as JSON"] };
    }

    const actions: string[] = [];

    for (const mem of parsed.memories ?? []) {
      try {
        const validType = ["preference", "fact", "feedback"].includes(mem.type) ? mem.type as "preference" | "fact" | "feedback" : "fact";
        await memoryProvider.write({
          type: validType,
          content: mem.content,
          tags: mem.tags ?? [],
          confidence: (mem.confidence === "high" ? "high" : "medium") as "high" | "medium",
          source: "session_review",
        });
        actions.push(`memory_created: ${validType}`);
      } catch (err) {
        actions.push(`memory_error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const skill of parsed.skills ?? []) {
      try {
        if (skill.action === "create" && skill.content && skill.category) {
          const result = skillStore.create({ name: skill.name, category: skill.category, content: skill.content });
          actions.push(`skill_${result.status}: ${skill.name}`);
        } else if (skill.action === "patch" && skill.old_string && skill.new_string) {
          skillStore.patch({ name: skill.name, old_string: skill.old_string, new_string: skill.new_string });
          actions.push(`skill_patched: ${skill.name}`);
        }
      } catch (err) {
        actions.push(`skill_error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const memCount = (parsed.memories ?? []).length;
    const skillCount = (parsed.skills ?? []).length;
    if (memCount > 0 || skillCount > 0) {
      sessionStore.save({ summary: conversationSummary.slice(0, 2000), memories_created: memCount, skills_created: skillCount });
    }

    return { memories: parsed.memories ?? [], skills: parsed.skills ?? [], actions_taken: actions };
  }
}
