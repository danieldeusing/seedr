---
name: remove-community
description: |
  Remove a community-sourced item from the seedr registry.
  Trigger on: "/remove-community <slug>", "remove community item", "delete community plugin/skill".
  Looks up the item by slug in registry/manifest.json (sourceType: "community"), confirms with the user,
  and removes the manifest entry. No local files to delete — community items are metadata-only.
---

# Remove Community Item

Remove a community-sourced item from the seedr registry by slug.

## Workflow

### 1. Parse the argument

Extract `<slug>` from the user's input (e.g. `/remove-community superpowers`).

### 2. Look up the item

Search for `registry/*/slug/item.json` files to find the item. Read the matching `item.json` and verify `sourceType === "community"`.

**If not found:** Check if the slug exists with a different `sourceType`. If so, tell the user:
> "Found `<slug>` but it has sourceType `<actual>`, not `community`. Use `/remove-toolr` instead."

If the slug doesn't exist at all, error:
> "No item with slug `<slug>` found in the registry."

### 3. Confirm with the user

Show item details and ask for confirmation using AskUserQuestion:

```
questions:
  - question: "Remove '<name>' (<type>) from the registry? This will remove the manifest entry."
    header: "Confirm"
    options:
      - label: "Yes, remove it"
        description: "Remove from manifest.json (no local files to delete)"
      - label: "No, cancel"
        description: "Keep the item unchanged"
```

If the user selects "No, cancel", abort with a message.

### 4. Delete item directory and recompile

Remove the directory at `registry/<type>s/<slug>/`:

```bash
rm -rf registry/<type>s/<slug>/
```

Then recompile the manifest:
```bash
npx tsx scripts/compile-manifest.ts
```

### 5. Print summary

Print:
- Removed: `<name>` (`<slug>`, type: `<type>`)
- Deleted: `registry/<type>s/<slug>/`
- Manifest recompiled
- Remind user to commit and push

## Important notes

- Only removes items with `sourceType: "community"` or `sourceType: "official"` — refuse to remove toolr items via this skill
- Always confirm before removing — no `--force` shortcut
- Items removed this way will NOT reappear after `pnpm sync` unless they match a freshly synced item from the Anthropic registry
- **Do NOT edit `manifest.json` directly** — it is a compiled output generated from individual `item.json` files. Always delete the `item.json` (and its directory) and then run `pnpm compile` to regenerate the manifest. Manual edits to `manifest.json` will be overwritten on the next build or sync.
