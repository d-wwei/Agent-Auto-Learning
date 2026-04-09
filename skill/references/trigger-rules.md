# Auto-Learning Trigger Rules (Detailed)

## Trigger Matrix

| Condition | Action | Priority |
|-----------|--------|----------|
| New task begins | `memory_search` + `skill_list` | High — do this BEFORE starting work |
| User says "don't do that" / corrects approach | `memory_write(type=feedback)` | Immediate |
| User states preference | `memory_write(type=preference)` | Immediate |
| Discovered tool/env quirk | `memory_write(type=fact)` | When convenient |
| Complex task done (5+ tool calls) | `session_review` | After task completion |
| Found skill is wrong/outdated | `skill_patch` | Immediate |
| Discovered reusable workflow | `skill_create` | After task completion |
| Session ending | `session_review` if anything notable happened | Before goodbye |

## Summary Format for session_review

```
Goal: [One sentence — what the user wanted]
Approach: [2-3 sentences — what steps were taken, including failures]
Outcome: [One sentence — what was achieved]
Learnings: [Bullet points — non-obvious discoveries]
Errors: [Bullet points — mistakes and resolutions]
```

## When NOT to Learn

- Trivial tasks (single file read, simple question answering)
- Information already in memory (check first!)
- Temporary/one-off facts that won't be useful again
- Sensitive information (passwords, tokens, keys)
