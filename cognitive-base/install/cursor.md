# Install — Cursor / Windsurf / Generic

Append the content of `cognitive-protocol.md` to your agent's system prompt injection file:

| Platform | File |
|----------|------|
| Cursor | `.cursorrules` or `.cursor/rules` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| Generic | Prepend to system prompt |

```bash
cat /path/to/auto-learning/cognitive-base/cognitive-protocol.md >> .cursorrules
```
