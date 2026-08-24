---
name: add-community
description: |
  Add a community GitHub repository to the seedr registry.
  Trigger on: "/add-community <github-url>", "add community repo", "register community plugin/skill".
  Accepts a GitHub repo URL, fetches metadata via GitHub API (plugin.json or SKILL.md),
  detects content type, builds a file tree, asks clarifying questions, and adds the item through
  the operations CLI (scripts/registry-op.ts) in one transaction. No content copy — uses
  externalUrl for install-time fetching.
---

# Add Community

Add a community GitHub repository to the seedr registry.

## Workflow

### 1. Parse the GitHub URL

Extract `owner/repo` from the URL. Accepted formats:
- `https://github.com/owner/repo`
- `https://github.com/owner/repo/tree/main/subpath` (for items nested in a repo)
- `owner/repo` (shorthand)

Normalize to `owner` and `repo` variables. If a subpath is present, store it as `basePath` (default: repo root).

### 2. Detect content type via GitHub API

Use `gh api` to inspect the repo. Check in this order:

**Marketplace** (repos containing multiple plugins):
```bash
gh api repos/{owner}/{repo}/contents/{basePath}/.claude-plugin/marketplace.json --jq '.content | @base64d'
```
If `.claude-plugin/marketplace.json` exists, this is a **marketplace**. Parse the JSON and proceed to **step 2a** below.

**Plugin** (most common for full repos):
```bash
gh api repos/{owner}/{repo}/contents/{basePath}/.claude-plugin/plugin.json --jq '.content | @base64d'
```
If `.claude-plugin/plugin.json` exists, this is a **plugin**. Parse the JSON for metadata.

**Skill** (for single-skill repos or subpath pointing to a skill):
```bash
gh api repos/{owner}/{repo}/contents/{basePath}/SKILL.md --jq '.content | @base64d'
```
If `SKILL.md` exists, this is a **skill**. Parse YAML frontmatter for name/description.

**Ambiguous**: If neither is found, ask the user with AskUserQuestion what type it is.

### 2a. Marketplace handling

When a marketplace is detected, each sub-plugin is added as a **separate registry item**. Do NOT create a single item for the marketplace root — the root-level files (CLAUDE.md, .claude/, etc.) are marketplace development files, not a plugin.

**marketplace.json format:**
```json
{
  "name": "marketplace-name",
  "plugins": [
    {
      "name": "plugin-a",
      "description": "...",
      "author": { "name": "..." },
      "source": "./plugins/plugin-a"
    },
    {
      "name": "plugin-b",
      "description": "...",
      "author": { "name": "..." },
      "source": "./plugins/plugin-b"
    }
  ]
}
```

**Processing each sub-plugin:**

1. Parse `marketplace.json` — extract the `plugins` array
2. Tell the user: "This is a marketplace with N plugins:" followed by each plugin's name and description from marketplace.json
3. Ask: "Add all N plugins?" (Yes/Select specific ones)
4. For each selected plugin:
   a. Resolve `source` path relative to basePath (e.g., `./plugins/foo` → `plugins/foo`)
   b. Set the sub-plugin's `basePath` to this resolved path
   c. Derive `slug` from the directory name (last segment of source path, e.g., `plugins/foo` → `foo`)
   d. Fetch metadata from the sub-plugin's own `.claude-plugin/plugin.json`:
      ```bash
      gh api repos/{owner}/{repo}/contents/{basePath}/{source}/.claude-plugin/plugin.json --jq '.content | @base64d'
      ```
   e. Set `externalUrl` to `https://github.com/{owner}/{repo}/tree/main/{resolved-source-path}`
   f. Proceed with steps 3–8 for this sub-plugin (file tree, dates, classification, descriptions, write item.json)
5. After all sub-plugins are processed, compile manifest once:
   ```bash
   npx tsx scripts/compile-manifest.ts
   ```

**Important marketplace notes:**
- Each sub-plugin gets its own `item.json` in `registry/plugins/{slug}/`
- Each has its own `externalUrl` pointing to the sub-plugin subdirectory, NOT the marketplace root
- Compatibility questions can be asked once and shared across all sub-plugins (plugins are typically `["claude"]`)
- Description questions (step 6) must be asked per-plugin — each has different content
- The community sync script (`community.ts`) refreshes each sub-plugin independently via its `externalUrl`

### 3. Extract metadata

**From plugin.json:**
```json
{
  "name": "...",
  "description": "...",
  "author": { "name": "...", "url": "..." }
}
```

**From SKILL.md frontmatter:**
```yaml
---
name: ...
description: ...
---
```

Derive `slug` from the repo name (kebab-cased). For subpath items, use the last path segment.

### 4. Build file tree

Fetch the repo's directory structure via GitHub API:
```bash
gh api repos/{owner}/{repo}/contents/{basePath} --jq '.[].name'
```

Recursively build `FileTreeNode[]` (max depth 6). For each entry:
- If `type == "dir"`, recurse into it and add as `{ name, type: "directory", children: [...] }`
- If `type == "file"`, add as `{ name, type: "file" }`

For plugins, also parse the tree to populate `PluginContents`:
- `skills/` directory → list `.md` files as `contents.skills`
- `agents/` directory → list `.md` files as `contents.agents`
- `hooks/` directory → if `hooks.json` exists, fetch it and use trigger keys (`SessionStart`, `PreToolUse`, etc.) as `contents.hooks`
- `commands/` directory → list `.md` files as `contents.commands`
- `mcp-servers/` or `mcp-configs/` → list as `contents.mcpServers`
- Root-level `.mcp.json` → fetch it and extract top-level keys as MCP server names. Handles flat (`{ "name": {...} }`) and wrapped (`{ "mcpServers": { "name": {...} } }`) formats

### 5. Fetch last commit date

```bash
gh api repos/{owner}/{repo}/commits?per_page=1 --jq '.[0].commit.committer.date'
```

### 6. Ask clarifying questions

Use AskUserQuestion. Pre-fill from detected metadata.

**Batch 1 — Identity & compatibility:**

```
questions:
  - question: "Name for registry: '<auto-detected name>'?"
    header: "Name"
    options:
      - label: "<detected name> (Recommended)"
        description: "From plugin.json / SKILL.md"
      - label: "Custom name"
        description: "Enter your own name"

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
- If the user selects "All", expand to `["claude", "copilot", "antigravity", "opencode", "codex"]` in the compatibility array. Never write `gemini` into new items — it is only accepted as an alias of `antigravity` until the data migration (`scripts/migrate-agent-ids.ts`) removes it.
- Plugins are generally Claude-only (`["claude"]`), since `.claude-plugin` is a Claude concept.
- Skills may be multi-tool compatible.
- Only include `targetScope` in the item if the user chose a specific scope (not "No scope").

**Batch 2 — Descriptions:**

Do NOT blindly use the description from plugin.json or SKILL.md frontmatter. Instead, read the actual content files (README.md, SKILL.md body, plugin skills/agents) to understand what the item *really* does, then write TWO descriptions:

1. **`description`** — answers "What does this do?"
2. **`longDescription`** — answers "Should I install this?"

**`description` rules:**

A single sentence that tells the user what the item does.

- One clear sentence — naturally short because it focuses on the core capability
- Lead with what it *does*, not what it *is* ("Manage GitLab repos, MRs, and CI/CD pipelines from Claude Code" not "GitLab DevOps platform integration")
- No trigger instructions ("Use when..."), no title restatements ("X plugin for Claude")
- For well-known tools (GitHub, Slack, Linear, etc.): focus on what the integration *enables*, not what the tool itself is
- Must work at a glance in a list view — users scan, they don't read

**`longDescription` rules:**

Implementation-level detail that tells the user exactly what they're getting — specific files, component names, agent roles, and concrete counts. Uses **structured markdown** — the TL;DR section renders bold, inline code, and bullet lists.

- **Lead sentence**: Summarize what's included at a glance (counts, component types)
- **Bullet list**: When listing **3+ items** of the same kind (agents, categories, scripts), use a markdown bullet list with **bold category names** (e.g., `- **Code reviewers** (15): Rails, TypeScript, ...`)
- **No bullets for simple items**: If the item has only 1-2 components, keep it as prose
- Name specific skills, agents, commands, MCP servers, and hooks by name — not vague categories
- Include exact counts: number of skills, agents, commands, rules, techniques
- **Bold** counts and category names for scannability (e.g., `**29 agents**`, `**Bloaters** (5)`)
- **Backticks** for file names, paths, commands, code identifiers (e.g., `` `/hookify` ``, `` `context7` ``). Do NOT backtick brand names (React), pattern names (Factory Method), or role names (code reviewer)
- No filler, no marketing speak — just the implementation facts
- Typically 40-90 words. The pre-commit hook enforces a minimum of 30 words.

**Examples of good longDescriptions:**

Complex package (bullets):
```
Ships **29 agents**, **22 commands**, **19 skills**, and a `context7` MCP server.

- **Code reviewers** (15): Rails, TypeScript, Python, security, performance, architecture, data integrity
- **Research agents** (5): best practices, framework docs, git history
- **Workflow agents** (5): bug reproduction, PR resolution, linting
- **Commands**: `/workflows:` suite (`plan`, `review`, `work`, `compound`, `brainstorm`)
```

Simple wrapper (prose):
```
Connects via Slack MCP server to search messages, list channels, read threads, and pull conversation history into context. No local server to install — authenticates through Slack's OAuth flow.
```

**Examples of bad longDescriptions:**

- "Find prior decisions and relevant conversations without leaving Claude Code." (too vague — doesn't name what's included or how)
- "Interact with web pages and run test workflows." (says nothing about agents, commands, or approach)
- "Comprehensive Stripe integration for development." (marketing speak, no specifics)

Then present both descriptions to the user:

```
questions:
  - question: "Use these descriptions?\n\nShort: '<description>'\n\nDetailed: '<longDescription>'"
    header: "Description"
    options:
      - label: "Yes, use them (Recommended)"
        description: "Accept both descriptions"
      - label: "Edit them"
        description: "Provide your own"
```

### 7. Check for a collision

```bash
npx tsx scripts/registry-op.ts list <type>
```

If an entry with this `slug` exists under this type, stop: the operation refuses collisions by
design. A synced item cannot be updated here — tell the user. The same slug under a *different*
type is fine; `(type, slug)` is the key.

### 8. Add through the operations CLI

Write the operation to a temporary file (use the Write tool; any path outside the repo, e.g. the
OS temp directory). No content is copied — community items are metadata only, and the CLI
fetches from `externalUrl` at install time.

```json
{
  "v": 1,
  "kind": "add-remote",
  "type": "<detected type>",
  "slug": "<slug>",
  "name": "<confirmed name>",
  "description": "<short description>",
  "longDescription": "<detailed description>",
  "compatibility": ["<from user>"],
  "pluginType": "<package|wrapper|integration>",
  "wrapper": "<capability type if wrapper>",
  "package": { "<type>": <count>, ... },
  "author": {
    "name": "<from plugin.json or repo owner>",
    "url": "<author url or github profile>"
  },
  "externalUrl": "https://github.com/{owner}/{repo}/tree/{default branch}/{basePath}",
  "updatedAt": "<last commit date ISO 8601>",
  "contents": {
    "files": [<file tree>]
  }
}
```

Notes:
- Use the repository's real default branch in `externalUrl` (`gh api repos/{owner}/{repo} --jq .default_branch`), not `main` by assumption.
- Only include `targetScope` if the user chose a specific scope (not "No scope").
- `contents` only has `files` (the file tree). Extension counts go in `package` instead.
- Only include `pluginType`-specific fields: `wrapper` for wrappers, `package` for packages. Omit the other.
- `sourceType` is set to `community` by the operation; do not include it.

**Plugin classification** — after building the file tree, classify the plugin:

Count capability types by scanning root-level and `.claude/` subdirectories:
- `skills/` → count `.md` files or skill directories
- `agents/` → count `.md` files or agent directories
- `commands/` → count `.md` files or command directories
- `hooks/` → if `hooks.json` exists, fetch it and count trigger keys. Otherwise count hook scripts
- `mcp-servers/` or `.mcp.json` → count MCP servers. Also check `plugin.json` for `mcpServers` field

Then classify:
- **0 or 1 capability types** with single item → `pluginType: "wrapper"`, `wrapper: "<type>"` (e.g., `"mcp"`, `"hook"`, `"skill"`)
- **Multiple capability types** → `pluginType: "package"`, `package: { "skill": N, "agent": N, ... }`
- **No capabilities, only docs** → ask user if this is an `integration` (e.g., LSP setup guide)

Then run:

```bash
npx tsx scripts/registry-op.ts run --op <path-to-that-file>
```

The transaction validates the item in full (a `longDescription` under 30 words or without
backticks is refused here, not at commit time), writes `item.json`, recompiles the manifests,
verifies that only the item's paths and the manifests changed, and rolls back on any failure.
Never write `item.json` yourself and never run `pnpm compile` separately. **If it refuses
because the worktree is dirty**, tell the user to commit or stash their other changes first.

### 9. Confirm

Print summary from the result JSON:
- Type, slug, name, author
- Number of skills, agents, hooks, etc. (for plugins)
- `externalUrl` and `changedPaths`
- Remind the user to review `git status` and commit

## Important notes

- **No local file copy** — community items are metadata-only in the manifest. The CLI/web fetches content from `externalUrl` at install time.
- `sourceType` is `"community"`, same as Anthropic's synced community plugins. The sync script (`scripts/sync.ts`) preserves manually-added community items by checking slugs — if a community item's slug doesn't match any freshly synced item, it survives the sync.
- **Marketplace sub-plugins** are regular community items. Each has its own `externalUrl` pointing to the sub-plugin subdirectory. The community sync refreshes each independently. No special `marketplace` field is needed.
- GitHub API rate limits: unauthenticated = 60 req/hr, authenticated (gh cli) = 5000 req/hr. Using `gh api` ensures authenticated access.
- Build file trees with max depth 6 to capture nested plugin structures.
