---
paths:
  - registry/**
  - .agents/skills/**
  - .claude/skills/**
  - packages/registry-ops/**
  - packages/cli/src/config/registry.ts
  - apps/web/src/lib/registry.ts
  - scripts/registry-op.ts
  - scripts/compile-manifest.ts
  - scripts/sync.ts
---

# Registry Structure

## Source of Truth

Each item's editable source of truth is a single `item.json` file. Running `pnpm compile`
(`scripts/compile-manifest.ts`) reads every `item.json` and assembles the index and per-type
manifests. The `manifest.json` files are **generated** — never hand-edit them.

A `PostToolUse` hook (`.agents/hooks/compile-on-item-edit.mjs`, wired in `.claude/settings.json`)
runs `pnpm compile` automatically whenever an `item.json` is edited, so the manifests never go
stale from a manual edit. You still run `pnpm compile` yourself in non-Claude workflows.

## Directory Layout

```
registry/
├── manifest.json              # Generated index: version + per-type { file, count } + labels
├── labels.json                # Source of truth for the label catalogue (hand-edited or set-labels)
├── skills/
│   ├── manifest.json          # Generated: all skill items
│   └── <slug>/
│       ├── item.json          # Source of truth for one item
│       ├── SKILL.md           # Skill content (first-party items only)
│       └── references/        # Supporting files (first-party items only)
├── plugins/                   # Plugin item.json files + manifest.json
├── hooks/                     # Hook content + item.json + manifest.json
├── agents/                    # manifest.json (may be empty)
├── mcp/                       # manifest.json (note: NOT "mcps")
├── settings/                  # manifest.json (note: NOT "settingss")
└── commands/                  # manifest.json

.agents/skills/                # Local dev skill definitions (not the published registry)
```

Folder names are the type name pluralized, **except** `mcp` and `settings`, which are used
as-is. The one implementation is `typeDirName()` in `@seedr/registry-ops`
(`packages/registry-ops/src/paths.ts`) — import it rather than appending `s` by hand, and
never add another copy.

## Mutations go through `@seedr/registry-ops`

Adding, updating and removing items is deterministic code in `packages/registry-ops`, driven
from `scripts/registry-op.ts` (`run`, `list`, `hash`, `validate`, `identity`). Every mutation
is a transaction: clean worktree required, apply, compile, verify that only the item's paths
and the manifests changed, roll back otherwise. `(type, slug)` is the key; `update` and
`remove` must present the item's current state hash. The validator in `validate.ts` is the
single definition of a valid item — `compile`, the commit gate and the skills all use it.

## Manifest Format (v2.0.0)

Three kinds of generated files:

**`registry/manifest.json`** — lightweight index, never contains item data:

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

`labels` is a verbatim copy of `registry/labels.json`, so one fetch of the index gives a
consumer both the type descriptors and the catalogue every item's `label` resolves against.

**`registry/<type>/manifest.json`** — all items of one type:

```json
{
  "type": "skill",
  "items": [{ "slug": "pdf", "name": "PDF", "type": "skill", "sourceType": "seedr", ... }]
}
```

Per-type manifests strip `longDescription` (loaded on demand from `item.json`), and plugin
manifests also strip `contents`. An item's `label` is kept — it is card-level data, needed to
render and filter a list.

## `item.json` Fields

| Field | Required | Notes |
|-------|----------|-------|
| `slug` | Yes | Directory name; unique per type |
| `name` | Yes | Display name |
| `type` | Yes | `skill`, `plugin`, `hook`, `agent`, `mcp`, `settings`, `command` |
| `description` | Yes | One-sentence summary |
| `longDescription` | Yes | TL;DR for the detail page (see registry-descriptions.md) |
| `sourceType` | Yes | `seedr`, `community`, or `official` — the vocabulary lives in `packages/registry-ops/src/sourceTypes.ts` |
| `compatibility` | Yes | Non-empty subset of `claude`, `copilot`, `antigravity`, `codex`, `opencode` (`gemini` is accepted only as a deprecated alias of `antigravity`; never write it) — the vocabulary lives in `packages/registry-ops/src/agents.ts`. A synced plugin starts with what `derivePluginCompatibility` derives from its bundle — every agent that can hold each component it carries; OpenCode only ever by hand — and the sync then treats the field as curated, so widening or narrowing it in `item.json` sticks |
| `author` | Yes | `{ name, url? }` |
| `externalUrl` | Community | GitHub URL the CLI fetches content from at install time |
| `label` | No | Slug of one entry in `registry/labels.json`. Absent means unlabelled |

## The Label Catalogue

One registry serves several projects, so an item may carry **one** `label` — a slug like
`project-x` or `general`. The display name and colour are defined once, in
`registry/labels.json`:

```json
{ "version": 1, "labels": [{ "slug": "project-x", "name": "Project X", "color": "violet" }] }
```

A label `slug` follows the item slug rule (`SLUG_PATTERN`), and `color` is one of
`LABEL_COLORS` — the twelve badge accents the web app renders (`BadgeColor` in
`apps/web/src/lib/colors.ts`). The vocabulary and the strict parser live in
`packages/registry-ops/src/labels.ts` (`LABEL_COLORS`, `isLabelSlug`, `parseLabels`), exported
from both `@seedr/registry-ops` and its `/pure` entry; `readLabels(registryDir)` is the disk
read. A catalogue that cannot be parsed is an error, never a silently empty list.

Who checks what:

- **`validateItem`** checks the *shape* of `label` only. It stays pure and catalogue-free, so
  it also runs in Studio's webview, where `registry/labels.json` cannot be read.
- **The operations** check that the label *exists*. `add-local`, `add-remote` and `update`
  refuse a label the catalogue does not define, naming it.
- **`set-labels`** replaces the whole catalogue in one transaction and refuses to drop a label
  items still carry, naming those items — a silently orphaned label is the bug it prevents.

Change the catalogue through the operation, not by hand:

```json
{ "v": 1, "kind": "set-labels", "labels": [{ "slug": "project-x", "name": "Project X", "color": "violet" }] }
```

An `update` patch sets the label with a slug and clears it with `null` (an operation travels as
JSON, which drops `undefined` keys); a patch that omits `label` leaves the current one alone.

## Sync vs Compile

- **`pnpm sync`** (`scripts/sync.ts`): re-fetches `community` and Anthropic `official` items
  from their GitHub repos, writes each as `item.json`, then calls `compileManifest()`.
  First-party items are never touched. Do **not** run sync as part of `build`.
- **`pnpm compile`** (`scripts/compile-manifest.ts`): assembles `item.json` files into the
  generated manifests. Fast, offline, no network.

## Adding / Removing Items

Use the skills rather than editing manifests directly:

- `/add-seedr <path>` — copies first-party content into `registry/<type dir>/<slug>/`
- `/add-community <github-url>` — metadata-only entry with `externalUrl`
- `/update-item <type> <slug> <instruction>` — patch a first-party item's metadata or content
- `/remove-seedr <slug>` / `/remove-community <slug>`

All five call `scripts/registry-op.ts`; none copies, deletes or compiles on its own.

## Dev vs Production

- **Dev**: `.agents/skills/` holds local skill definitions for testing this repo (`.claude/skills/` links to it).
- **Web app**: imports the per-type `manifest.json` files at build time and assembles them.
- **CLI**: tries the local registry first, falls back to GitHub raw for content.
