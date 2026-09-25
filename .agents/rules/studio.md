---
paths:
  - apps/studio/**
---

# Seedr Studio (`apps/studio`)

A desktop capability manager for a seedr checkout, wearing the estate look on configr's
structure: an overlay title bar (the strip IS the macOS title bar), and a searchable
explorer with collapsible type groups whose rows show ownership (pencil = first-party/editable,
eye = synced/read-only) and the supported agents' brand marks — a footer dropdown flips the
rows to the text form (`rw-` · `cgaxo`), next to the theme dropdown. The explorer header's
refresh button checks every synced capability against its source through `registry-op.ts
upstream-status` — the daily sync's question, asked by hand — and marks the ones the next
sync would change. Each item's detail
pairs a resizable, collapsible metadata pane (stacking on narrow panes) — whose two dates are kept apart, `lastUpdated` being this checkout's last commit touching the item and `sourceUpdated` the source's last change of the content, with how far the source has moved on once the up-to-date check has found it behind — with a Monaco file
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
`claude -p --output-format stream-json --verbose --allowedTools …` line by line. A job names what it may do — read, edit, search, skills, web, shell — and each
adapter spells that in its own CLI's tool names, because they do not agree
(Claude's `Read` is Copilot's `view`). Authoring runs the maintainer's own
tooling, so its shell is open; `git` is denied alongside it, so a job still
cannot commit, push or rewrite history — and it must end with `ADDED
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
