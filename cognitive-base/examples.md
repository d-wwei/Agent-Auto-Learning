# Before/After Examples

Three scenarios showing the cognitive shift from default behavior to experiential learning behavior.

---

## Scenario 1: Code Task (Different Domain Each Time)

**User:** Help me set up ESLint for this TypeScript project.

### Before (Default Mode)

> I'll set up ESLint for your TypeScript project. Let me create `.eslintrc.json`...
>
> *[Creates .eslintrc.json with standard config]*
> *[Runs eslint, gets errors about flat config]*
>
> It looks like ESLint 9 requires a different format. Let me switch to `eslint.config.js`...
> *[Trial and error for 10 minutes]*
> *[Eventually gets it working]*
>
> Done! ESLint is configured.

**Problems:**
- Didn't check if this had been solved before
- Wasted time on deprecated format
- Learned nothing persistent — will repeat same mistake next time

### After (With Experiential Learning)

> Before I start, let me check what I know about ESLint in your environment.
>
> *[Calls recall("ESLint TypeScript config")]*
> *[Finds: "ESLint 9 requires flat config format, not .eslintrc.json" + "typescript-eslint v8 provides tseslint.config() helper"]*
>
> I have prior knowledge about this: ESLint 9 requires flat config format, and typescript-eslint v8 has a config helper that simplifies setup. Let me use that directly.
>
> *[Creates eslint.config.js with tseslint.config() — correct on first try]*
>
> Done! Used flat config with tseslint.config() based on what I learned from a previous session.

**Active shifts:**
- Searched before acting (recall)
- Applied prior knowledge, avoided known dead-end
- Saved 10 minutes of trial-and-error

---

## Scenario 2: User Preference (Communication Style)

**User:** Write a summary of this meeting transcript.

### Before (Default Mode)

> ## Meeting Summary
>
> ### Key Discussion Points
> The team discussed several important topics during today's meeting...
>
> ### Action Items
> 1. Sarah will prepare the Q2 report by Friday
> 2. ...
>
> ### Conclusions
> In conclusion, the meeting was productive and covered important ground. The team aligned on next steps and will reconvene next week to review progress.

**Problems:**
- Verbose, generic phrasing
- Trailing summary paragraph the user didn't ask for
- Doesn't reflect any known user preferences

### After (With Experiential Learning)

> *[Calls recall("meeting summary writing style")]*
> *[Finds preference: "结论优先，简洁直接，不需要结尾总结"]*
> *[Finds feedback: "不要在代码里自动加注释，好的代码应该自解释" — infers: user values conciseness across domains]*
>
> **Q2 planning meeting — 3 decisions, 4 action items.**
>
> Decisions:
> - Ship v2.1 before April 20 (hard deadline, client commitment)
> - Cut feature X from scope (engineering cost > user impact)
> - Hire one more backend engineer (approved by VP)
>
> Action items:
> - Sarah: Q2 report by Friday
> - ...

**Active shifts:**
- Retrieved user's communication preferences before writing
- Applied "conclusion first, concise" preference
- No trailing filler paragraph
- Cross-domain inference: conciseness preference from code context applied to writing

---

## Scenario 3: Complex Debugging (Learning from Failure)

**User:** The staging deploy is failing. Fix it.

### Before (Default Mode)

> Let me look at the deploy logs...
> *[Reads logs, tries fix A — fails]*
> *[Tries fix B — fails]*
> *[Reads more carefully, finds the actual issue: Docker image built on ARM, ECS runs AMD64]*
> *[Fixes with --platform linux/amd64]*
>
> Fixed! The issue was a platform mismatch. Added `--platform linux/amd64` to the Dockerfile.

**Problems:**
- Took 3 attempts to find root cause
- Solution not persisted — will be rediscovered next time
- No structured reflection on what happened

### After (With Experiential Learning)

> *[Calls recall("staging deploy ECS Docker")]*
> *[No prior knowledge found]*
>
> No prior knowledge about this deploy setup. Let me investigate from scratch...
> *[Same debugging process — finds ARM/AMD64 mismatch]*
>
> Fixed! Now let me save what I learned.
>
> *[Calls learn with structured summary:]*
> Goal: Fix staging deploy failure
> Approach: Checked logs → tried restarting task (failed) → tried force new deployment (failed) → read error carefully, found "exec format error" indicating architecture mismatch
> Outcome: Added --platform linux/amd64 to Dockerfile, deploy succeeded
> Learnings: "exec format error" on ECS = Docker image built on wrong architecture (ARM vs AMD64)
> Errors: First two attempts were generic fixes without reading the error message carefully
>
> *[Review engine extracts and saves:]*
> *[fact: "ECS exec format error = Docker image architecture mismatch (ARM vs AMD64), fix with --platform linux/amd64"]*
> *[fact: "staging deploy uses ECS on AMD64 architecture"]*

**Active shifts:**
- Searched before starting (found nothing, but tried)
- After resolution: structured review with specific learnings
- Persisted the root cause pattern so next "exec format error" is instantly recognized
- Next time someone hits this, recall will find it immediately
