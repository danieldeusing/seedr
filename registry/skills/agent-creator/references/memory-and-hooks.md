# Persistent Memory & Hooks Integration

## Persistent Memory

Normally agents start from scratch every session. Persistent memory gives an agent a dedicated folder with a `MEMORY.md` file that survives between sessions. At startup, the first 200 lines are auto-injected into context. At finish, the agent writes learnings back.

### Enabling Memory

Add one field to frontmatter. The value decides where the folder is created:

| Value | Location | Shareable | Best for |
|-------|----------|-----------|----------|
| `memory: user` | `~/.claude/agent-memory/<name>/` | No (personal) | Personal style preferences, general patterns across all projects. **Recommended default.** |
| `memory: project` | `.claude/agent-memory/<name>/` | Yes (Git) | Project-specific conventions the whole team should benefit from |
| `memory: local` | `.claude/agent-memory-local/<name>/` | No (gitignored) | Personal notes about a specific project (local env quirks) |

### Lifecycle (step by step)

1. **Load** — Claude Code reads first 200 lines of `MEMORY.md` and injects into agent's system prompt before it starts working. If <200 lines, entire file loaded. If >200, rest exists on disk but not in context.
2. **Work** — Agent does its job, naturally observing codebase patterns, naming conventions, preferred libraries, error handling styles.
3. **Save** — Agent writes new learnings back to `MEMORY.md` using auto-enabled Read/Write/Edit tools. Quality depends on your agent prompt — tell it *what* to remember and *how* to organize it.
4. **Repeat** — Each session the file grows. After 5 sessions ~40 lines, after 20 sessions ~120 lines.
5. **Curate** — When file exceeds 200 lines, Claude Code instructs the agent to curate: merge similar entries, remove outdated info, summarize verbose notes. Automatic — you don't trigger it.

### Auto-Enabled Tools

When `memory` is set, Read, Write, and Edit are automatically enabled for the memory folder — even if `tools` doesn't list them. A read-only agent with `tools: [Read, Grep, Glob]` can still write to its memory folder. Access is scoped to the memory folder only.

### Extra Files

The agent can create additional files in its memory folder (e.g., `patterns.json`). But only `MEMORY.md` is auto-loaded. Instruct the agent in the prompt to Read extra files at session start if needed.

### Memory Prompt Instructions

Tell the agent what to remember. Without explicit instructions, it may save nothing useful.

Good prompt instruction example:
> "Before finishing, open your MEMORY.md. Add any new patterns, conventions, or preferences you discovered during this session. Remove entries that are no longer accurate. Organize under clear headings: ## Formatting, ## Error Handling, ## Testing, etc. Keep the file under 200 lines by summarizing older entries."

### When to Use Memory

**Use when:**
- Agent runs repeatedly across many sessions (reviewer, test writer, auditor)
- Knowledge is discovered from code/feedback, not written upfront
- Personalization beyond project rules (how you like feedback formatted)

**Don't use when:**
- Rules you already know — put those in CLAUDE.md or `.claude/rules/` (loaded into ALL sessions, not just one agent)
- One-off agents (migration, cleanup) — adds overhead for no future payoff
- Replacing project context — memory is per-agent, not global

### Memory vs CLAUDE.md

| | CLAUDE.md / .claude/rules/ | Agent Memory |
|---|---|---|
| Written by | You | The agent |
| Loaded for | Every session + all agents | Only that specific agent |
| Best for | Known upfront rules | Discovered expertise over time |
| Maintained by | You (version-controlled) | The agent (auto-curated) |

They complement each other: CLAUDE.md sets baseline rules, memory adds personalized expertise on top.

---

## Agent-Scoped Hooks

Hooks are automated scripts that fire at specific moments during an agent's execution. Defined in the agent's frontmatter.

### Hook Types

| Hook | When | Use |
|------|------|-----|
| `PreToolUse` | Before a tool runs | Validate, guard, or block. Return `{"decision":"block"}` to prevent. |
| `PostToolUse` | After a tool finishes | Run linters, format code, trigger tests. Use `matcher` to target specific tools. |
| `Stop` | Once when agent finishes | Final cleanup, validation, notifications. |

### Frontmatter Syntax

```yaml
---
name: code-writer
tools: [Read, Write, Glob, Grep]
hooks:
  PostToolUse:
    - matcher: Write
      command: npx eslint --fix $TOOL_INPUT_FILE_PATH
---
```

Environment variables available in hook commands:
- `$TOOL_INPUT_FILE_PATH` — the file path from the tool input
- `$TOOL_INPUT_*` — other tool input fields

### Project-Level Agent Hooks

Defined in `.claude/settings.json`, these fire for ALL agents:

| Hook | When |
|------|------|
| `SubagentStart` | Any agent starts — set up resources, logging |
| `SubagentStop` | Any agent stops — cleanup, reports, notifications |

## Skills Preloading

Skills are NOT inherited from the parent conversation. List them explicitly:

```yaml
---
name: security-auditor
tools: [Read, Grep, Glob]
skills:
  - owasp-top-10
  - api-security-rules
---
```

Both skills are injected into the agent's context at startup. The full skill content is loaded, not just made available for invocation.
