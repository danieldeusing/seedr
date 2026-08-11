---
name: add-private
description: |
  Add content (skills, hooks, agents, plugins, MCP servers, settings, commands) to an
  out-of-tree PRIVATE seedr registry (the SEEDR_PRIVATE_REGISTRY directory — see
  docs/self-hosting.md, Step 3 Option A). Trigger on: "/add-private <path>",
  "add private item", "add this to the private/internal registry".
  Same flow as /add-toolr, but the item lands outside this repo, gets
  sourceType "private", and needs no pnpm compile — the web build bundles it.
---

# Add Private Item

Add an item to an out-of-tree private registry from a local filesystem path. The item is
bundled into a self-hosted instance at web-build time; it never touches this repo's
`registry/` or the generated manifests.

## Workflow

Follow `/add-toolr`'s workflow (`.claude/skills/add-toolr/SKILL.md`) — parse the path,
detect the content type, derive the slug, ask the identity/scope/compatibility questions,
read the source content, and write both descriptions per
`.claude/rules/registry-descriptions.md`. Apply these deltas:

### Target directory (instead of `registry/`)

1. If `SEEDR_PRIVATE_REGISTRY` is set in the environment, use it.
2. Otherwise ask the user for the private registry directory (AskUserQuestion, free text).

Copy content to `<private-registry>/<type dir>/<slug>/` — type dirs are pluralized
except `mcp` and `settings` (same convention as `registry/`).

### item.json deltas

```json
{
  "slug": "<slug>",
  "name": "<name from user>",
  "type": "<detected type>",
  "description": "<short description>",
  "longDescription": "<detailed description>",
  "compatibility": ["<from user answers>"],
  "sourceType": "private",
  "author": { "name": "<ask the user — their company or personal name>" },
  "updatedAt": "<current ISO 8601 date>"
}
```

- `sourceType` is always `"private"`.
- `author` is asked, never hardcoded — private registries belong to whoever runs them.
- **No `contents` field**: the build derives the file tree from the files sitting next
  to `item.json`. Only write `contents` when the user wants to override that tree, or
  for hook `triggers` (same extraction as /add-toolr step 5).
- **No `externalUrl`** unless the user has a raw-content URL reachable inside their
  network (their internal Git host) — without it the detail page shows the file tree
  but no file-content previews.
- `slug` and `type` MUST match the directory layout — the web build validates this and
  fails loudly on a mismatch.

### No compile step

Do NOT run `pnpm compile` — private items are not part of the generated manifests.
Instead finish with:

1. Spawn the `registry-item-reviewer` agent on the new `item.json`.
2. Remind the user to rebuild their private instance so the item appears
   (`SEEDR_PRIVATE_REGISTRY=<dir> pnpm --filter @seedr/web build`, or their
   instance's update script).
3. If the private registry directory is a git repo, remind them to commit there.
