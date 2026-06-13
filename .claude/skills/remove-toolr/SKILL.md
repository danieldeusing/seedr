---
name: remove-toolr
description: |
  Remove a toolr-sourced item from the seedr registry.
  Trigger on: "/remove-toolr <slug>", "remove toolr item", "delete toolr skill/hook/agent/plugin".
  Looks up the item by slug in registry/manifest.json (sourceType: "toolr"), confirms with the user,
  deletes local files from registry/<type>s/<slug>/, and removes the manifest entry.
---

# Remove Toolr Item

Remove a toolr-sourced item from the seedr registry by slug.

## Workflow

### 1. Parse the argument

Extract `<slug>` from the user's input (e.g. `/remove-toolr pre-commit-lint`).

### 2. Look up the item

Search for `registry/*/slug/item.json` files to find the item. Read the matching `item.json` and verify `sourceType === "toolr"`.

**If not found:** Check if the slug exists with a different `sourceType`. If so, tell the user:
> "Found `<slug>` but it has sourceType `<actual>`, not `toolr`. Use `/remove-community` instead."

If the slug doesn't exist at all, error:
> "No item with slug `<slug>` found in the registry."

### 3. Confirm with the user

Show item details and ask for confirmation using AskUserQuestion:

```
questions:
  - question: "Remove '<name>' (<type>) from the registry? This will delete local files and the manifest entry."
    header: "Confirm"
    options:
      - label: "Yes, remove it"
        description: "Delete registry/<type>s/<slug>/ and remove from manifest.json"
      - label: "No, cancel"
        description: "Keep the item unchanged"
```

If the user selects "No, cancel", abort with a message.

### 4. Delete directory and recompile

Remove the directory at `registry/<type>s/<slug>/` using:

```bash
rm -rf registry/<type>s/<slug>/
```

Where `<type>s` is the pluralized type from the item (e.g. `skills`, `hooks`, `plugins`).

Verify the directory no longer exists.

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

- Only removes items with `sourceType: "toolr"` — refuse to remove community items via this skill
- Always confirm before deleting — no `--force` shortcut
- If the local directory doesn't exist (already deleted), proceed with manifest removal anyway and note it
- **Do NOT edit `manifest.json` directly** — it is a compiled output generated from individual `item.json` files. Always delete the `item.json` (and its directory) and then run `pnpm compile` to regenerate the manifest. Manual edits to `manifest.json` will be overwritten on the next build or sync.
