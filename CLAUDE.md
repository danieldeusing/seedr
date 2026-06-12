# Seedr

CLI and web registry for browsing and installing AI coding assistant content: skills, agents, hooks, plugins, MCP servers, and settings. Part of the toolr-suite ecosystem.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turbo
- **CLI**: TypeScript, Commander.js, Chalk, Ora, Inquirer
- **Web**: React 18, Vite, React Router, Tailwind CSS
- **Build**: tsup (CLI), Vite (web)

## Commands

```bash
# Monorepo (from project root)
pnpm install              # Install all dependencies
pnpm build                # Build all packages (via turbo)
pnpm dev                  # Run all dev servers
pnpm lint                 # Lint all packages
pnpm typecheck            # Type-check all packages
pnpm clean                # Clean all build artifacts
pnpm compile              # Compile item.json files into split manifest files

# CLI package (from packages/cli/)
pnpm build                # Build CLI
pnpm dev                  # Watch mode
tsx src/cli.ts            # Run CLI directly during dev

# Web app (from apps/web/)
pnpm dev                  # Vite dev server
pnpm build                # Production build
```

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm --filter @danieldeusing/seedr test

# Run tests in watch mode
pnpm --filter @danieldeusing/seedr test:watch

# Run tests with coverage report
pnpm --filter @danieldeusing/seedr test:coverage
```

### Install Smoke Tests

Reads the real `manifest.json` and verifies every item can be installed through its handler.

- **Mocked** (always run, ~50ms): Calls the appropriate handler (`installSkill`, `installPlugin`, etc.) with memfs + mocked registry. Verifies every install returns `success: true`. Empty type categories (agents, mcp, settings) are auto-skipped.
- **Live URL validation** (`SEEDR_LIVE=true`, ~20s): For every item with an `externalUrl`, fetches the main content file from GitHub raw. Skills must return 200 with YAML frontmatter, plugins must return valid `plugin.json` with a `name` field.

```bash
# Fast mocked tests (CI/build)
pnpm test -- install-all

# Live URL validation (pre-release)
SEEDR_LIVE=true pnpm test -- install-all
```

### Manual Verification

```bash
# CLI changes - test commands directly
cd packages/cli && tsx src/cli.ts --help
tsx src/cli.ts list
tsx src/cli.ts add <skill-name> --dry-run

# Web changes - verify in browser
cd apps/web && pnpm dev  # Opens http://localhost:5173
```

See [docs/manual-tests/dry-run-commands.md](docs/manual-tests/dry-run-commands.md) for comprehensive dry-run testing commands.

## Architecture

### Monorepo Structure

```
seedr/
├── apps/web/             # React web app (seedr.danieldeusing.de)
│   └── public/playgrounds/  # Interactive architecture playgrounds
├── packages/cli/         # CLI package (npx seedr)
├── registry/
│   ├── manifest.json           # Index: version + type descriptors
│   ├── skills/                 # Skill content + item.json + manifest.json
│   ├── plugins/                # Plugin item.json files + manifest.json
│   ├── hooks/                  # Hook content + item.json + manifest.json
│   └── (agents, mcp, settings, commands — empty, with manifest.json)
├── .claude/skills/       # Local skill definitions (dev)
├── turbo.json            # Build orchestration
└── pnpm-workspace.yaml   # Workspace config
```

### Key Entry Points

| Component | Entry | Purpose |
|-----------|-------|---------|
| CLI | `packages/cli/src/cli.ts` | Commander setup |
| Web | `apps/web/src/App.tsx` | React router |
| Registry | `packages/cli/src/config/registry.ts` | Manifest loading |

### CLI Package (`packages/cli/`)

- `src/cli.ts` - Entry point, command registration
- `src/commands/` - add, init, list, remove commands
- `src/config/` - Registry and tool configs
- `src/handlers/` - Content type handlers (skill, agent, hook, mcp, settings, plugin)
- `src/utils/` - File system, detection, conversion utilities
- `src/types.ts` - Shared types

### Web App (`apps/web/`)

- `src/routes/` - Browse, Detail, Home pages
- `src/components/` - UI components
- `src/lib/` - Registry client, types, utilities

### Registry

Each item has a source-of-truth `item.json` in `registry/<type>s/<slug>/`. Running `pnpm compile` assembles these into split manifest files:

**`item.json`** — one per item, the editable source:
```json
{ "slug": "pdf", "name": "PDF", "type": "skill", "description": "...", ... }
```

**`manifest.json`** — lightweight index (never contains item data):
```json
{
  "version": "2.0.0",
  "types": {
    "skill": { "file": "skills/manifest.json", "count": 26 },
    "plugin": { "file": "plugins/manifest.json", "count": 52 },
    "hook": { "file": "hooks/manifest.json", "count": 3 },
    "agent": { "file": "agents/manifest.json", "count": 0 }
  }
}
```

**`<type>/manifest.json`** — all items of one type, lives in its type folder:
```json
{
  "type": "skill",
  "items": [{ "slug": "pdf", "name": "PDF", "type": "skill", ... }]
}
```

Consumers load only what they need. The web app imports all type files at build time and assembles them for rendering cards:

```typescript
import skillsData from "@registry/skills/manifest.json";
import pluginsData from "@registry/plugins/manifest.json";
// ...
const allItems = [...skillsData.items, ...pluginsData.items, ...];
```

## Managing Registry Items

Skills for adding and removing items from `registry/manifest.json`:

### `/add-toolr <path>` — Add local toolr items

For first-party content maintained in this repo. Copies files into `registry/` and adds a manifest entry with `sourceType: "toolr"`.

```bash
# Example: add a hook from a local path
/add-toolr /Users/daniel/project/.claude/hooks/pre-commit-lint
```

- Auto-detects content type from path segments (`/skills/`, `/hooks/`, `/agents/`, etc.)
- Asks for name, scope, compatibility, and description via interactive prompts
- Copies content to `registry/<type>s/<slug>/`
- Toolr items are preserved across syncs

### `/add-community <github-url>` — Add community GitHub repos

For third-party content hosted on GitHub. Metadata-only in the manifest (no local file copy) — the CLI fetches content from `externalUrl` at install time.

```bash
# Example: add a community plugin
/add-community https://github.com/obra/superpowers
```

- Detects type via GitHub API (checks `plugin.json` then `SKILL.md`)
- Extracts metadata, builds file tree, asks clarifying questions
- Adds manifest entry with `sourceType: "community"`
- Community items are re-synced from their GitHub repos on `pnpm sync`

### `/remove-toolr <slug>` — Remove local toolr items

Removes a toolr-sourced item by slug. Deletes local files from `registry/<type>s/<slug>/` and removes the manifest entry.

```bash
# Example: remove a hook
/remove-toolr pre-commit-lint
```

- Looks up item by slug with `sourceType: "toolr"`
- Confirms with user before deleting
- Deletes local directory and manifest entry

### `/remove-community <slug>` — Remove community items

Removes a community-sourced item by slug. Removes the manifest entry only (no local files to clean up).

```bash
# Example: remove a community plugin
/remove-community superpowers
```

- Looks up item by slug with `sourceType: "community"`
- Confirms with user before removing
- Removes manifest entry only (metadata-only items)

## Key Design Decisions

- **Turbo for orchestration** - Task caching and parallel execution
- **pnpm workspaces** - Shared dependencies, hoisted node_modules
- **CLI-first** - Main interaction via `seedr add`, `seedr init`
- **Web for discovery** - Browse and preview before installing
- **Registry as data** - individual `item.json` files are the source of truth, compiled into split per-type manifests

## TypeScript Configuration

Each package has its own `tsconfig.json` extending `tsconfig.base.json`:

```bash
# Type check specific package
pnpm --filter @seedr/cli typecheck
pnpm --filter @seedr/web typecheck

# Or from package directory
npx tsc --noEmit
```

## npm Publishing

The CLI is published to npm as `@danieldeusing/seedr`. Push to `prod` branch triggers `.github/workflows/deploy.yml` (publish-cli job).

### How CI auth works

Publishing uses **npm Trusted Publishers (OIDC)** — no npm tokens needed. Requirements:

1. `packages/cli/package.json` must have a `repository` field matching the GitHub repo
2. The workflow must have `id-token: write` permission
3. **On npmjs.com**: the package must have a Trusted Publisher configured (package Settings → Trusted Publisher → add repo + workflow filename)

### GitHub secrets needed

- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` — Cloudflare Pages deploys (deploy-web job)
- Version bump commits and registry sync pushes use the default `GITHUB_TOKEN` (no extra secrets)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` — sync notification emails

## @toolr/ui-design

The web app uses shared components from the `@toolr/ui-design` npm package. Source lives at `/Users/daniel/Work/twiced/toolr/shared/ui-design/`.

### Updating shared components

1. Make changes in `shared/ui-design/`
2. Commit and push to both `main` and `prod` branches (push to `prod` triggers the npm publish GitHub Action)
3. Wait for the npm deploy to finish
4. Update the version in `apps/web/package.json` and run `pnpm install`

### Local development

To iterate without waiting for npm publishes, use a file reference in `apps/web/package.json`:

```json
"@toolr/ui-design": "file:../../../../../twiced/toolr/shared/ui-design"
```

Remember to switch back to the versioned dependency before committing.

**After editing ui-design source**, you must rebuild, reinstall, kill all dev servers, and restart:

```bash
# 1. Rebuild dist (CSS imports resolve to dist/, not source)
cd /Users/daniel/Work/twiced/toolr/shared/ui-design && npm run build

# 2. Reinstall to refresh pnpm hardlinks
cd /Users/daniel/Work/danieldeusing/apps/seedr && pnpm install

# 3. Kill ALL running dev servers (Vite caches modules in memory)
tmux kill-session -t seedr 2>/dev/null
# Also kill any orphaned node processes on the dev port
lsof -ti :6200 | xargs kill -9 2>/dev/null

# 4. Clear Vite caches
rm -rf apps/web/node_modules/.vite apps/web/node_modules/.cache

# 5. Restart dev server
tmux new-session -d -s seedr -c /Users/daniel/Work/danieldeusing/apps/seedr
tmux send-keys -t seedr 'pnpm dev' Enter
```

**Why all these steps are needed:**
- CSS `@import` resolves to `dist/` tokens (the `source` export condition only applies to JS). So `npm run build` is required to copy updated CSS tokens to `dist/`.
- pnpm `file:` references use hardlinks into the content-addressable store. `pnpm install` refreshes these hardlinks.
- Vite caches compiled CSS and JS modules in memory. Simply clearing `.vite/` is not enough — the running server process must be killed and restarted.
- Orphaned node processes on the same port can persist after `tmux kill-session`, serving stale content.

## ESLint Disable Comments

**Never add `eslint-disable`, `eslint-disable-next-line`, or `eslint-disable-line` comments without asking the user first** (use the AskUserQuestion tool). If the user approves, the disable comment MUST include a brief reason explaining why the bypass is acceptable. Format: `// eslint-disable-next-line rule-name -- reason`.

## Gotchas

- **pnpm only** - Use `pnpm` not `npm` for all operations
- **Turbo cache** - Run `pnpm clean` if builds seem stale
- **Registry symlinks** - Content in `registry/` directories may be symlinks during dev
- **Local vs remote** - CLI tries local registry first, falls back to GitHub raw
