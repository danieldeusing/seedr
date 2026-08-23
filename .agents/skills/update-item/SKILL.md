---
name: update-item
description: |
  Update a first-party (toolr) item in the seedr registry: its metadata, its descriptions, or
  its content files. Trigger on: "/update-item <type> <slug> <instruction>", "update item",
  "revise the description of", "change the skill content of". Drafts the change, shows it, and
  applies it through a transaction that validates the result, recompiles the manifests and
  rolls back on any failure. Synced (community/official) items are refused — the next sync
  would overwrite the edit.
---

# Update Item

Change an existing first-party item without removing and re-adding it.

All registry mutations go through `scripts/registry-op.ts` (`@seedr/registry-ops`). Never edit
`item.json` or content files directly in this workflow, and never run `pnpm compile` by hand —
the transaction writes, compiles, verifies and rolls back as one unit.

## Workflow

### 1. Parse the arguments

`/update-item <type> <slug> <instruction>` — e.g.
`/update-item skill pdf tighten the longDescription and mention the new OCR script`.
If the type is missing, resolve it in step 2; if the instruction is missing, ask for it.

### 2. Read the item

```bash
npx tsx scripts/registry-op.ts list
```

Find the `(type, slug)` entry (ask with AskUserQuestion if the slug exists under several types)
and keep its `hash`. It must be `sourceType: "toolr"`; otherwise stop:
> "`<slug>` (`<type>`) is a synced `<sourceType>` item — edits would be overwritten by the next
> sync. Change it upstream instead."

Read `registry/<type dir>/<slug>/item.json` and every content file under that directory so
you understand what the item does before changing how it is described.

### 3. Draft the change

Apply the instruction to produce:

- a **patch** — only the `item.json` fields that change (`name`, `description`,
  `longDescription`, `compatibility`, `targetScope`, `author`, `externalUrl`, `featured`,
  `contents.triggers`). `slug`, `type` and `sourceType` cannot change: that is a remove plus an
  add.
- optional **content edits** — whole-file contents for files inside the item directory, by path
  relative to it (e.g. `SKILL.md`, `references/guide.md`).

Descriptions must follow `.agents/rules/registry-descriptions.md`: `description` one sentence
leading with what it does; `longDescription` 30–90 words, concrete, with backticks for file
names, commands and code identifiers.

### 4. Show the change and confirm

Present before/after for every patched field and a summary of each content edit, then ask:

```
questions:
  - question: "Apply this update to '<name>' (<type>/<slug>)?"
    header: "Confirm"
    options:
      - label: "Yes, apply it"
        description: "Write the patch and content edits through a transaction"
      - label: "Edit first"
        description: "I want to change the draft"
      - label: "Cancel"
        description: "Leave the item unchanged"
```

### 5. Apply through the operations CLI

Write the operation to a temporary file (use the Write tool; any path outside the repo):

```json
{
  "v": 1,
  "kind": "update",
  "type": "<type>",
  "slug": "<slug>",
  "expectedHash": "<hash from step 2>",
  "patch": { "<field>": "<new value>" },
  "contentEdits": [{ "path": "<relative path>", "content": "<whole file>" }]
}
```

Omit `contentEdits` when there are none. Then run:

```bash
npx tsx scripts/registry-op.ts run --op <path-to-that-file>
```

The transaction requires a clean worktree, refuses a stale `expectedHash`, validates the patched
item in full (including the description rule), writes, recompiles the manifests, verifies that
only the item's paths and the manifests changed, and rolls back otherwise. A validation
failure is printed verbatim — fix the draft and run again; never bypass it.

### 6. Print summary

- Updated: `<name>` (`<type>/<slug>`) — fields changed, files edited
- Changed paths: from the result's `changedPaths`
- Remind the user to review `git status` and commit

## Important notes

- toolr items only; synced items are refused by the operation itself
- One item per run; several items are several runs
- Never hand-patch a failed validation into passing — the rules are the same ones the commit
  gate enforces
