---
name: add-seedr
description: |
  Add new content (skills, hooks, agents, plugins, MCP servers, settings, commands) to the seedr registry.
  Trigger on: "/add-seedr <path>", "add seedr item", "register this hook/skill/agent/plugin/mcp/settings".
  Accepts a filesystem path, auto-detects the content type from path segments, asks clarifying
  questions (scope, compatibility, name, description), derives author and externalUrl from the
  repo, and adds the item through the operations CLI (scripts/registry-op.ts), which copies the
  content, writes item.json and recompiles the manifests in one transaction. First-party items only.
---

# Add Seedr Item

Add a new item to the seedr registry from a local filesystem path.

## Workflow

### 1. Parse the argument

Extract `<path>` from the user's input (e.g. `/add-seedr /Users/daniel/whatever/.claude/hooks/abc`).
Verify the path exists (file or directory) using Bash `ls` or Read.

### 2. Detect content type

Infer `ComponentType` from the path. Use the **deepest matching** segment:

| Path contains | Type |
|---|---|
| `/skills/` or file named `SKILL.md` | `skill` |
| `/hooks/` | `hook` |
| `/agents/` | `agent` |
| `/plugins/` or `.claude-plugin/` | `plugin` — but see the note below |
| `/mcp/` or `.mcp.json` | `mcp` |
| `/settings/` or `settings.json` | `settings` |
| `/commands/` | `command` |

If ambiguous, ask the user with AskUserQuestion.

**A first-party item cannot be a plugin.** The operation refuses `type: "plugin"`
on a `seedr` item, because a plugin resolves through a marketplace and the
registry is not one — it would install and the agent would then report it
orphaned. When a source folder carries `.claude-plugin/`, add its contents as
their own items instead: the `skills/` become skill items, standing instructions
become `rule` items, and both install on all five agents where a plugin is
Claude-shaped packaging. Use `/add-community` for a plugin that genuinely lives
in someone else's repository.

### 3. Derive a default slug

From the path's final meaningful segment (directory name or filename without extension), kebab-case it.
Example: `/Users/daniel/whatever/.claude/hooks/pre-commit-lint` -> slug `pre-commit-lint`.

### 4. Ask clarifying questions

Use AskUserQuestion to collect metadata. Ask in batches to minimize round-trips.

**Batch 1 — Identity & scope:**

```
questions:
  - question: "What name should this <type> have in the registry?"
    header: "Name"
    options:
      - label: "<auto-derived name>"  # Title-cased from slug
        description: "Auto-derived from the path"
      - label: "Custom name"
        description: "Enter a custom display name"

  - question: "What scope should this install to?"
    header: "Scope"
    options:
      - label: "No scope (Recommended)"
        description: "No default scope — the user chooses at install time"
      - label: "project"
        description: "Default to project directory"
      - label: "user"
        description: "Default to user's home config"
      - label: "local"
        description: "Default to .local config (Claude only)"

  - question: "Which AI tools is this compatible with?"
    header: "Compat"
    multiSelect: true
    options:
      - label: "All"
        description: "Compatible with claude, copilot, antigravity, opencode, and codex"
      - label: "claude"
        description: "Anthropic Claude Code"
      - label: "copilot"
        description: "GitHub Copilot"
      - label: "antigravity"
        description: "Google Antigravity (formerly Gemini; `gemini` is a deprecated alias)"
      - label: "opencode"
        description: "OpenCode CLI"
      - label: "codex"
        description: "OpenAI Codex CLI"
```

Notes:
- If the user selects "All", pass `["claude", "copilot", "antigravity", "opencode", "codex"]` as the compatibility array. Pass canonical ids only; the operation itself stores the B1 vocabulary (`antigravity` is written as `gemini` until the published CLI understands it — `STORAGE_ALIASES` in `packages/registry-ops/src/agents.ts` is the one flip point, emptied when `scripts/migrate-agent-ids.ts` runs).
- For hooks, agents, settings, and commands, default compatibility to `["claude"]` only since those types are Claude-specific. Pre-select accordingly.

**Batch 2 — Descriptions:**

After the user answers batch 1, read ALL source content (SKILL.md, hook scripts, plugin.json, agent .md files, etc.) to deeply understand what the item does. Then write TWO descriptions:

1. **`description`** — answers "What does this do?"
2. **`longDescription`** — answers "Should I install this?"

**`description` rules:**

A single sentence that tells the user what the item does.

- One clear sentence — naturally short because it focuses on the core capability
- Lead with what it *does*, not what it *is* ("Analyze code for 23 classic code smells" not "A code analysis tool")
- No trigger instructions ("Use when..."), no title restatements ("X plugin for Claude")
- Must work at a glance in a list view — users scan, they don't read

**`longDescription` rules:**

Implementation-level detail that tells the user exactly what they're getting — specific files, component names, agent roles, and concrete counts. Uses **structured markdown** — the TL;DR section renders bold, inline code, and bullet lists.

- **Lead sentence**: Summarize what's included at a glance (counts, component types)
- **Bullet list**: When listing **3+ items** of the same kind (agents, categories, scripts), use a markdown bullet list with **bold category names** (e.g., `- **Code reviewers** (15): Rails, TypeScript, ...`)
- **No bullets for simple items**: If the item has only 1-2 components, keep it as prose
- Name specific files, scripts, agents, and commands by name — not vague categories
- Include exact counts: number of patterns, rules, themes, agents, commands, skills
- **Bold** counts and category names for scannability (e.g., `**29 agents**`, `**Bloaters** (5)`)
- **Backticks** for file names, paths, commands, code identifiers (e.g., `` `recalc.py` ``, `` `/hookify` ``). Do NOT backtick brand names (React), pattern names (Factory Method), or role names (code reviewer)
- No filler, no marketing speak — just the implementation facts
- Typically 50-90 words. The pre-commit hook enforces a minimum of 30 words.

**Examples of good longDescriptions:**

Complex package (bullets):
```
Ships **29 agents**, **22 commands**, **19 skills**, and a `context7` MCP server.

- **Code reviewers** (15): Rails, TypeScript, Python, security, performance, architecture, data integrity
- **Research agents** (5): best practices, framework docs, git history
- **Workflow agents** (5): bug reproduction, PR resolution, linting
- **Commands**: `/workflows:` suite (`plan`, `review`, `work`, `compound`, `brainstorm`)
```

Skill with categories (bullets):
```
Detects all **23 classic code smells** from Martin Fowler's catalog across 5 categories:

- **Bloaters** (5): Long Method, Large Class, Primitive Obsession, Long Parameter List, Data Clumps
- **OO Abusers** (4): Switch Statements, Temporary Field, Refused Bequest, Alternative Classes
- **Couplers** (5): Feature Envy, Inappropriate Intimacy, Message Chains, Middle Man

Each smell includes detection heuristics, `file:line` locations, and the fix. Language-agnostic.
```

Simple wrapper (prose):
```
Connects via Slack MCP server to search messages, list channels, read threads, and pull conversation history into context. No local server to install — authenticates through Slack's OAuth flow.
```

**Examples of bad longDescriptions:**

- "Covers all 23 GoF patterns with implementation examples and common pitfalls." (too vague — doesn't name patterns, files, or approach)
- "Provides tools for working with spreadsheets." (says nothing about what tools or how)
- "A comprehensive toolkit for code analysis." (marketing speak, no specifics)

Then present both descriptions to the user:

```
questions:
  - question: "Use these descriptions?\n\nShort: '<description>'\n\nDetailed: '<longDescription>'"
    header: "Description"
    options:
      - label: "Yes, use them"
        description: "Accept both descriptions"
      - label: "Edit them"
        description: "Provide your own descriptions"
```

### 5. For hooks: Extract triggers from settings

If the detected type is `hook` and the path points to a `.sh` script file:

1. Find the parent `.claude/` directory from the script path
2. Read both `settings.json` and `settings.local.json` in that directory
3. Search the `hooks` object for entries that reference this script file
4. Extract all triggers (event + matcher combinations)

Example settings.json structure:
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": ".claude/hooks/my-hook.sh" }] },
      { "matcher": "Write", "hooks": [{ "type": "command", "command": ".claude/hooks/my-hook.sh" }] }
    ]
  }
}
```

From this, extract triggers:
```json
[
  { "event": "PreToolUse", "matcher": "Bash" },
  { "event": "PreToolUse", "matcher": "Write" }
]
```

Match the script by comparing the filename at the end of the command path.

### 6. Derive the item's provenance from the repo

Never write an author or `externalUrl` from memory — a fork must attribute items to its own
owner. Ask the repo:

```bash
npx tsx scripts/registry-op.ts identity
```

It prints `owner`, `repo`, `defaultBranch`, `authorName` (from `git config user.name`) and an
`externalUrlTemplate`, each `null` when git cannot vouch for it. Then confirm with AskUserQuestion:

```
questions:
  - question: "Attribute this item to '<authorName>' (https://github.com/<owner>)?"
    header: "Author"
    options:
      - label: "Yes"
        description: "Use the name and profile derived from this repository"
      - label: "Custom author"
        description: "Enter a different name and optional URL"
```

`externalUrl` is `https://github.com/<owner>/<repo>/tree/<defaultBranch>/registry/<type dir>/<slug>`
when all three parts were derived; **omit it otherwise** rather than guessing. The type
directory is the plural of the type except `mcp` and `settings`, which stay as they are.

### 7. Check for a collision

```bash
npx tsx scripts/registry-op.ts list <type>
```

If an entry with this `slug` exists under this type, stop and tell the user: the operation
refuses collisions by design. Changing an existing item is `/update-item`; replacing it is
`/remove-seedr` followed by this skill. The same slug under a *different* type is fine —
`(type, slug)` is the key.

### 8. Add through the operations CLI

Write the operation to a temporary file (use the Write tool; any path outside the repo, e.g. the
OS temp directory):

```json
{
  "v": 1,
  "kind": "add-local",
  "type": "<detected type>",
  "slug": "<slug>",
  "sourcePath": "<absolute path from step 1>",
  "name": "<name from user>",
  "description": "<short description>",
  "longDescription": "<detailed description>",
  "compatibility": ["<from user answers>"],
  "author": { "name": "<confirmed name>", "url": "<confirmed url, if any>" },
  "externalUrl": "<from step 6, or omit>",
  "targetScope": "<scope, only if the user chose one>",
  "triggers": [{ "event": "PreToolUse", "matcher": "Bash" }]
}
```

`triggers` only for hooks (from step 5); omit it otherwise. Then run:

```bash
npx tsx scripts/registry-op.ts run --op <path-to-that-file>
```

The transaction copies the source into `registry/<type dir>/<slug>/` (a directory whole, a
single file into the directory), derives the file tree, writes `item.json` with
`sourceType: "seedr"` and today's date, recompiles the manifests, and verifies that only the
item's paths and the manifests changed — rolling back on any failure. It validates the item in
full before copying: a `longDescription` under 30 words or without backticks is refused here,
not at commit time. Fix the draft and run again; never bypass it.

**If it refuses because the worktree is dirty:** tell the user to commit or stash their other
changes first. Do not work around this.

### 9. Confirm

Print a summary from the result JSON:
- Type, slug, name
- `changedPaths`
- Remind the user to review `git status` and commit

## Important notes

- `sourceType` is always `"seedr"` for these items — the transaction writes it; never set it yourself
- The sync script (`pnpm sync`) preserves first-party items and only replaces synced items
- Never `cp`, `mkdir` or write `item.json` yourself, and never run `pnpm compile` separately:
  the transaction does all of it and undoes all of it on failure
- For skills, validate that a `SKILL.md` exists in the source directory before step 6
- `featured` defaults to `false` — do not set it unless the user asks
