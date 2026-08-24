---
name: audit-descriptions
description: |
  Audit registry item.json files for missing or low-quality descriptions.
  Trigger on: "/audit-descriptions", "check descriptions", "audit longDescription".
  Scans all registry/*/*/item.json files, reports missing longDescription fields,
  reads item content to generate descriptions following project rules, and offers
  to fix them interactively.
---

# Audit Registry Descriptions

Scan all registry items and fix missing or incomplete `description` / `longDescription` fields.

## Workflow

### 1. Scan all item.json files

Find every `registry/*/*/item.json` file using Glob. For each, read the JSON and check:

- Does `description` exist and is it non-empty?
- Does `longDescription` exist and is it non-empty?

### 2. Report findings

Print a summary table:

```
Status | Slug                  | Type   | description | longDescription
-------|-----------------------|--------|-------------|----------------
OK     | design-patterns       | skill  | 46 chars    | 403 chars
MISS   | some-new-item         | plugin | 85 chars    | MISSING
BAD    | another-item          | skill  | MISSING     | MISSING
```

Categories:
- **OK** — both fields present
- **MISS** — `longDescription` missing (most common)
- **BAD** — `description` also missing or empty

If all items pass, print "All items have descriptions" and stop.

### 3. Fix missing descriptions

For each item missing `longDescription` (or `description`):

1. **Read the item's actual content** to understand what it does:
   - For skills: read `SKILL.md` in the item's directory or fetch from `externalUrl`
   - For plugins: read `plugin.json`, any `README.md`, and skill/agent files listed in `contents`
   - For hooks: read the hook script file
   - For community items (no local files): use `gh api` to fetch content from the `externalUrl` GitHub path

2. **Generate descriptions** following these rules:

   **`description`** — answers "What does this do?"
   - One clear sentence about the core capability
   - Lead with what it *does*, not what it *is*
   - No trigger instructions, no title restatements

   **`longDescription`** — answers "Should I install this?" with implementation-level detail.
   - Name specific files, scripts, modules, agents, and commands included (e.g. "Ships with recalc.py for formula recalculation" not "includes formula support")
   - Include exact counts: number of patterns, rules, themes, agents, commands, skills
   - Describe the technical approach or architecture
   - List concrete capabilities by name, not by category
   - No filler, no marketing speak — just the implementation facts
   - 3-5 sentences, typically 50-90 words (minimum 30 words, enforced by pre-commit hook)

3. **Present to user for approval** before writing:

   ```
   === some-new-item (plugin) ===
   description: "Current short description here"
   longDescription (NEW): "Generated long description here"

   Accept? [y/n/edit]
   ```

   Use AskUserQuestion:
   ```
   questions:
     - question: "Accept this longDescription for <slug>?\n\n'<generated longDescription>'"
       header: "<slug>"
       options:
         - label: "Accept"
           description: "Write this longDescription to item.json"
         - label: "Edit"
           description: "Provide your own longDescription"
         - label: "Skip"
           description: "Skip this item for now"
   ```

4. **Write the approved longDescription** to the item.json file. Ensure `longDescription` is placed immediately after `description` in the JSON key order.

### 4. Recompile manifest

After all fixes are applied, recompile the manifest:

```bash
pnpm compile
```

### 5. Summary

Print how many items were fixed, skipped, and still need attention.

## Important notes

- Never overwrite an existing `longDescription` — only add missing ones
- For community items without local files, fetch content via GitHub API using the `externalUrl`
- If you can't determine enough about an item to write a good `longDescription`, skip it and tell the user
- Run `pnpm compile` once at the end, not after each individual fix
