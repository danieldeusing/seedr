---
paths:
  - registry/**
  - .claude/skills/**
  - packages/cli/src/config/registry.ts
  - apps/web/src/lib/registry.ts
  - scripts/compile-manifest.ts
  - scripts/sync.ts
---

# Registry Structure

## Source of Truth

Each item's editable source of truth is a single `item.json` file. Running `pnpm compile`
(`scripts/compile-manifest.ts`) reads every `item.json` and assembles the index and per-type
manifests. The `manifest.json` files are **generated** — never hand-edit them.

A `PostToolUse` hook (`.claude/hooks/compile-on-item-edit.sh`, wired in `.claude/settings.json`)
runs `pnpm compile` automatically whenever an `item.json` is edited, so the manifests never go
stale from a manual edit. You still run `pnpm compile` yourself in non-Claude workflows.

## Directory Layout

```
registry/
├── manifest.json              # Generated index: version + per-type { file, count }
├── skills/
│   ├── manifest.json          # Generated: all skill items
│   └── <slug>/
│       ├── item.json          # Source of truth for one item
│       ├── SKILL.md           # Skill content (toolr items only)
│       └── references/        # Supporting files (toolr items only)
├── plugins/                   # Plugin item.json files + manifest.json
├── hooks/                     # Hook content + item.json + manifest.json
├── agents/                    # manifest.json (may be empty)
├── mcp/                       # manifest.json (note: NOT "mcps")
├── settings/                  # manifest.json (note: NOT "settingss")
└── commands/                  # manifest.json

.claude/skills/                # Local dev skill definitions (not the published registry)
```

Folder names are the type name pluralized, **except** `mcp` and `settings`, which are used
as-is. `scripts/compile-manifest.ts` and `scripts/sync.ts` share a `typeDirName()` helper for
this — use it rather than appending `s` by hand.

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
  }
}
```

**`registry/<type>/manifest.json`** — all items of one type:

```json
{
  "type": "skill",
  "items": [{ "slug": "pdf", "name": "PDF", "type": "skill", "sourceType": "toolr", ... }]
}
```

Per-type manifests strip `longDescription` (loaded on demand from `item.json`), and plugin
manifests also strip `contents`.

## `item.json` Fields

| Field | Required | Notes |
|-------|----------|-------|
| `slug` | Yes | Directory name; unique per type |
| `name` | Yes | Display name |
| `type` | Yes | `skill`, `plugin`, `hook`, `agent`, `mcp`, `settings`, `command` |
| `description` | Yes | One-sentence summary |
| `longDescription` | Yes | TL;DR for the detail page (see registry-descriptions.md) |
| `sourceType` | Yes | `toolr`, `community`, or `official` |
| `compatibility` | Yes | e.g. `["claude"]` |
| `author` | Yes | `{ name, url? }` |
| `externalUrl` | Community | GitHub URL the CLI fetches content from at install time |

## Sync vs Compile

- **`pnpm sync`** (`scripts/sync.ts`): re-fetches `community` and Anthropic `official` items
  from their GitHub repos, writes each as `item.json`, then calls `compileManifest()`. Toolr
  items are never touched. Do **not** run sync as part of `build`.
- **`pnpm compile`** (`scripts/compile-manifest.ts`): assembles `item.json` files into the
  generated manifests. Fast, offline, no network.

## Adding / Removing Items

Use the skills rather than editing manifests directly:

- `/add-toolr <path>` — copies first-party content into `registry/<type>/<slug>/`
- `/add-community <github-url>` — metadata-only entry with `externalUrl`
- `/remove-toolr <slug>` / `/remove-community <slug>`

## Dev vs Production

- **Dev**: `.claude/skills/` holds local skill definitions for testing this repo.
- **Web app**: imports the per-type `manifest.json` files at build time and assembles them.
- **CLI**: tries the local registry first, falls back to GitHub raw for content.
