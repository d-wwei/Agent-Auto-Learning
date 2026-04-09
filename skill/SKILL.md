---
name: auto-learning
description: Self-learning protocol — teaches agents to persist knowledge and evolve skills via MCP tools
version: 0.1.0
metadata:
  auto-learning:
    tags: [learning, memory, skills, evolution, meta]
---

# Auto-Learning Protocol

You have access to a learning system via MCP tools (auto-learning server). This protocol defines WHEN and HOW to use it.

## Quick Reference

| Tool | When to use |
|------|-------------|
| `memory_search` | Start of a new task — check for relevant prior knowledge |
| `skill_list` | Start of a new task — check for relevant learned procedures |
| `memory_write` | User corrects your approach, or you discover a reusable fact |
| `skill_create` | You complete a non-trivial multi-step workflow worth reusing |
| `skill_patch` | You find an existing skill is outdated or incomplete |
| `session_review` | After completing a complex task (5+ tool calls) or before session ends |
| `learning_status` | When you want to check what you've learned so far |

## Trigger Rules

### On Task Start
Before diving into work, check for prior knowledge:
1. Call `memory_search` with keywords from the user's request
2. Call `skill_list` to see if a relevant skill exists
3. If a skill matches, call `skill_view` to load it and follow its instructions

### During Task Execution
Watch for learning opportunities:
- **User corrects you** → immediately call `memory_write` with type "feedback"
- **You discover a non-obvious fact** (tool quirk, project convention) → call `memory_write` with type "fact"
- **User states a preference** → call `memory_write` with type "preference"

### After Complex Task Completion (5+ tool calls)
Compose a structured summary and submit for review:
1. Write a summary with these sections:
   - **Goal**: What the user wanted
   - **Approach**: Steps taken (including dead ends)
   - **Outcome**: What was achieved
   - **Learnings**: Non-obvious discoveries
   - **Errors**: Mistakes made and how they were resolved
2. Call `session_review` with this summary
3. The review engine will automatically extract and persist relevant knowledge

### When Review Engine Is Unavailable
If `session_review` returns "review_unavailable", fall back to manual persistence:
- Call `memory_write` directly for important facts/preferences/feedback
- Call `skill_create` directly if a reusable workflow was discovered

## Memory Types

| Type | What to store | Example |
|------|--------------|---------|
| `preference` | User's work style, communication expectations | "User prefers concise responses without trailing summaries" |
| `fact` | Environment details, tool behaviors, project conventions | "This project uses pnpm, not npm" |
| `feedback` | Corrections to agent behavior | "Don't mock the database in integration tests — use real DB" |

## Skill Creation Guidelines

Only create a skill when ALL of these are true:
1. The workflow took 5+ tool calls to complete
2. It involved trial-and-error or non-obvious steps
3. It would benefit future similar tasks
4. It's not just "read file, edit file" — there must be domain knowledge

Skill content must include YAML frontmatter with `name` and `description` fields.

## Important

- **Quality over quantity**: Don't save trivial or obvious knowledge
- **Be concise**: Memory entries should be under 500 characters
- **Tag everything**: Tags enable better search recall
- **Patch don't recreate**: If a skill exists but is wrong, use `skill_patch`
