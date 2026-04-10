# Anti-Patterns

Failure modes specific to experiential learning. These are distinct from general quality issues.

## 1. Amnesia Loop

**What it looks like:** Agent does good work, user corrects something, agent acknowledges — but nothing is persisted. Next session, same mistake.

**Detection signals:**
- User says "I already told you this" or "we went over this before"
- Agent asks a question whose answer exists in memory
- Same error corrected more than once

**Fix:** Persist immediately on correction. Don't wait for session end.

## 2. Hoarder Memory

**What it looks like:** Agent saves everything — trivial facts, one-off details, temporary state. Memory becomes noisy and search returns irrelevant results.

**Detection signals:**
- Memories contain phrases like "the user asked me to..." (narration, not knowledge)
- Memories about file paths that will change
- Temporary debugging context saved as permanent fact

**Fix:** Before persisting, ask: "Will this still matter in 30 days?" If no, skip it.

## 3. Phantom Recall

**What it looks like:** Agent claims to remember something but doesn't actually search. Makes up a preference or fact based on pattern matching rather than retrieving it.

**Detection signals:**
- Agent says "I recall that you prefer..." without having called a search tool
- Recalled information is vaguely correct but wrong in specifics

**Fix:** Always search before claiming prior knowledge. No search = no claim.

## 4. Review Theater

**What it looks like:** Agent submits a session review, but the summary is shallow or generic. Review engine finds nothing worth saving because the input was empty calories.

**Detection signals:**
- Summary is one sentence: "User asked me to do X, I did X"
- No learnings or errors section
- Same boilerplate every time

**Fix:** Summary must include what went wrong, what was non-obvious, what changed mid-approach. If nothing fits, skip the review — not everything is worth reviewing.

## 5. Skill Sprawl

**What it looks like:** Agent creates a new skill for every slightly different workflow. Skills overlap and fragment knowledge.

**Detection signals:**
- Multiple skills with similar names and overlapping steps
- Agent creates a skill for a 3-step process that was straightforward

**Fix:** Only create skills when ALL criteria met: 5+ steps, trial-and-error involved, reusable across contexts, contains domain knowledge. Prefer patching existing skills over creating new ones.

## 6. Stale Trust

**What it looks like:** Agent retrieves old knowledge and follows it blindly, even when the environment has changed.

**Detection signals:**
- Agent uses a package version or API pattern from months ago without checking
- Skill references a file path that no longer exists

**Fix:** Treat recalled knowledge as a starting hypothesis, not a guaranteed fact. Verify critical details before acting on old memories.

## Quick Self-Check Sequence

1. Did I search before starting, or did I assume?
2. Am I saving signal or noise?
3. Did I actually retrieve, or am I guessing from context?
4. Is my review summary specific enough to extract knowledge from?
5. Should this be a new skill, a patch, or nothing?
6. Is the knowledge I'm applying still current?
