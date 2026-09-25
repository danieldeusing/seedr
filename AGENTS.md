# Seedr

CLI and web registry for browsing and installing AI coding assistant content: skills, agents, hooks, plugins, MCP servers, and settings.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turbo
- **CLI**: TypeScript, Commander.js, Chalk, Ora, Inquirer
- **Web**: React 19, Vite, React Router, Tailwind CSS 4, shadcn-style components
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
cd apps/web && pnpm dev  # Opens http://localhost:6200
```

See [docs/manual-tests/dry-run-commands.md](docs/manual-tests/dry-run-commands.md) for comprehensive dry-run testing commands.

## Architecture

### Monorepo Structure

```
seedr/
├── apps/web/             # React web app (seedr.danieldeusing.de)
│   └── public/playgrounds/  # Interactive architecture playgrounds
├── packages/cli/         # CLI package (npx seedr)
├── packages/registry-ops/ # Deterministic registry operations: paths, validator, labels, add/update/remove/set-labels, compile, transactions
├── apps/studio/          # Seedr Studio — desktop capability manager (Tauri v2 + React), run from source
├── registry/
│   ├── manifest.json           # Index: version + type descriptors + labels
│   ├── labels.json             # Label catalogue (editable source; `set-labels` writes it)
│   ├── skills/                 # Skill content + item.json + manifest.json
│   ├── plugins/                # Plugin item.json files + manifest.json
│   ├── hooks/                  # Hook content + item.json + manifest.json
│   └── (agents, mcp, settings, commands — empty, with manifest.json)
├── .agents/              # Canonical dev tooling: skills/, rules/, agents/, hooks/
├── .claude/              # settings.json + launch.json; skills/rules/agents are generated links
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
    "skill": { "file": "skills/manifest.json", "count": 37 },
    "plugin": { "file": "plugins/manifest.json", "count": 66 },
    "hook": { "file": "hooks/manifest.json", "count": 3 },
    "agent": { "file": "agents/manifest.json", "count": 0 }
  },
  "labels": [{ "slug": "project-x", "name": "Project X", "color": "violet" }]
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

**`labels.json`** — the label catalogue, an editable source file like `item.json`:
```json
{ "version": 1, "labels": [{ "slug": "project-x", "name": "Project X", "color": "violet" }] }
```

One registry serves several projects, so an item may carry one optional `label` — the slug of a
catalogue entry. The name and colour live only here, so renaming or recolouring a label touches
no item. `pnpm compile` copies the catalogue into `registry/manifest.json`, and the per-type
manifests keep each item's `label` (it is card-level data, unlike `longDescription`). The
vocabulary, the strict parser and the `set-labels` operation are described in
[.agents/rules/registry-structure.md](.agents/rules/registry-structure.md).

Every surface reads that one catalogue: `seedr list --label <slug>` filters the CLI's listing
(and treats a label no item carries as an error, naming the ones in use, because that is almost
always a typo); the web app shows a label badge on the card and offers a Label filter beside
Scope, under the first-party source; Studio manages the catalogue in settings → labels and
offers the picker in add and edit.

### Retired spellings in registry data

No value in `item.json` carries a deprecated alias any more. Two did, and both were deleted
outright once the data, the CLI and every surface had moved:

- `sourceType`'s pre-`seedr` spelling, **deleted on 2026-08-26** (CLI 0.1.89). The old spelling
  appears nowhere in this repository — deliberately, down to the tests, so a grep for it
  returns nothing. A fork that still carries it is told `unknown sourceType`.
- `compatibility`'s `gemini`, **deleted on 2026-09-25**. Gemini CLI is no longer a supported
  agent; Google Antigravity is, as `antigravity`. `gemini` (and the `gemini-code` nickname) is
  now an unknown agent everywhere: `seedr add -a gemini`, an `item.json` listing it,
  `?tool=gemini` on the web app and an install event naming it are all refused, and the tests
  assert exactly that. The `.gemini` strings left in the code are Antigravity's own locations
  under `~/.gemini/config`, not the retired agent.

One spelling, and a clear error for anything else, is the point. That is the end state a
staged rename is aiming for — canonical in code, alias accepted while the published CLI
catches up, then the alias deleted.

## Managing Registry Items

The maintainer skills in `.agents/skills/` change the registry. Each skill's `SKILL.md` holds its
full procedure; use the one that fits:

- `/add-seedr <path>` — add first-party content maintained in this repo; it copies the files
  into `registry/<type>s/<slug>/`, and first-party items are preserved across syncs. A plugin
  folder (one carrying `.claude-plugin/plugin.json`) is accepted as a first-party plugin; the
  CLI installs it as a marketplace built around its own copy (`docs/verification.md`,
  "plugin (first-party)").
- `/add-community <github-url>` — add third-party content hosted on GitHub as a metadata-only
  item (`sourceType: "community"`): the CLI fetches it from `externalUrl` at install time, and
  `pnpm sync` re-syncs it from its repository. A repository that one of Anthropic's marketplaces
  lists is already mirrored by the sync, so the skill stops and points at the synced item.
- `/update-item <type> <slug> <instruction>` — patch a first-party item's metadata,
  descriptions or content files without a remove-and-add; a stale draft is refused by the
  item's state hash, and a synced item is refused because the next sync would overwrite it.
- `/remove-seedr <slug>` — remove a first-party item and its local files, after the user
  confirms.
- `/remove-community <slug>` — remove a community item, which is metadata only, after the user
  confirms.
- `registry-item-reviewer` agent (`.agents/agents/registry-item-reviewer.md`) — reviews
  `item.json` files for required fields, field consistency, and `description`/`longDescription`
  quality against `.agents/rules/`. Read-only: it reports findings and suggested fixes, never
  edits. Auto-spawns when adding/editing a registry item; invoke it explicitly before committing
  registry changes ("use the registry-item-reviewer agent").

### How the skills mutate the registry

Every add/update/remove skill calls `npx tsx scripts/registry-op.ts run --op <file>` with a
versioned JSON operation. `@seedr/registry-ops` (`packages/registry-ops`) then runs it as a
transaction: clean worktree, apply, `compile`, verify only the item's paths and manifests
changed, roll back otherwise. The skills never `cp`, `rm`, write `item.json` or run `pnpm compile`
themselves, and they derive author/`externalUrl` from the repo (`registry-op.ts identity`)
rather than from a constant — a fork attributes its items to its own owner.

### Seedr Studio (`apps/studio`)

Before running, using or changing Seedr Studio, the desktop capability manager for a seedr
checkout, read `.agents/rules/studio.md`.

### Auto-compile hook

A `PostToolUse` hook (`.agents/hooks/compile-on-item-edit.mjs`, wired in `.claude/settings.json`)
runs `pnpm compile` whenever Claude Code's Edit, Write or MultiEdit tool writes an `item.json`.
It does not fire for a content file (`SKILL.md`, `references/`, a hook script) or for anything a
shell command writes, and a content edit changes the item's compiled digest too, so run
`pnpm compile` yourself after those.

### Agent-neutral tooling layout

`.agents/` is the canonical, committed home of this repo's own dev tooling — `skills/`, `rules/`, `agents/` (subagents) and `hooks/`. Claude Code reads `.claude/`, so `scripts/setup-agents.mjs` links `.claude/skills/<name>`, `.claude/rules` and `.claude/agents` to it (per-skill links, directory junctions on Windows). `prepare` runs it on `pnpm install` — **but not when `ignore-scripts=true`** (a common and sensible hardening in `~/.npmrc`; it also skips husky, so the git hooks are never installed either). After cloning, run `pnpm bootstrap` once: it installs the hooks and creates the links, and is idempotent; the links are gitignored. Edit the files under `.agents/` — never the links — and re-run `pnpm bootstrap` after adding a skill. `CLAUDE.md` is a one-line `@AGENTS.md` import.

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
pnpm --filter @danieldeusing/seedr typecheck
pnpm --filter @seedr/web typecheck

# Or from package directory
npx tsc --noEmit
```

## CI / CD

Before changing a workflow in `.github/workflows/`, or how the CLI is published to npm as
`@danieldeusing/seedr`, read `.agents/rules/ci-cd.md`: what each workflow does, the npm
Trusted Publisher (OIDC) setup and the GitHub secrets. `ci.yml` checks every push to `main` and
every PR: `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm check-descriptions`, plus the
registry-ops tests, the script tests and the Studio host's `cargo test` on ubuntu, windows and
macos.

**Work on `main`; promote to `prod` by merge — and only in that direction.** The branches
diverge by design after every release, so `prod` sitting ahead of `main` is normal, and
`git push origin origin/main:prod` is rejected. Which branch holds what, the promote commands,
and what the sync and deploy automation own are in `.agents/rules/git-workflow.md` — read it
before committing, and check `git branch --show-current` first: a checkout left on `prod` is how
code goes missing from `main`. And judge a deploy by what is being served, not by the job going
green — the web job spent months uploading to a preview URL and reporting success.

## Web Design System

The web app uses local shadcn-style components (`apps/web/src/components/ui/`) on Tailwind 4 with a terminal/CRT aesthetic. Four themes (warm default, green, mono, paper) are defined as CSS variable sets in `apps/web/src/styles/index.css`, switched via `html[data-theme]` and persisted in localStorage (`theme` key, pre-paint script in `index.html`). Use semantic classes (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-primary`) — never hardcode colors; border radius is globally zero. JetBrains Mono is the only font (via `@fontsource-variable/jetbrains-mono`). Font sizes never go below 12px except for card metadata (time/counts, 11px); the type scale lives in `index.css`.

## ESLint Disable Comments

**Never add `eslint-disable`, `eslint-disable-next-line`, or `eslint-disable-line` comments without asking the user first** (use the AskUserQuestion tool). If the user approves, the disable comment MUST include a brief reason explaining why the bypass is acceptable. Format: `// eslint-disable-next-line rule-name -- reason`.

## Gotchas

- **pnpm only** - Use `pnpm` not `npm` for all operations
- **Turbo cache** - `pnpm clean` does NOT clear Turbo's cache. `registry/**` is in the `build` task's `inputs` (see `turbo.json`), so registry edits do invalidate the cache; if you ever see stale output anyway, run `npx turbo run build --force` to bypass it
- **Local vs remote** - CLI tries local registry first, falls back to GitHub raw
