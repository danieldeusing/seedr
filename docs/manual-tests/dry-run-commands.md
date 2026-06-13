# Manual Testing: Dry-Run Commands

Use these commands to verify installation paths without making changes. All commands use `--dry-run` flag.

Run from `packages/cli/`:

```bash
cd packages/cli
```

## Skills (All Tools)

Skills support all AI tools with unified directory structure.

```bash
# Single tool
npx tsx src/cli.ts add code-smell-doctor -a claude --scope project --method copy --dry-run -y
npx tsx src/cli.ts add code-smell-doctor -a copilot --scope project --method copy --dry-run -y
npx tsx src/cli.ts add code-smell-doctor -a gemini --scope project --method copy --dry-run -y
npx tsx src/cli.ts add code-smell-doctor -a codex --scope project --method copy --dry-run -y
npx tsx src/cli.ts add code-smell-doctor -a opencode --scope project --method copy --dry-run -y

# All tools at once
npx tsx src/cli.ts add code-smell-doctor -a all --scope project --method copy --dry-run -y

# User scope
npx tsx src/cli.ts add code-smell-doctor -a all --scope user --method copy --dry-run -y

# Symlink method (copies to .agents/skills/<name>, symlinks from tool folders)
npx tsx src/cli.ts add code-smell-doctor -a claude --scope project --method symlink --dry-run -y
npx tsx src/cli.ts add code-smell-doctor -a all --scope project --method symlink --dry-run -y
```

## Agents (Claude Only)

Agents are single markdown files installed to the agents directory.

```bash
# Project scope
npx tsx src/cli.ts add my-agent -t agent -a claude --scope project --method copy --dry-run -y

# User scope
npx tsx src/cli.ts add my-agent -t agent -a claude --scope user --method copy --dry-run -y

# Local scope
npx tsx src/cli.ts add my-agent -t agent -a claude --scope local --method copy --dry-run -y
```

## Hooks (Claude Only)

Hooks are merged into settings.json under the `hooks` field.

```bash
# Project scope - merges into .claude/settings.json
npx tsx src/cli.ts add pre-commit-hook -t hook -a claude --scope project --dry-run -y

# User scope - merges into ~/.claude/settings.json
npx tsx src/cli.ts add pre-commit-hook -t hook -a claude --scope user --dry-run -y

# Local scope - merges into .claude/settings.local.json
npx tsx src/cli.ts add pre-commit-hook -t hook -a claude --scope local --dry-run -y
```

## MCP Servers (All Tools)

MCP servers are merged into .mcp.json or ~/.claude.json.

```bash
# Project scope - merges into .mcp.json
npx tsx src/cli.ts add github-mcp -t mcp -a claude --scope project --dry-run -y

# User scope - merges into ~/.claude.json
npx tsx src/cli.ts add github-mcp -t mcp -a claude --scope user --dry-run -y
```

## Settings (Claude Only)

Settings are deep-merged into settings.json.

```bash
# Project scope - merges into .claude/settings.json
npx tsx src/cli.ts add my-settings -t settings -a claude --scope project --dry-run -y

# User scope - merges into ~/.claude/settings.json
npx tsx src/cli.ts add my-settings -t settings -a claude --scope user --dry-run -y

# Local scope - merges into .claude/settings.local.json
npx tsx src/cli.ts add my-settings -t settings -a claude --scope local --dry-run -y
```

## Plugins (Claude Only)

Plugins are cached in `~/.claude/plugins/cache/`, registered in `installed_plugins.json`, and their marketplace is registered in `known_marketplaces.json`.

```bash
# Project scope (using a real registry item)
npx tsx src/cli.ts add superpowers -a claude --scope project --dry-run -y

# User scope
npx tsx src/cli.ts add superpowers -a claude --scope user --dry-run -y
```

---

## Expected Output Paths

### Copy Method (default)

| Type | Scope | Tool | Path |
|------|-------|------|------|
| skill | project | claude | `.claude/skills/<name>/` |
| skill | project | copilot | `.github/skills/<name>/` |
| skill | project | gemini | `.gemini/skills/<name>/` |
| skill | project | codex | `.codex/skills/<name>/` |
| skill | project | opencode | `.opencode/skills/<name>/` |
| skill | user | claude | `~/.claude/skills/<name>/` |
| agent | project | claude | `.claude/agents/<name>.md` |
| agent | user | claude | `~/.claude/agents/<name>.md` |
| hook | project | claude | `.claude/settings.json` (merge) |
| hook | user | claude | `~/.claude/settings.json` (merge) |
| hook | local | claude | `.claude/settings.local.json` (merge) |
| mcp | project | claude | `.mcp.json` (merge) |
| mcp | user | claude | `~/.claude.json` (merge) |
| settings | project | claude | `.claude/settings.json` (merge) |
| settings | local | claude | `.claude/settings.local.json` (merge) |
| plugin | project | claude | `~/.claude/plugins/cache/<marketplace>/<name>/<version>/` + `known_marketplaces.json` + `marketplaces/<name>/` |

### Symlink Method

For skills with `--method symlink`, content is stored in a central location and tool folders contain symlinks:

| Component | Path |
|-----------|------|
| Central storage | `.agents/skills/<name>/` |
| Claude symlink | `.claude/skills/<name>/` → `.agents/skills/<name>/` |
| Copilot symlink | `.github/skills/<name>/` → `.agents/skills/<name>/` |
| Gemini symlink | `.gemini/skills/<name>/` → `.agents/skills/<name>/` |
| Codex symlink | `.codex/skills/<name>/` → `.agents/skills/<name>/` |
| OpenCode symlink | `.opencode/skills/<name>/` → `.agents/skills/<name>/` |

This allows a single source of truth when installing skills for multiple AI tools.

---

## Notes

- The registry currently contains **skills** and **plugins**. Skills are synced from Anthropic repos (`anthropics/skills`, `anthropics/claude-plugins-official`) and community items are re-synced from their GitHub repos.
- **Hooks**, **agents**, **MCP servers**, and **settings** are not yet in the registry. Dry-runs for these types will fail with "not found" until items are added.
- Plugin install also registers the marketplace in `known_marketplaces.json` and clones the repo to `~/.claude/plugins/marketplaces/` (required by Claude Code).
- Use `--dry-run` (`-n`) to verify paths without writing files.
- Use `-y` to skip confirmation prompts.
- Shorthand flags: `-s` (scope), `-m` (method), `-n` (dry-run), `-f` (force).
