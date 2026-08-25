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

### Deprecated spellings in registry data

Two values in `item.json` were renamed, in code first and then in the data, because the
published CLI reads `main` live and would have broken on the new spelling before it shipped:

| Field | Canonical | Deprecated alias | Vocabulary | Data migrated |
|---|---|---|---|---|
| `sourceType` | `seedr` | `toolr` | `packages/registry-ops/src/sourceTypes.ts` | 2026-08-25, CLI 0.1.89 |
| `compatibility` | `antigravity` | `gemini` | `packages/registry-ops/src/agents.ts` | 2026-08-25, CLI 0.1.88 |

Both are done. The aliases are still accepted on input and resolved on read, so an old
`item.json`, an old `--agents` flag and a fork that never migrated all still work; nothing
writes them any more, and the `STORAGE_*` table in each vocabulary file is empty.

The pattern is worth keeping for the next rename: canonical in code, alias accepted, one
`STORAGE_*` table holding writers to the old spelling, and a migration script whose header
carries the precondition — check `npm view @danieldeusing/seedr version` first, because
migrating the data ahead of the CLI breaks installs for every client. `scripts/migrate-source-types.ts`
and `scripts/migrate-agent-ids.ts` are the worked examples; both are idempotent and now no-ops.

## Managing Registry Items

Skills for adding and removing items from `registry/manifest.json`:

### `/add-seedr <path>` — Add local first-party items

For first-party content maintained in this repo. Copies files into `registry/` and adds a manifest entry with the first-party source type.

```bash
# Example: add a hook from a local path
/add-seedr /Users/daniel/project/.claude/hooks/pre-commit-lint
```

- Auto-detects content type from path segments (`/skills/`, `/hooks/`, `/agents/`, etc.)
- Asks for name, scope, compatibility, and description via interactive prompts
- Copies content to `registry/<type>s/<slug>/`
- First-party items are preserved across syncs

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

### `/update-item <type> <slug> <instruction>` — Update a first-party item

Patches an existing first-party item — metadata, descriptions or content files — without a
remove-and-add. Drafts the change, shows it, and applies it through the operations CLI with the
item's current state hash, so a stale draft is refused. Synced items are refused outright: the
next sync would overwrite them.

### How the skills mutate the registry

Every add/update/remove skill calls `npx tsx scripts/registry-op.ts run --op <file>` with a
versioned JSON operation. `@seedr/registry-ops` (`packages/registry-ops`) then runs it as a
transaction: clean worktree, apply, `compile`, verify only the item's paths and manifests
changed, roll back otherwise. The skills never `cp`, `rm`, write `item.json` or run `pnpm compile`
themselves, and they derive author/`externalUrl` from the repo (`registry-op.ts identity`)
rather than from a constant — a fork attributes its items to its own owner.

### Seedr Studio (`apps/studio`)

A desktop capability manager for a seedr checkout, wearing the estate look on configr's
structure: an overlay title bar (the strip IS the macOS title bar), and a searchable
explorer with collapsible type groups whose rows show ownership (pencil = first-party/editable,
eye = synced/read-only) and the supported agents' brand marks — a footer dropdown flips the
rows to the text form (`rw-` · `cgaxo`), next to the theme dropdown. Each item's detail
pairs a resizable, collapsible metadata pane (stacking on narrow panes) with a Monaco file
preview (self-hosted, read-only) offering syntax, formatted-markdown and plain views; a
file's right-click menu carries "open with default app" and the view modes. Everything
else — add capability, edit, test install, git, settings — opens as a dialog over the
workspace, `data-tip` hovers replace inline notes (every form label explains its own
vocabulary), and every external link (markdown links included) goes through a confirmation
dialog, scheme-gated in both the webview and the host's `open_external`. Run from source —
there are no installers:

```bash
pnpm --filter @seedr/studio tauri:dev                  # needs Rust (cargo) on the machine
SEEDR_STUDIO_REPO=/path/to/seedr pnpm --filter @seedr/studio tauri:dev   # skip the folder picker
pnpm --filter @seedr/studio test                       # vitest + jsdom; coverage thresholds are a gate
cd apps/studio/src-tauri && cargo test                 # the host's path-scoping tests
```

**Add capability** (the Author screen) takes one of three routes, chosen by the `from` field.
*A local folder* is the deterministic one: you supply what the model must not guess (type,
slug, name, agents, scope, author — prefilled from `registry-op.ts identity`), "draft
descriptions with Claude" sends a size-capped digest of the source to `claude -p
--output-format json --json-schema … --tools "" --max-turns 1` — one turn, no tools, answer
validated by the same validator the commit gate uses, rejected twice means failure, never a
hand-repaired JSON — and "add to registry" runs the `add-local` operation through
`scripts/registry-op.ts` as a transaction (clean worktree required, rollback on any failure).
*A git repository* and *the agent writes it* are agent jobs instead: Studio composes the
prompt (this repo's own `/add-community` or `/add-seedr` skill, the type's pre-prompt, every
filled field as a hint the agent honours and every empty one for it to derive) and streams
`claude -p --output-format stream-json --verbose --allowedTools …` line by line. A job's tools
are named, never assumed — read/write the checkout, `WebFetch`, `Bash(npx tsx
scripts/registry-op.ts:*)`; no `git`, so a job cannot commit — and it must end with `ADDED
<type>/<slug>`, which is how the explorer knows what to open. Each description says who
writes it, you or the agent. Claude Code is probed at startup (`--version`, `--help` flags)
and disabled with a diagnostic rather than degraded.

**Update** (the edit button on a first-party item's detail) patches name, descriptions, agents and
scope — optionally redrafted by Claude from the item's own files — as a hash-guarded `update`
transaction; synced items are read-only with the reason. **Remove** is a two-step button on
the detail header, hash-guarded too; official items are refused because the daily sync would
restore them. **Test install** (first-party items only) has the host run the checkout's own
CLI — `node node_modules/tsx/dist/cli.mjs packages/cli/src/cli.ts add <slug> --type <type>
--agents all --scope project --method copy --yes` — in a scratch directory it creates and
removes, then shows every file written and, for a skill, checks each of the item's files
arrived byte for byte; synced items are not offered because they install from their
upstream repository. **git** has two views: *status* shows branch, head, the changed paths
and each one's diff; *publish* picks the target branches, takes a commit message and notes,
and hands the job to the agent with `Bash(git:*)` and file edits allowed and nothing else —
the prompt restates this repo's rules (no `--no-verify`, no cherry-pick between branches, no
amending what is pushed, pull first, stop on a conflict) and asks for `PUBLISHED <branches>`
or `STOPPED <why>` back. Studio reads `.github/workflows` to mark the branches whose push
starts a workflow, so choosing `prod` says out loud that it deploys and publishes; the run
takes a second, explicit confirmation of the exact targets.

**Settings** holds two pages. *Coding agents* probes each canonical agent's CLI
(`claude`, `copilot`, `agy`, `codex`, `opencode`) with `--version` and lets a binary a GUI
launch cannot see on PATH be pointed at directly — the host validates the path, keeps it per
machine and applies it wherever a run names the bare program; `npx` and `git` are deliberately
not overridable. *Pre-prompts* holds the standing context per capability type, once for adds
and once for edits, which the add and edit dialogs prefill into their prompt field.

Architecture, deliberately small: the Rust host (`src-tauri/src/lib.rs`) is a read-only,
root-scoped filesystem bridge plus a registry watcher — every path crosses the IPC boundary
relative to the chosen repo and is refused if it escapes it — and a bounded process executor
(`executor.rs`: the task id is the cancel key, the whole tree is killed via a Unix process
group or a Windows Job Object, both streams are drained concurrently, output is capped,
a watchdog enforces the timeout, prompts travel on stdin, the login shell's PATH is merged in
so a GUI launch finds `claude` and `npx`; every child gets `SEEDR_NO_TELEMETRY=1`). Source
folders for drafts are readable only after the native picker returned them in this session. Registry semantics live in
TypeScript: the webview imports `@seedr/registry-ops/pure` (paths, the validator, the operation
types), so Studio, `compile`, the commit gate and the skills all share one definition of an
item. Mutations go through `scripts/registry-op.ts` transactions. Two kinds of agent run, kept
apart on purpose: the *drafting adapter* gets no tools and one turn, while an *agent job*
(add from a repository or a prompt, publish) names the tools it allows and Claude Code denies
the rest — in `-p` there is nobody to ask, so a tool outside the list fails visibly. `src/core/lib/tauriInvoke.ts` is the only importer of Tauri's IPC, and
the test harness (`src/test/mockIpc.ts`) rejects unknown commands instead of resolving
`undefined`.

### `/remove-seedr <slug>` — Remove local first-party items

Removes a first-party item by slug. Deletes local files from `registry/<type>s/<slug>/` and removes the manifest entry.

```bash
# Example: remove a hook
/remove-seedr pre-commit-lint
```

- Looks up the item by slug among the first-party ones
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

### `registry-item-reviewer` agent — Review item quality

A subagent (`.agents/agents/registry-item-reviewer.md`) that reviews `item.json` files for required fields, field consistency, and `description`/`longDescription` quality against `.agents/rules/`. Read-only — it reports findings and suggested fixes, never edits. Auto-spawns when adding/editing a registry item; invoke explicitly before committing registry changes ("use the registry-item-reviewer agent").

### Auto-compile hook

A `PostToolUse` hook (`.agents/hooks/compile-on-item-edit.mjs`, wired in `.claude/settings.json`) runs `pnpm compile` whenever an `item.json` is edited, so the generated manifests never go stale from a manual edit.

### Agent-neutral tooling layout

`.agents/` is the canonical, committed home of this repo's own dev tooling — `skills/`, `rules/`, `agents/` (subagents) and `hooks/`. Claude Code reads `.claude/`, so `scripts/setup-agents.mjs` links `.claude/skills/<name>`, `.claude/rules` and `.claude/agents` to it (per-skill links, directory junctions on Windows). It runs on every `pnpm install` via the root `prepare` script and is idempotent; the links are gitignored. Edit the files under `.agents/` — never the links — and re-run `node scripts/setup-agents.mjs` after adding a skill. `CLAUDE.md` is a one-line `@AGENTS.md` import.

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

GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | Does |
|----------|---------|------|
| `ci.yml` | push to `main`, any PR | Main job: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check-descriptions`. Matrix job (ubuntu/windows/macos): registry-ops tests, script tests, `cargo test` for the Studio host |
| `deploy.yml` | push to `prod` | Deploy web to Cloudflare Pages + publish CLI to npm |
| `sync.yml` | schedule / manual | Re-sync community registry items from their GitHub repos |
| `test-email.yml` | manual | Smoke-test the SMTP sync-notification setup |

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

## Web Design System

The web app uses local shadcn-style components (`apps/web/src/components/ui/`) on Tailwind 4 with a terminal/CRT aesthetic. Four themes (warm default, green, mono, paper) are defined as CSS variable sets in `apps/web/src/styles/index.css`, switched via `html[data-theme]` and persisted in localStorage (`theme` key, pre-paint script in `index.html`). Use semantic classes (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-primary`) — never hardcode colors; border radius is globally zero. JetBrains Mono is the only font (via `@fontsource-variable/jetbrains-mono`). Font sizes never go below 12px except for card metadata (time/counts, 11px); the type scale lives in `index.css`.

## ESLint Disable Comments

**Never add `eslint-disable`, `eslint-disable-next-line`, or `eslint-disable-line` comments without asking the user first** (use the AskUserQuestion tool). If the user approves, the disable comment MUST include a brief reason explaining why the bypass is acceptable. Format: `// eslint-disable-next-line rule-name -- reason`.

## Gotchas

- **pnpm only** - Use `pnpm` not `npm` for all operations
- **Turbo cache** - `pnpm clean` does NOT clear Turbo's cache. `registry/**` is in the `build` task's `inputs` (see `turbo.json`), so registry edits do invalidate the cache; if you ever see stale output anyway, run `npx turbo run build --force` to bypass it
- **Local vs remote** - CLI tries local registry first, falls back to GitHub raw
