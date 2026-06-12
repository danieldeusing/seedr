---
name: reflection
description: >
  Post-session reflection and learning capture. Analyzes conversation history to
  identify mistakes, misunderstandings, wasted iterations, communication friction,
  and valuable learnings — then persists them to Claude Code's memory system.
  Use this skill after ANY coding session, when the user says "/reflection",
  at session end via Stop hook, or when the user mentions "what did we learn",
  "session review", "reflect on this session", "what went wrong", or wants to
  capture learnings. Also trigger when the development workflow reaches step 5
  (reflection). This skill should run even for smooth sessions — capturing what
  worked well is valuable too.
---

# Session Reflection

Analyze the current conversation to extract learnings that will make future sessions better, then persist them to memory.

## Detect mode

Check how you were invoked:

- **Manual** — the user typed `/reflection` or asked for reflection explicitly. Present findings first, ask for confirmation, then save.
- **Autonomous** — invoked by a Stop hook, or the user said to run autonomously. Save directly, show a 3-5 line summary.

If unclear, default to manual mode.

## Step 1: Analyze the conversation

Work with whatever context you have — full history or post-compact summary. Scan for these signals:

### Problems (high value — prevent repeating mistakes)

| Signal | What to look for | What to save |
|--------|-----------------|-------------|
| Bug → Fix cycle | Code written then corrected | WHY the bug happened (wrong assumption? missed context? rushed?) |
| Multiple iterations | 3+ attempts at the same thing | Root cause of the churn |
| Misunderstanding | Agent did X when user meant Y | What was ambiguous, how to communicate clearer |
| Wrong direction | Approach started then abandoned | What early signal was missed |
| Communication friction | User repeated themselves, gave terse corrections, showed frustration | The pattern that caused friction |
| Ambiguity not resolved | Request had multiple interpretations, agent picked the wrong one | The ambiguity pattern and how to detect it earlier |
| Test failures | Unexpected test failures requiring debugging | What assumption was wrong |
| Overlooked context | Missed existing code, conventions, or constraints | Where the agent should have looked |

**Communication and ambiguity patterns deserve special attention.** These are often the highest-value learnings because they compound across projects. When a misunderstanding or ambiguity caused wasted work, always consider whether the pattern is project-specific (save to project memory) or a general communication habit (save to home memory as its own dedicated entry — don't fold it into a technical learning).

### Positives (reinforce good patterns)

| Signal | What to save |
|--------|-------------|
| First-try success on something non-trivial | What approach/preparation made it work |
| Efficient communication | The pattern that helped (e.g., user gave good context, agent asked right question) |
| Architectural decision | The decision and its rationale, if non-obvious |

### What to skip

- Trivial fixes (typos, imports, formatting)
- Code patterns you can derive by reading the codebase
- Architecture already documented in CLAUDE.md or code — this includes codebase structure facts like "crate X is a library, crate Y is a binary" or "module A provides infrastructure that module B uses." If reading the code would reveal it, don't save it.
- Things already captured in existing memory files
- The specific WHAT of code changes — focus on the WHY and how to avoid/repeat

## Step 2: Check for recurring patterns (bounded)

Only do this if Step 1 found notable problems. Skip entirely for smooth sessions.

1. Read the MEMORY.md index in the project memory directory to check for existing related memories
2. Glob for recent session summary files (last 3-5) and scan their contents for similar issues
3. If the same pattern appears 3+ times across sessions, flag it as needing a **permanent rule** in `.claude/rules/` rather than just a memory entry — mention this in your report

Keep this step fast — read file listings and summaries, not full session transcripts.

## Step 3: Route each learning

Each learning goes to one of two places based on scope:

**Project memory** — learnings specific to this codebase, tools, or project
- Path: the project's auto-memory directory (the one loaded in your system context)
- Types: `feedback` (approach corrections for this project), `project` (decisions, context, bugs)
- Example: "manufaktur's orchard crate wraps a flaky API — add retries"

**Home memory** — learnings that apply to ANY project with this user
- Path: `~/.claude/memory/` (create if it doesn't exist)
- Types: `user` (working style, preferences), `feedback` (communication patterns)
- Example: "Daniel prefers terse responses — skip trailing summaries"

**Routing rule:** Would this learning change your behavior in a completely different project? → home memory. Only relevant to this codebase? → project memory.

## Step 4: Write memories

For each learning, create a markdown file:

```markdown
---
name: short-descriptive-name
description: One line — specific enough to judge relevance when scanning the index
type: feedback|project|user
---

The learning itself — one clear statement.

**Why:** What happened that led to this learning.
**How to apply:** When and how this should change future behavior.
```

### Before writing, deduplicate:
1. Read `MEMORY.md` in the target memory directory (if it exists)
2. If a related memory exists, read it and UPDATE rather than creating a duplicate
3. If merging, keep the file concise — combine, don't append

### File naming
Use `{type}_{topic}.md` kebab-case, e.g.:
- `feedback_prefer-real-db-tests.md`
- `project_orchard-retry-needed.md`
- `user_prefers-terse-responses.md`

### Update MEMORY.md
After writing files, update (or create) `MEMORY.md` in the target directory. One entry per line, under 150 chars:
```
- [Title](filename.md) — one-line hook
```
Keep MEMORY.md under 200 lines. No frontmatter in MEMORY.md — it's a plain index.

## Step 5: Report

### Manual mode — present BEFORE saving:

```
## Session Reflection

### Problems identified
- **[Bug→Fix]** description → saves as `feedback` to project memory
- **[Misunderstanding]** description → saves as `feedback` to home memory

### Positive patterns
- **[First-try success]** description → saves as `project` to project memory

### Recurring patterns
- ⚠️ "description" seen 3+ times → recommend adding rule to .claude/rules/

Save these? Anything to adjust?
```

Wait for user confirmation. Apply their changes before writing.

### Autonomous mode — save, then summarize:

```
📝 Reflection: saved N memories
- [feedback] description (→ project)
- [user] description (→ home)
```

## Quality bar

- A typical session yields 0-3 learnings. Zero is fine for smooth sessions.
- More than 5 learnings from one session is suspicious — you're probably over-generating. Be more selective.
- Each memory file must be under 30 lines.
- The entire reflection should complete in under a minute — analyze conversation, write files, done. No codebase exploration, no test runs.
- One mediocre memory is worse than no memory — it adds noise to every future session.
