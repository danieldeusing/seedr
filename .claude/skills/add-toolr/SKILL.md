---
name: add-toolr
description: |
  Add new content (skills, hooks, agents, plugins, MCP servers, settings, commands) to the seedr registry.
  Trigger on: "/add-toolr <path>", "add toolr item", "register this hook/skill/agent/plugin/mcp/settings".
  Accepts a filesystem path, auto-detects the content type from path segments, asks clarifying
  questions (scope, compatibility, name, description), copies content into registry/, and updates
  registry/manifest.json. For toolr-sourced items only.
---

# Add Toolr Item

Add a new item to the seedr registry from a local filesystem path.

## Workflow

### 1. Parse the argument

Extract `<path>` from the user's input (e.g. `/add-toolr /Users/daniel/whatever/.claude/hooks/abc`).
Verify the path exists (file or directory) using Bash `ls` or Read.

### 2. Detect content type

Infer `ComponentType` from the path. Use the **deepest matching** segment:

| Path contains | Type |
|---|---|
| `/skills/` or file named `SKILL.md` | `skill` |
| `/hooks/` | `hook` |
| `/agents/` | `agent` |
| `/plugins/` or `.claude-plugin/` | `plugin` |
| `/mcp/` or `.mcp.json` | `mcp` |
| `/settings/` or `settings.json` | `settings` |
| `/commands/` | `command` |

If ambiguous, ask the user with AskUserQuestion.

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
        description: "Compatible with claude, copilot, gemini, opencode, and codex"
      - label: "claude"
        description: "Anthropic Claude Code"
      - label: "copilot"
        description: "GitHub Copilot"
      - label: "gemini"
        description: "Google Gemini CLI"
      - label: "opencode"
        description: "OpenCode CLI"
      - label: "codex"
        description: "OpenAI Codex CLI"
```

Notes:
- If the user selects "All", expand to `["claude", "copilot", "gemini", "opencode", "codex"]` in the compatibility array.
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

### 6. Copy content to registry

Based on the detected type:

- **skill**: Copy directory to `registry/skills/<slug>/`. Expect a `SKILL.md` inside.
- **hook**: Copy the `.sh` script file to `registry/hooks/<slug>/`.
- **agent**: Copy `.md` file to `registry/agents/<slug>/`.
- **plugin**: Copy directory to `registry/plugins/<slug>/`.
- **mcp**: Copy config to `registry/mcp/<slug>/`.
- **settings**: Copy config to `registry/settings/<slug>/`.
- **command**: Copy to `registry/commands/<slug>/`.

Create the target directory if it doesn't exist. Use `cp -r` for directories, `cp` for files.

### 7. Build file tree for manifest

After copying, build a `FileTreeNode[]` from the copied content. Walk the directory recursively:

```
FileTreeNode = { name: string, type: "file" | "directory", children?: FileTreeNode[] }
```

Use `find <dir> | sort` and parse the output to build the tree.

### 8. Write item.json and compile manifest

Write the item metadata as `registry/<type>s/<slug>/item.json`:

```json
{
  "slug": "<slug>",
  "name": "<name from user>",
  "type": "<detected type>",
  "description": "<short description>",
  "longDescription": "<detailed description>",
  "compatibility": ["<from user answers>"],
  "sourceType": "toolr",
  "author": { "name": "Toolr Suite", "url": "https://github.com/toolr-suite" },
  "externalUrl": "https://github.com/danieldeusing/seedr/tree/main/registry/<type>s/<slug>",
  "updatedAt": "<current ISO 8601 date>",
  "contents": { "files": [<file tree>] }
}
```

If the user chose a specific scope (not "No scope"), also include `"targetScope": "<scope>"` in the item.
```

**For plugins**, extract content arrays from the file tree into `contents`. Scan root-level and `.claude/` subdirectories:

- `skills/` → list `.md` filenames (without extension), or directory names if skills are dirs (e.g. `skills/foo/SKILL.md` → `"foo"`)
- `agents/` → same as skills (`.md` files or directory names)
- `commands/` → same as skills (`.md` files or directory names)
- `hooks/` → if `hooks.json` exists, read it and use its trigger keys (`SessionStart`, `PreToolUse`, etc.) as the hooks array. Otherwise list script filenames (ignore `__init__.py`, test files)
- `mcp-servers/` → list all file/directory names (strip extensions)
- Root-level `.mcp.json` → read the file, extract top-level keys as MCP server names. Handles both flat format (`{ "name": {...} }`) and wrapped format (`{ "mcpServers": { "name": {...} } }`)

Only include arrays that have items. Example:

```json
{
  "contents": {
    "skills": ["my-skill"],
    "hooks": ["pre-commit.sh"],
    "mcpServers": ["my-server"],
    "files": [<file tree>]
  }
}
```

**For hooks** (standalone hook type, not plugin), also include triggers in the `contents` object:

```json
{
  "contents": {
    "files": [{ "name": "my-hook.sh", "type": "file" }],
    "triggers": [
      { "event": "PreToolUse", "matcher": "Bash" },
      { "event": "PreToolUse", "matcher": "Write" }
    ]
  }
}
```

Write with `JSON.stringify(item, null, 2) + "\n"`.

Then recompile the manifest:
```bash
npx tsx scripts/compile-manifest.ts
```

### 9. Confirm

Print a summary:
- Type, slug, name
- Path copied to
- `item.json` written and manifest compiled
- Remind user to commit and push

## Important notes

- `sourceType` is always `"toolr"` — this skill is for manually-maintained items only
- The sync script (`pnpm sync`) preserves toolr items and only replaces synced items
- If `registry/<type>s/<slug>/item.json` already exists, warn the user and ask whether to update or abort
- For skills, validate that a `SKILL.md` exists in the source directory
- `featured` defaults to `false` — do not set it unless the user asks
