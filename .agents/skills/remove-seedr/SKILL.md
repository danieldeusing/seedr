---
name: remove-seedr
description: |
  Remove a first-party item from the seedr registry.
  Trigger on: "/remove-seedr <slug>", "remove seedr item", "delete seedr skill/hook/agent/plugin".
  Finds the item by (type, slug) through the operations CLI, confirms with the user, and removes
  it through a transaction that deletes the directory, recompiles the manifests and rolls back
  on any failure.
---

# Remove Seedr Item

Remove a first-party (`seedr`) item from the seedr registry.

All registry mutations go through `scripts/registry-op.ts` (`@seedr/registry-ops`). Never
`rm` a registry directory or run `pnpm compile` by hand in this workflow — the transaction does
both, and undoes both if anything fails.

## Workflow

### 1. Parse the argument

Extract `<slug>` from the user's input (e.g. `/remove-seedr pre-commit-lint`). The user may
also give a type (`/remove-seedr skill pre-commit-lint`).

### 2. Look up the item

```bash
npx tsx scripts/registry-op.ts list
```

Prints every item as JSON: `type`, `slug`, `sourceType`, `name`, `hash`. Find the entries whose
`slug` matches. **`(type, slug)` is the key** — the same slug can exist under two types (e.g. a
skill and a plugin). If more than one matches and the user gave no type, ask which one with
AskUserQuestion.

Verify the item is first-party: its `sourceType` reads `seedr`. If it is `community` or
`official`, tell the user:
> "Found `<slug>` (`<type>`) but it has sourceType `<actual>`, not `seedr`. Use `/remove-community` instead."

If nothing matches:
> "No item with slug `<slug>` found in the registry."

Keep the `hash` of the chosen entry — the remove operation must present it.

### 3. Confirm with the user

Show the item's name, type and directory and ask with AskUserQuestion:

```
questions:
  - question: "Remove '<name>' (<type>) from the registry? This deletes registry/<type dir>/<slug>/ and its manifest entry."
    header: "Confirm"
    options:
      - label: "Yes, remove it"
        description: "Delete the item directory and recompile the manifests"
      - label: "No, cancel"
        description: "Keep the item unchanged"
```

If the user selects "No, cancel", abort with a message.

### 4. Remove through the operations CLI

Write the operation to a temporary file (use the Write tool; any path outside the repo, e.g.
the OS temp directory):

```json
{
  "v": 1,
  "kind": "remove",
  "type": "<type>",
  "slug": "<slug>",
  "sourceType": "seedr",
  "expectedHash": "<hash from step 2>"
}
```

Then run:

```bash
npx tsx scripts/registry-op.ts run --op <path-to-that-file>
```

The transaction checks that the worktree is clean, that the item still matches `expectedHash`,
deletes the directory, recompiles the manifests, verifies that only the item's paths and the
manifests changed, and rolls back on any failure. It prints a JSON result with `changedPaths`.

**If it refuses because the worktree is dirty:** tell the user to commit or stash their other
changes first — the operation will not mix its diff with theirs. Do not work around this.

### 5. Print summary

- Removed: `<name>` (`<type>/<slug>`)
- Changed paths: from the result's `changedPaths`
- Remind the user to review `git status` and commit

## Important notes

- Only removes first-party items — refuse community/official items via this skill
- Always confirm before deleting — no `--force` shortcut
- The `expectedHash` guard means an item that changed between `list` and `run` is refused:
  re-run `list` and try again
- **Do NOT edit `manifest.json` directly** — it is compiled output; the transaction regenerates it
