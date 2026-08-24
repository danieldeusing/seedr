# Seedr Studio — Implementation Plan

> **Status:** P0–P6 are implemented on top of `18ee3ce` (2026-08-22/23): registry-ops,
> the operations CLI, the agent-neutral tooling layout, Studio (Explorer, Author, Update,
> Remove, Git status, Test), the Claude adapter and the P6 probes, and Workstream **B1**
> (`antigravity` canonical, `gemini` a resolved alias) across CLI, web, the Pages function,
> the sync and Studio. **Implementation notes — where reality differed from this document:**
>
> - §2.6: configr lives at `~/Work/twiced/toolr/configr`, not under `apps/`.
> - §6.2: the installed agents on the implementation machine were Claude Code 2.1.226, `agy`
>   1.1.11, Copilot 1.0.78, codex 0.147.0, opencode 1.18.16 — every row is version-pinned,
>   re-probe before P6 work. Claude Code 2.1.x has `--json-schema`; the adapter uses it with
>   `--max-turns 1` as the tool-free bound.
> - §2.2: at `0cff1f0` the committed `registry/mcp/manifest.json` was hand-edited (it carries
>   `longDescription` and lacks `contentHash`); `pnpm compile` corrects it, and that
>   correction is committed with this work.
> - §6.1: `@seedr/registry-ops` is **source-exported** (no build step) so `pnpm compile` and
>   the agent hook work on a fresh clone; `paths.ts` is split from `fsPaths.ts` so the
>   webview can import the path vocabulary and the validator via `@seedr/registry-ops/pure`.
>   All four `typeDirName` copies are gone: the CLI and the web app import it too (the CLI
>   bundles the package with tsup's `noExternal`, the Pages function through wrangler).
> - §5 / B1: the CLI keeps `gemini` as an alias everywhere (`--agents gemini` installs to
>   `.agents/` with a one-line notice, `gemini,agy` is one agent), the web app canonicalises
>   compatibility on load, the sync still writes both ids for new items so the CLI already on
>   npm matches them. **B2 is prepared, not run:** `scripts/migrate-agent-ids.ts` rewrites
>   the 31 items that carry `gemini` (verified on a copy) and is to be run after the B1 CLI
>   is published.
> - §6.5: the Test action runs the checkout's own CLI (`node node_modules/tsx/dist/cli.mjs
>   packages/cli/src/cli.ts add … --agents all --scope project --method copy --yes`) in a
>   scratch directory the host creates and removes, then compares what was written with the
>   item's files; it is offered for first-party items only — synced items install from their
>   upstream repository, which is the network check this revision does **not** ship (§6.5's
>   baseline design has no first-party user yet). The CLI's registry base became configurable
>   for forks on the way (`SEEDR_REGISTRY_URL`, `SEEDR_REGISTRY_DIR`).
> - §4 / §12: Windows remains unexecuted locally; the CI matrix runs `pnpm install`
>   (junctions), the registry-ops suite and the Studio host's Rust tests — including the
>   real-install test of the Test action — on windows-latest, so the first push answers it.
> - A nine-lens adversarial review of the two commits (2026-08-24) led to a fix pass:
>   worktree-safe transaction lock (`git rev-parse --absolute-git-dir`), exact rollback
>   (`clean -fdqx`) that keeps the original error visible, `add-local` dereferences
>   symlinks and drops gitignored files, `update` merges `contents` patches and refuses
>   drive-letter/backslash/symlinked edit paths, both ops write canonical agent ids,
>   symlinks are never content, the Windows tree kill drops the kill-on-close job
>   (`win32job` has no `terminate`), withdrawn cancel marks, a program allowlist and
>   canonical picked paths on the host, capability grants trimmed to `core:default`,
>   the Studio coverage thresholds enforced by `vitest run --coverage`, a real
>   byte-for-byte manifest test, a child-process test of `scripts/registry-op.ts`,
>   update/remove hash guards captured when the form opens (not at apply), `-z`
>   porcelain, sidebar scrolling, pane focus, live status regions, a theme switch,
>   `(type, slug)` keying in `sync.ts`, `.gitattributes` pinning `registry/**` to LF,
>   and the sync writing only agent ids the published CLI understands.
> - Still deliberately absent, recorded here: §6.6's committed policy file and per-user
>   preference store, and §6.7's first-run screen — Studio starts at the folder picker
>   and `SEEDR_STUDIO_REPO` covers the dev loop. `command`-type authoring is not offered
>   (the CLI has no handler for it, trap 12). Installs made under `.gemini/` by CLI
>   ≤0.1.87 are not managed by the B1 CLI — remove them with that CLI or by hand.
> - The "real session sees every skill" acceptance was demonstrated inside the implementing
>   session (harness re-scan of all skills, subagent launched through the link); a *fresh*
>   `claude -p` could not authenticate from inside a session. Window captures of the running
>   Studio proved the Explorer and the watcher; macOS later withdrew screen-capture
>   permission from the implementing host, so the Test pane is proven by its tests only.
>
> Original status: planned, not started.
> **Revision 2** (2026-08-22), rewritten in response to
> [`seedr-studio-plan-review.md`](./seedr-studio-plan-review.md). Revision 1 was judged
> unsafe to execute (1.75/5); its central premise — driving prose skills through five
> auto-approved shell-enabled agents — has been **replaced**, not patched. Read §3.1 if
> you want the one-paragraph version of what changed and why.
>
> **Baseline commit:** `4e8f342` on `origin/main`. All counts and file:line references
> below were verified against that commit on 2026-08-22. Re-verify before starting; §9
> gives commands that derive counts rather than trusting them.

---

## 0. Read this first

You are implementing a desktop app (**Seedr Studio**) inside the existing **seedr**
monorepo, plus prerequisite work on the repo itself.

| | Workstream | Gate |
|---|---|---|
| **A** | Agent-neutral dev tooling (`.agents/` + `AGENTS.md`) | Independent; ship first |
| **B** | Replace the `gemini` coding agent with `antigravity`, **staged** | Must not break published CLI clients — see §5 |
| **C** | Deterministic registry operations + Seedr Studio | Depends on A; §6.1 must land before any UI |

Do not start C's UI until `pnpm lint`, `pnpm typecheck` and the CLI test suite pass with
A landed and §6.1's operations layer in place.

**The single most important thing to understand:** Studio does **not** ask an AI agent to
copy files, delete directories, or run `pnpm compile`. Host code does that,
deterministically and testably. The agent is used only to *generate metadata* under a
bounded, tool-free, structured-output contract. §3.1 explains why.

---

## 1. Intent

### The problem

seedr is a registry of AI-coding-agent capabilities (skills, hooks, agents, plugins, MCP
servers, settings, commands). Authoring an item today means opening Claude Code in the
repo, typing `/add-toolr <path>`, answering interactive questions, and remembering to
commit. There is no single place to see the registry, extend it, revise it, test it and
ship it.

### The product

**Seedr Studio** — a small cross-platform desktop app; a *capability manager* for a seedr
registry. It:

- **explores** what the registry offers, grouped by capability type, with a read-only viewer;
- **adds / updates / removes** capabilities through deterministic operations, using an AI
  agent only to draft metadata;
- **tests** a capability by really installing it into a temporary directory;
- **shows status and diff** so the user can commit with confidence.

It is a developer tool for the maintainer of a seedr fork — not an end-user app. seedr is
open source and MIT; **nothing may be hardcoded to the upstream author's paths, accounts,
branches or credentials** (§6.6).

### Design rules (owner's, in priority order)

1. Simplicity — boring solutions over clever ones
2. Open source ⇒ high-quality code
3. Maintainability
4. Clean UI
5. Clean code
6. High test coverage — **real tests, no bypasses**

Cross-cutting, non-negotiable: **macOS, Windows and Linux**, and **fork safety**.

### Scope boundaries

- Not a general file explorer; shows only what seedr offers.
- File viewing is **read-only** + "open with the OS default application".
- **One operation at a time.** No parallel execution.
- **Run from source** (`tauri dev`). No signed installers; keep bundle config valid so
  packaging can be added later.
- **English only** for v1 — declared, not deferred to an i18n layer nobody asked for.

---

## 2. What exists today

Repo: `/Users/daniel/Work/danieldeusing/apps/seedr` — GitHub `danieldeusing/seedr`, MIT.

### 2.1 The monorepo

pnpm workspaces (`packages/*`, `apps/*`) + Turbo. `packageManager: pnpm@10.34.5`,
`engines.node >= 20`, pinned **only at the root**.

| Package | Path | Notes |
|---|---|---|
| `@danieldeusing/seedr` | `packages/cli` | Published CLI (npm) |
| `@seedr/web` | `apps/web` | seedr.danieldeusing.de |
| `@seedr/shared` | `packages/shared` | **Types only**, zero runtime code, zero deps |

`turbo.json` defines **six** tasks: `build`, `dev`, `lint`, `lint:fix`, `typecheck`,
`clean`. There is **no `test` task and no root `test` script**.

> ⚠️ **`pnpm test install-all` from the repo root exits 0 without running anything.**
> There is no root `test` script, so it silently falls through to the POSIX `test`
> builtin — a false green. Always use `pnpm --filter @danieldeusing/seedr test …` or set
> cwd to `packages/cli`. Studio's test runner must do this.

ESLint is a **single flat config at the repo root**. Its React block is scoped to
`apps/web/**/*.{jsx,tsx}` and must be widened for a new React app.

`apps/web/tsconfig.json` does **not** extend `tsconfig.base.json`; it is standalone with
`@/*` and `@registry/*` paths.

### 2.2 The registry data model

```
registry/
├── manifest.json          # generated index (version + per-type {file, count})
├── skills/     manifest.json + <slug>/item.json (+ content files for toolr items)
├── plugins/    manifest.json + <slug>/item.json
├── hooks/      manifest.json + <slug>/item.json + <slug>.sh
├── mcp/        manifest.json + <slug>/item.json     ← NOT "mcps"
├── settings/   manifest.json                        ← NOT "settingss"
├── agents/     manifest.json
└── commands/   manifest.json
```

Folder = type pluralised **except `mcp` and `settings`**. The helper is `typeDirName()` in
`scripts/compile-manifest.ts`, **duplicated** in `packages/cli/src/config/registry.ts`,
`apps/web/src/lib/registry.ts`, and a fourth variant in **`scripts/sync/anthropic.ts`**.
§6.1 collapses these into one shared implementation — do not add a fifth.

Canonical type: `RegistryItem` in `packages/shared/src/index.ts`.

```ts
type CodingAgent   = "claude" | "copilot" | "gemini" | "codex" | "opencode";  // §5 changes this
type ComponentType = "skill" | "hook" | "agent" | "plugin" | "command" | "settings" | "mcp";
type SourceType    = "official" | "toolr" | "community";
type ScopeType     = "user" | "project" | "local";
type PluginType    = "package" | "wrapper" | "integration";
```

**Counts at `4e8f342`:** 107 items — 37 skills, 66 plugins, 3 hooks, **1 mcp**. Derive
these at runtime; do not hardcode them in acceptance criteria. The MCP item is why the
`registry/<type>s` bug in §2.3 is live rather than theoretical.

**`(type, slug)` is the primary key.** `frontend-design` and `skill-creator` each exist as
both a plugin and a skill. Slug-only lookup is ambiguous. Note `scripts/sync.ts` still
keys several sets by slug alone — a latent bug §6.1 must not copy.

**"Required" is enforced in three places that disagree:**

| Enforcer | Requires |
|---|---|
| the TS interface | `slug`, `name`, `type`, `description`, `compatibility` |
| `scripts/compile-manifest.ts:36` `validateItem()` | non-empty `slug`, valid `type`, valid `sourceType` — *nothing else* |
| `.husky/pre-commit` → `scripts/check-descriptions.sh` | non-empty `description`; `longDescription` **≥ 30 words AND containing a backtick** |

This disagreement is a defect, not a fact of life. §6.1 introduces **one** validator used
by compile, Studio and the commit gate.

`pnpm compile` assembles `item.json` files into generated manifests, stripping
`longDescription` everywhere and `contents` from plugin manifests, and adding
`contentHash` for toolr items. **Never hand-edit a `manifest.json`.**

> ⚠️ **The published CLI reads the registry from `main`, not from a release.**
> `packages/cli/src/config/registry.ts:51` hardcodes
> `https://raw.githubusercontent.com/danieldeusing/seedr/main/registry`. Two consequences:
> a data change merged to `main` reaches **every already-installed CLI immediately**
> (§5), and the URL is upstream-specific, so a fork's CLI still reads upstream data
> (§6.6).

### 2.3 The dev-tooling skills

In `.claude/skills/` (Workstream A moves them). **They are the specification for what the
operations must do — they are not the execution mechanism.** Known defects, all verified:

- **Every add/remove skill blocks on an interactive question**, with direct
  `AskUserQuestion` instructions well past any preamble (e.g. `add-toolr/SKILL.md:43`,
  `add-community/SKILL.md:148`).
- **`registry/<type>s` is used throughout** (`add-toolr:227,239,303`,
  `add-community:269,275,278`, `remove-community:49`) — wrong for `mcp` and `settings`,
  and now live because an MCP item exists.
- **Upstream identity is hardcoded**: `add-toolr/SKILL.md:238-239` writes
  `"author": {"name": "Daniel Deusing", …}` and an `externalUrl` pointing at
  `danieldeusing/seedr/tree/main` into *every* generated item. A fork produces items
  attributed to the upstream author.
- **POSIX-only shell**: `cp -r`, `rm -rf`, `mkdir -p`, `find … | sort`, and `base64 -d`
  (×4) — none guaranteed on Windows.
- Removal is **slug-only** despite duplicate keys.

Supporting pieces: `.claude/agents/registry-item-reviewer.md` (read-only reviewer);
`.claude/hooks/compile-on-item-edit.sh` (`PostToolUse`, **requires `jq` + `pnpm`**, fires
on `Edit|Write|MultiEdit` but **not** on Bash `cp`/`rm`); `.claude/rules/*.md` (6 files);
`.claude/settings.local.json` is gitignored.

`scripts/check-descriptions.sh` requires **bash + python3** — also not guaranteed on
Windows.

### 2.4 Tests, CI, branches

Tests live only in `packages/cli` (vitest, memfs, `src/test/setup.ts` silencing ora/chalk).
At `4e8f342` the suite is ~291 tests, and `install-all` is ~107 — **both derived from the
manifest**, so they move with the data. Do not hardcode.

> ⚠️ **`install-all.test.ts` does not test installation.** It mocks `node:fs/promises`
> (memfs), `node:child_process.execFile`, and the whole registry module — including
> `fetchItemToDestination`, which *fabricates* a source tree from manifest metadata. It
> asserts `results[0].success === true`. It therefore validates **handler wiring**, and
> cannot catch a broken `externalUrl`, missing real content, a wrong converter, or an
> unsupported agent. §6.5 replaces it as Studio's "test" action.

- Single item: `cd packages/cli && pnpm test install-all -t 'pdf \(official\)'` — `-t` is
  a **regex**; escape parens. Test names are `` `${slug} (${sourceType})` `` and so
  **cannot disambiguate duplicate slugs** (§6.5 fixes this).
- `SEEDR_LIVE=true` adds network URL validation (slow). Its pass/fail state must be
  **baselined**, never presented as caused by the user's change.

| Push to | Workflow | Effect |
|---|---|---|
| `main` | `ci.yml` | lint + typecheck + CLI tests. **No deploy — but see the warning below.** |
| `prod` | `deploy.yml` | Cloudflare Pages deploy **and** npm publish (OIDC), then version-bump commits to both branches |
| cron | `sync.yml` | daily re-sync; commits to main *and* prod and triggers a deploy |

> ⚠️ **"No deploy" ≠ "no production effect".** Because the published CLI fetches from
> `main` (§2.2), a registry change pushed to `main` is live for all CLI users at once.

Git rules (`.claude/rules/git-workflow.md`): never `--no-verify`, never cherry-pick
between branches, never amend a pushed commit.

### 2.5 The design system

`@danieldeusing/design` from **npm** in both surfaces: `apps/web` `^0.38.0`
(`/tailwind.css`), configr `^0.27.0` (`/tokens.css`). configr imports **only tokens**
deliberately — the base/component layers fight Tailwind Preflight. Four themes via
`html[data-theme]`.

A `danieldeusing-design` skill exists in this estate; **load it before writing any CSS**.
Treat its availability and the latest published version as unverified until checked.

### 2.6 Reference codebases

- **configr** — `/Users/daniel/Work/danieldeusing/apps/configr`. Tauri v2 + React 19 +
  Vite + zustand + Monaco. The UI/architecture model.
- **toolr-app** — `/Users/daniel/Work/twiced/toolr/toolr-app`. Contains agent-execution
  machinery whose *lessons* are valuable; see §11 for why we copy far less of it than
  revision 1 assumed.

Both are the owner's property and may be copied into seedr (MIT). configr's `LICENSE`
says GPL-3.0 while its `package.json` says UNLICENSED; the owner has confirmed it is
private property and will reconcile that separately. Not a blocker here, but do not copy
a file *because* the plan says it is fine — copy because you read it and it fits.

---

## 3. Decisions

### 3.1 What changed in revision 2, and why

Revision 1 proposed: inline a `SKILL.md` into a prompt, run it through any of five agents
in "auto mode" with shell access at the repo root, and rely on a `## Parameters` block to
suppress the skill's interactive questions. The review rejected this, and verification
confirmed the rejection:

- **The suppression contract is unenforceable.** The skills issue direct
  `AskUserQuestion` instructions deep in their body (`add-toolr:43`,
  `add-community:148`). A preamble asking the model not to ask is a *request*, not a
  guarantee. With `stdin` closed, a violating run can stall, half-apply changes, or exit
  0 having done nothing.
- **"Auto mode" is not uniform, and two agents have no safe setting.** Verified against
  installed binaries: **Antigravity 1.1.12** `--mode` accepts only `accept-edits` or
  `plan` — it approves *edits*, not the shell commands the skills require; the only way
  to auto-approve those is `--dangerously-skip-permissions`. **OpenCode 1.18.21**'s
  `--auto` is self-described as *"auto-approve permissions that are not explicitly denied
  (dangerous!)"*. Uniform safe auto-execution across five agents does not exist.
- **Revision 1's invocation table was wrong.** `codex exec --full-auto` does not exist in
  **codex-cli 0.149.0** (it was carried over from an older version documented in
  toolr-app). Copilot's `--no-ask-user` — the exact feature needed — was missed entirely.
- **The skills cannot run on Windows** (`cp -r`, `rm -rf`, `base64 -d`, `find | sort`),
  and neither can the compile hook (`jq`) or the commit gate (`bash` + `python3`).
- **There was no transaction boundary.** A cancelled or timed-out run could leave copied
  files, deleted directories and stale manifests behind, mixed into whatever the user
  already had uncommitted.

**The replacement:** the operations become ordinary, deterministic code (§6.1), shared by
Studio *and* the skills, so there is still exactly one implementation. The agent's job
shrinks to what it is actually good at — drafting `description`/`longDescription` and
classifying content — under a tool-free, structured-output contract whose result is
validated before anything touches disk (§7).

This is simpler (rule 1), testable (rule 6), portable (Windows), and faster: copying a
directory takes milliseconds instead of a 90-second agent turn.

### 3.2 Settled decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Name **Seedr Studio**, `apps/studio`, `@seedr/studio` | Neutral for forks |
| 2 | **Tauri v2 + React 19 + Vite + zustand** | Proven in-estate (configr) |
| 3 | **Run from source**; keep bundle config valid | The app edits a checked-out repo, so you have it cloned anyway |
| 4 | **Read-only viewer**; open externally with the **OS default** | No dirty-state or conflict logic. *Changed:* no 15-editor opener table (§8) |
| 5 | **One operation at a time**, cancellable | Simplicity |
| 6 | **Mutations are deterministic host code**; the agent only drafts metadata | §3.1 |
| 7 | Skills and Studio call the **same operations implementation** | One source of truth, without a prose contract |
| 8 | **Per-agent adapters with capability probes**; ship **one certified adapter** first | The five CLIs differ in flags, output and permission models, and change under us |
| 9 | Design system **from npm** | Both existing surfaces do this |
| 10 | Agent set: claude, copilot, antigravity (`agy`), codex, opencode | Estate consistency (configr) |
| 11 | Add an **`update-item`** operation + skill | None exists today |
| 12 | **`gemini` → `antigravity` is a staged rollout with an alias**, not a clean break | §5 — a clean break orphans published clients |
| 13 | **v1 ships status + diff, not commit/push** | §6.6 — reversed from revision 1 |
| 14 | Every operation runs in a **transaction** with preconditions and rollback | §6.3 |

### 3.3 Reversed from revision 1

| Was | Now | Why |
|---|---|---|
| Inline SKILL.md, agent executes with shell | Deterministic ops; agent drafts metadata only | §3.1 |
| "Auto mode" uniformly across five agents | Capability-probed adapters; one certified first | Antigravity/OpenCode have no safe auto setting |
| Dual-mode skills via a `## Parameters` block | Skills call the shared operations CLI | A prose contract is not an API |
| Clean-break `gemini` removal | Staged alias rollout | Published CLI reads `main` directly |
| Commit + push from the app, any branch | Status + diff only in v1 | Unspecified semantics, real production effect |
| 15-editor "open in editor" table | OS default handler | Scope |

---

## 4. Workstream A — agent-neutral layout

### Target

```
AGENTS.md                    ← canonical instructions (moved from CLAUDE.md)
CLAUDE.md                    ← committed, one line: @AGENTS.md
.agents/
  skills/<name>/SKILL.md     ← canonical
  rules/*.md                 ← canonical
  agents/*.md                ← canonical
  hooks/*                    ← canonical (scripts)
.claude/
  settings.json              ← committed; hook path → ${CLAUDE_PROJECT_DIR}/.agents/hooks/…
  launch.json                ← committed
  skills/<name>  → link      ← GENERATED, ignored
  rules          → link      ← GENERATED, ignored
  agents         → link      ← GENERATED, ignored
```

### Verified constraints

- Claude Code does **not** read `AGENTS.md`; it reads `CLAUDE.md`, which supports an
  **`@AGENTS.md` import** (≤4 hops). Use the import — no symlink, works on Windows.
- **Individual skill folders may be symlinks** (documented). A symlinked `.claude/skills`
  **parent** is not documented — link per skill.
- `.claude/rules/` — symlinks supported for files and the directory.
- `.claude/agents/` — symlink support **undocumented**; verify, else fall back to a
  marker-owned copy that the setup script can re-sync.
- Hooks are configured in `settings.json`, not discovered from a directory. No link needed.
- There is **no settings key** for extra skill paths;
  `permissions.additionalDirectories` does not load skills.

### ⚠️ The ignore patterns must not use a trailing slash

A trailing-slash pattern matches **directories only**, and Git treats a symlink as a
*file*. Reproduced in a scratch repo at review time:

```
.gitignore = ".claude/rules/"   → git status: ?? .claude/rules   (NOT ignored)
.gitignore = ".claude/rules"    → ignored ✓
```

`.claude/skills/` happens to work because it is a real directory containing per-skill
symlinks, but `.claude/rules` and `.claude/agents` are themselves symlinks. Use:

```gitignore
.claude/skills
.claude/rules
.claude/agents
```

Revision 1's proposed patterns would have failed A's own "clean status" acceptance.

### `scripts/setup-agents.mjs`

Zero-dependency Node, wired into the root `prepare` so it runs on `pnpm install`.

- Link **directories only**. Windows: `fs.symlinkSync(target, path, 'junction')` —
  junctions need no elevation; *file* symlinks do.
- Use **`lstat`**, not `stat`, so a dangling link is detected rather than treated as absent.
- Idempotent; replaces stale/broken links; **never** silently overwrites a real directory
  that is not a link — fail loudly.
- Any copy fallback writes a marker file recording source + hash so the script can detect
  drift and re-sync.

### Reference rewriting — classify, do not blanket-replace

`.claude/...` strings fall into three classes; only the first may be rewritten:

1. **Canonical repo paths** for this repo's own tooling → rewrite to `.agents/...`
2. **Target-agent format paths** — what the CLI writes into a *user's* project, and
   documentation describing Claude's own layout → **leave alone**
3. **Emitted hook paths** inside `settings.json` → update deliberately

A blanket `sed` would corrupt class 2 and silently change the product's behaviour.

### Acceptance

- Fresh clone + `pnpm install` produces links that resolve; `git status` is clean with the
  no-trailing-slash patterns (assert this in a temporary-repo test, not by eye).
- A real Claude Code session lists every skill and the subagent, and the compile hook
  still fires on an `item.json` edit.
- A Windows run creates junctions without elevation; a Windows Claude Code session
  discovers the skills. **Until this is executed on Windows it is an open item (§12).**

---

## 5. Workstream B — `gemini` → `antigravity`, staged

Antigravity's CLI is **`agy`** and its project root is `.agents/` — the same convention
Workstream A adopts.

### Why a clean break is unsafe

The published CLI fetches the registry from `main` (§2.2). Rewriting `compatibility`
values on `main` **removes Gemini support from every already-installed CLI the moment it
merges**, before any new CLI exists. The blast radius is `add`, `remove`, `init`, exported
types and converters — not just `seedr add -a gemini`. Two further breakages verified:

- `scripts/sync/anthropic.ts:280` hardcodes
  `compatibility: ["claude","copilot","gemini","codex","opencode"]` — the daily sync
  **reintroduces `gemini`** after any data migration.
- `apps/web/functions/api/installs.ts:13` `VALID_TOOLS` has no `antigravity`, so the
  deployed analytics endpoint **rejects** antigravity installs until `prod` deploys.

### Staged rollout

| Stage | Change | Ships via |
|---|---|---|
| **B1** | CLI/type layer accepts **both** ids; `gemini` marked deprecated alias resolving to `antigravity`; add `.agents` roots; rename converter with the old name re-exported; update `sync/anthropic.ts`; add `antigravity` to `VALID_TOOLS` | `main`, then a **published CLI release** from `prod` |
| **B2** | Migrate the 31 `item.json` files + `pnpm compile`; web icon/colors/filters; docs and playgrounds | `main` — only **after** B1's CLI is published |
| **B3** | Remove the `gemini` alias in a **documented breaking release** | `prod`, deliberately |

Acceptance is **structured, not textual**: assert the set of coding-agent identifiers
across `packages/shared`, `config/agents.ts`, `compatibility.ts`, `sync/anthropic.ts` and
`VALID_TOOLS`. A literal `grep -ri gemini` cannot work — third-party registry items
legitimately mention Gemini, and this plan does too.

---

## 6. Workstream C — operations layer + Seedr Studio

### 6.1 `@seedr/registry-ops` — the deterministic core (build this first)

A plain TypeScript package. **No UI, no agent, no shell.** Everything that mutates the
registry lives here, so it can be unit-tested on all three OSes and reused by the CLI, the
skills and Studio.

```
packages/registry-ops/
  src/
    paths.ts        typeDirName(), itemDir(), itemJsonPath()   ← THE one implementation
    validate.ts     validateItem() — the single validator (§2.2)
    read.ts         loadManifest(), loadItem(), listItems()
    ops/
      addLocal.ts   copy a local source tree → registry/<typeDir>/<slug>/
      addRemote.ts  fetch metadata for a GitHub item (no content copy)
      update.ts     patch item.json and/or content files
      remove.ts     delete an item directory
    compile.ts      wraps the existing compile-manifest logic
    tx.ts           transaction: plan → precondition → apply → verify → rollback
```

Rules for this package:

- **Node APIs only** (`fs/promises`, `path`) — no `cp -r`, `rm -rf`, `find`, `jq`,
  `base64`, `python3`. This is what makes Windows work.
- `paths.ts` **replaces all four copies** of the type→directory mapping. Delete the others
  and import this. Every path is derived here; no string concatenation at call sites.
- `validate.ts` is used by `compile`, by Studio's pre/post checks, and by the commit gate
  (rewriting `check-descriptions.sh` as a Node script removes the bash+python3 dependency).
- Operations take and return **plain data**, never a live agent session.

**Operation schema** — versioned and discriminated, so a malformed or hostile payload is
rejected structurally rather than by inspection:

```ts
type RegistryOp =
  | { v: 1; kind: "add-local";  type: ComponentType; slug: string; sourcePath: string;
      name: string; scope?: ScopeType; compatibility: CodingAgent[];
      description: string; longDescription: string; author: Author; externalUrl?: string }
  | { v: 1; kind: "add-remote"; type: ComponentType; slug: string; repoUrl: string; /* … */ }
  | { v: 1; kind: "update";     type: ComponentType; slug: string; expectedHash: string;
      patch: Partial<RegistryItem>; contentEdits?: FileEdit[] }
  | { v: 1; kind: "remove";     type: ComponentType; slug: string;
      sourceType: SourceType; expectedHash: string }
```

`remove` takes **`(type, slug, sourceType, expectedHash)`** — the composite key plus a
content hash, so it cannot delete the wrong item or one that changed since it was listed.

**Postconditions per operation kind**, asserted after apply and before the transaction
commits: the item directory exists (or does not), `item.json` parses and validates,
`compile` produces no unexpected diff, and **only allowlisted paths changed**.

> **Official items:** removal of a `sourceType: "official"` item is **disabled**. The
> daily sync would restore it, so the operation would silently undo itself. Re-enable only
> when a persistent exclusion mechanism exists (§12).

### 6.2 Agent adapters — capability-probed, one certified first

The agent is used **only** for §7's metadata generation. Each adapter declares what it
supports and is verified by a probe at runtime; an unsupported or unknown binary version
is **disabled with an actionable diagnostic**, never silently degraded.

Verified against installed binaries on 2026-08-22 (macOS). **Treat every row as
version-pinned and re-probe at startup:**

| Agent | Version seen | Non-interactive | Structured output | Suppress questions |
|---|---|---|---|---|
| Claude Code | 2.1.220 | `-p` | `--output-format stream-json --verbose` | `--disallowedTools AskUserQuestion` |
| GitHub Copilot | — | `-p` | `--log-level`, json format, `--stream` | **`--no-ask-user`** |
| OpenAI Codex | 0.149.0 | `exec` | `--json` | *(no dedicated flag)* |
| Antigravity | 1.1.12 | `-p` | `--output-format stream-json` | *(none; `--mode` is edits-only)* |
| OpenCode | 1.18.21 | `run` | `--format json` | *(none; `--auto` is "dangerous!")* |

Corrections against revision 1, all verified: **`codex exec --full-auto` does not exist**
in 0.149.0 — the sandboxed auto form is
`codex exec --sandbox workspace-write --approve-for-me --json`; **OpenCode does have
`--auto` and `--format json`**; **Copilot has `--no-ask-user`**; **Antigravity's
`--mode accept-edits` covers edits only**.

Because §3.1 removes tool use from the agent's job, the weak permission stories of
Antigravity and OpenCode stop mattering — **we do not grant them tools at all**.

**Ship P3 with Claude certified only.** Add adapters one at a time, each gated on passing
the same recorded-fixture conformance suite. Do not advertise five agents until five pass.

Execution requirements (lessons from toolr-app, not its code):

- One id: `taskId === the key the PID is registered under`, so cancel cannot no-op.
- **Kill the whole process tree**: Unix process group (`setsid`/`process_group(0)` + kill
  by PGID); **Windows Job Object with kill-on-close** — `process_group(0)` has no Windows
  equivalent, so P3's "no orphans" criterion is otherwise untestable there.
- **Drain stdout and stderr concurrently.** A child blocked on a full stderr pipe deadlocks.
- Bound everything: prompt size, log size (keep a capped head+tail), and a watchdog timeout.
- Prefer **stdin or a prompt file** over a single giant argv entry: skills reach ~14.5 KB
  today and Windows' command line caps near 32 K.
- Resolve Windows `.cmd`/`.ps1` shims; enrich `PATH` (a GUI app does not inherit the
  shell's); set `NO_COLOR=1`.
- Normalise every agent's raw events into **one Studio-owned outcome type**
  `{ status, exitCode, text, denials[], usage?, raw[] }`. The five CLIs do **not** share a
  terminal schema — do not assume Claude's `{"type":"result",…}` shape elsewhere.

### 6.3 Transactions and containment

Every mutating operation is a transaction:

1. **Preconditions** — repo identity confirmed; **worktree clean** (v1 refuses a dirty
   tree rather than risking mixing the user's work into its diff); record `HEAD`; acquire
   a **cross-process lock** (a lockfile with pid + timestamp) so two Studios cannot
   interleave.
2. **Apply** — `registry-ops` writes to disk, then `compile`.
3. **Verify** — postconditions (§6.1) and an **allowlisted changed-path set**; re-check
   `HEAD` and status are unchanged since step 1.
4. **Commit or roll back** — on any failure, restore the recorded state and report. A
   half-applied operation is never left behind.

**Untrusted input:** community metadata is attacker-controlled text. It is data, never
instructions: it is not concatenated into a prompt that has tools, is length-capped, and
is validated against the schema before use. This is the other half of why the agent has no
tools — an injected instruction has nothing to act with.

### 6.4 Studio app

```
apps/studio/                       @seedr/studio, private
├── src/
│   ├── api/                       typed IPC wrappers (only importers of tauriInvoke)
│   ├── core/lib/tauriInvoke.ts    sole re-export of invoke/listen
│   ├── features/{explorer,author,run,git}/
│   └── styles/index.css           @danieldeusing/design from npm
└── src-tauri/                     flat crate; no vendored external crate (§11)
```

Monorepo wiring: add a `test` task to `turbo.json` **and** a root `test` script that
actually invokes it, and add it to `ci.yml` — otherwise the task is dead config (§2.1).
Widen the ESLint React glob to `apps/studio/**`. Do not re-pin `packageManager`.

**Screens**

| Screen | Contents |
|---|---|
| **Explorer** | Section per type with counts, read from disk at runtime and file-watched. Keyed on `(type, slug)`. Handles an **empty registry** (a fresh fork) with a real empty state |
| **Detail** | `item.json` fields, file tree, read-only viewer, "Open with default app" |
| **Author** | Add / Update / Remove forms → §7 metadata draft → review → transaction |
| **Test** | §6.5 |
| **Git** | Status + diff (§6.6) |

### 6.5 The Test action — real installation, not the mocked suite

`install-all.test.ts` cannot serve this purpose (§2.4). Studio's Test action instead:

1. creates a temp directory;
2. runs the **real handler** against **real local content**, with no fs/exec mocks;
3. asserts the expected files exist with expected content;
4. cleans up.

Network URL validation is a **separate, explicitly-labelled** action with a **baseline**,
so pre-existing upstream failures are never attributed to the user's change.

Alongside, fix the test-name ambiguity in `install-all.test.ts`:
`` `${item.type}/${item.slug} (${item.sourceType})` `` — a one-line change that makes exact
single-item runs possible for the duplicate slugs.

### 6.6 Configuration, fork safety, and Git

Revision 1 conflated project policy with per-user preferences in one committed file, and
claimed it "contains no paths" while holding binary overrides. Split them:

| Store | Location | Contents |
|---|---|---|
| **Project policy** | committed `seedr-studio.config.json` | deploy-branch list (**default empty**), consequence messages, registry base URL. **No command overrides** — a repo-controlled arbitrary command is an execution vector |
| **User preferences** | OS app-data dir, never committed | repo location, preferred agent, binary paths |

Fork safety fixes beyond config:

- **Derive identity, never fabricate it.** Author and `externalUrl` come from the repo's
  actual remote and default branch (`git remote get-url`, `git symbolic-ref`), confirmed
  by the user. If they cannot be derived, **omit `externalUrl`** rather than writing an
  upstream URL. This also fixes `add-toolr:238-239` for the CLI path.
- Make the CLI's registry base URL **configurable** so a fork's CLI reads the fork's data
  (`packages/cli/src/config/registry.ts:51`).

**Git in v1: status and diff only.** Commit/push is reversed out (decision 13). Reasons:
staging semantics, multiple remotes, non-fast-forward pushes, credential prompts, signed
commits and branch switching are all unspecified; and because the published CLI reads
`main` (§2.2), even a `main` push has immediate production effect. Deferring costs the
user one `git commit` in a terminal they already have open.

When it is added later: current branch only, stage **explicitly reviewed paths** only,
disable interactive credential prompts, and use fork-configured consequence messages.
Never `--no-verify`.

### 6.7 First run, privacy, accessibility

- **Onboarding** validates: repo identity and that it *is* a seedr registry; worktree
  clean; Node/pnpm/git present; agent binaries and versions; agent auth state. Each failure
  states the fix.
- **Privacy** — disclose plainly that item content and prompts are sent to a third-party
  agent CLI. Logs are local, capped and redacted of obvious secrets. **No telemetry** from
  Studio (note: the *CLI* has install analytics with `SEEDR_NO_TELEMETRY`; Studio adds none).
- **Accessibility** — keyboard navigation and visible focus throughout; streamed output in
  a **throttled** `aria-live` region (unthrottled would flood a screen reader); contrast
  and reduced-motion honoured via the design system.

---

## 7. Metadata generation — the agent's actual job

The agent is asked for **structured data only**, with **no tools**, and its answer is
validated before anything is written.

**Given:** item type, slug, a size-capped digest of the source content, and the target
`compatibility` set.
**Asked for:** `description`, `longDescription`, and (optionally) a type/classification
suggestion.
**Returned as:** JSON matching a schema — `--output-schema` on Codex, structured output
where the adapter supports it, otherwise a single fenced JSON block parsed strictly.

Rules:

- **No tool access.** Nothing to hijack, nothing to half-apply.
- **Reject, do not repair,** a malformed answer: retry once with the validation error, then
  fail visibly. Never hand-patch a model's JSON into validity.
- Validate before use: `longDescription` **≥ 30 words and containing a backtick** (the
  commit gate's real rule — catching it here rather than at commit time), `description`
  non-empty and single-sentence, no field outside the schema.
- Everything else — paths, copying, deletion, `compile` — is host code. The model never
  learns where the registry lives.

**The forms therefore ask for what the model should not guess**: source path, type, name,
slug, scope, compatibility. `description`/`longDescription` may be left blank to request a
draft. There is **no `onConflict` field** — preflight already rejects a colliding
`(type, slug)`, and changing an existing item is what Update is for.

**The skills stay** as the human-facing entry point, rewritten to call the same operations
CLI (`node scripts/registry-op.mjs …`) instead of issuing shell commands. One
implementation, two front doors, no prose contract in between.

`update-item` (new): takes `(type, slug)` + a free-text instruction, drafts a patch,
validates, applies transactionally. It may not change `slug` or `type` — that is a remove
plus an add. **v1 restricts Update to `sourceType: "toolr"` items**; synced items would
have edits overwritten by the next sync.

---

## 8. Phases

Reordered from revision 1: safety and coverage move **forward**, and one complete
end-to-end path is proved before breadth is added.

| Phase | Scope | Done when |
|---|---|---|
| **P0** | Workstream A. Rewrite `check-descriptions.sh` as Node (removes bash+python3) | Fresh clone + `pnpm install` yields resolving links; ignore patterns verified by a temp-repo test; a real Claude Code session sees every skill; CLI suite green |
| **P1** | **`@seedr/registry-ops`** (§6.1): paths, validator, read, the four ops, compile wrapper, `tx`. Skills rewritten to call it. Collapse the four `typeDirName` copies | Ops unit-tested on macOS **and** Windows **and** Linux in CI; the four duplicated path helpers are gone; a `remove` with a stale `expectedHash` is refused |
| **P2** | Workstream B **stage B1** only (dual-id, alias, sync + `VALID_TOOLS`), published from `prod` | A published CLI understands both ids; structured identifier assertions pass |
| **P3** | Studio scaffold + **Explorer/Detail** (read-only, no mutation) | Browsable, file-watched, empty-registry state; root `test` script + turbo task + CI wired; coverage gate **enforced from here on** |
| **P4** | Agent adapter — **Claude only** — plus §7 metadata generation, bounded and probed | One complete **Add-local** flow end-to-end with a real transaction and rollback; process-tree cancellation verified on all three OSes |
| **P5** | Remaining flows: Update (toolr only), Remove, plus §6.5 Test action and Git status/diff | Each flow transactional with verified postconditions; Test really installs into a temp dir |
| **P6** | Additional agent adapters, one at a time, behind capability gates | Each new adapter passes the recorded-fixture conformance suite before being offered |
| **P7** | Workstream B **stage B2** (data migration), then **B3** (alias removal) in a documented breaking release | Structured checks pass; sync no longer reintroduces `gemini` |

**P4 is the likeliest to overrun** — five changing CLIs against three OS process models.
That is exactly why it ships with one certified adapter and why P6 exists.

**Testing approach.** Unit tests for `registry-ops` (the bulk of the value, and pure
enough to be fast). For Studio: mocked IPC where an **unknown command fails rather than
returning `undefined`** — configr's harness returns `undefined` for unknown commands,
which converts a real failure into a silent pass; plus IPC serialisation tests, recorded
stream fixtures per adapter, and cross-platform process-tree integration tests. Coverage
thresholds are enforced from **P3**, not at the end.

---

## 9. Verification commands

```bash
# repo-wide (from repo root)
pnpm lint
pnpm typecheck
pnpm --filter @danieldeusing/seedr test        # NOT `pnpm test` — no root script (§2.1)
pnpm compile && git status --short             # must be clean

# derive counts instead of trusting this document
node -e "const m=require('./registry/manifest.json');
  console.log(Object.entries(m.types).map(([k,v])=>k+':'+v.count).join(' '),
              '| total', Object.values(m.types).reduce((a,b)=>a+b.count,0))"

# one registry item (must run inside packages/cli)
cd packages/cli && pnpm test install-all -t 'pdf \(official\)'

# live URL validation — slow, network-dependent; BASELINE before attributing failures
cd packages/cli && SEEDR_LIVE=true pnpm test install-all

# studio
pnpm --filter @seedr/studio tauri:dev
pnpm --filter @seedr/studio test
```

---

## 10. Traps — all verified at `4e8f342`

1. **`pnpm test …` from the repo root is a false green** — no root `test` script; it falls
   through to the POSIX `test` builtin and exits 0. Use `pnpm --filter`.
2. **A trailing-slash gitignore pattern does not match a symlink** (§4). Reproduced.
3. **The published CLI reads the registry from `main`** — a data merge to `main` is live
   for all CLI users immediately (§2.2, §5).
4. **`sync/anthropic.ts:280` reintroduces `gemini`** after any data migration.
5. **`installs.ts:13 VALID_TOOLS` rejects `antigravity`** until `prod` deploys.
6. **`install-all.test.ts` mocks fs, exec and the registry** — it proves handler wiring,
   not installation (§2.4).
7. **The skills use `registry/<type>s`**, wrong for `mcp`/`settings` — and an MCP item now
   exists.
8. **`add-toolr:238-239` hardcodes upstream author and `externalUrl`** — a fork produces
   misattributed items.
9. **The compile hook needs `jq`; the commit gate needs bash + python3** — both fail on a
   stock Windows box.
10. **The compile hook does not fire on Bash `cp`/`rm`**, only on `Edit|Write|MultiEdit`.
    Always run `compile` explicitly and check `git status`.
11. **`(type, slug)`, never slug alone.** `sync.ts` still keys some sets by slug.
12. **`command` type has no install handler** — do not offer a type the tester cannot exercise.
13. **A Tauri app does not inherit the shell's `PATH`** — enrich it or agents are "not found".
14. **`.claude/settings.local.json` is gitignored**, so its allowlist does not exist on a
    fresh clone.
15. **Windows has no `process_group(0)`** — use a Job Object with kill-on-close.

---

## 11. Reference material — read, do not transplant

Revision 1 over-promised here. The review found the "copy verbatim" event struct lacks the
success/duration/permission fields §6.2 needs, that the parser reads inconsistent cost
keys, and that configr's `toolr-core` (~8.4k Rust lines, with a configr-specific watcher)
conflicts with the flat crate this app wants.

**Therefore:** write a small Studio-specific executor and registry watcher. Copy only
small, pure, well-understood functions, **after** writing tests for them.

| Source | Use it for |
|---|---|
| `toolr-app/.../cli_executor/stream_parser.rs` | **Reference** for per-agent output shapes and flags — then re-derive against installed versions (revision 1 inherited a stale codex flag exactly this way) |
| `toolr-app/.../process_manager.rs` | Reference for the PID registry and cancel; note its verified bugs: cancel no-ops when ids diverge, only the direct PID is killed, streaming has no timeout |
| `configr/src/core/lib/tauriInvoke.ts` | The single-boundary IPC pattern (tiny; copy) |
| `configr/src/components/editor/*` | Read-only Monaco setup and the lazy boundary — **only if** Monaco survives §12's simplification question |
| `configr/src/index.css` | The estate-token → Tailwind bridge |
| `configr/eslint-plugin-toolr-design.js` | Design guardrails; rewrite the path zones |
| `configr/src/test/{setup,consoleGate}.ts` | Test harness — **fix the unknown-command-returns-undefined behaviour** before adopting |

Do not copy `crates/toolr-configr` (configr's domain crate, ~58k lines), `src/features/*`,
or its fixtures. Known extraction leaks: `ScopeBadge` imports an app store;
`explorer-tree.ts` imports configr's `CODING_AGENTS`.

---

## 12. Open items

**Must be resolved during implementation:**

- **Windows end-to-end**: junction creation, Claude Code skill discovery via junctions,
  and process-tree kill. All macOS-verified only. This gates A's and P4's acceptance.
- **Per-adapter conformance**: live authenticated behaviour and exact stream schemas for
  Copilot, Antigravity, Codex and OpenCode. Only `--help`/version parsing was checked.
  Each adapter needs recorded fixtures before it ships (P6).
- **Official-item removal** needs a persistent exclusion mechanism or it stays disabled
  (§6.1).
- **`sync.ts` slug-only keys** — decide whether to fix as part of P1 or track separately.

**Unverified claims carried from revision 1 — do not treat as fact:**

- The "19 live-URL failures / ~32 s" figure (network-dependent; re-baseline).
- The 3.8 MB Monaco chunk figure (no reference build was available).
- The latest published `@danieldeusing/design` version and the availability of the
  `danieldeusing-design` skill.
- "The only working execution machinery in the estate."

**Deliberately deferred (scope):**

- Marketplace bulk ingestion — discovery, per-item metadata and all-or-nothing semantics
  are undefined.
- `audit-descriptions` stays interactive; Studio has no audit flow.
- The 15-editor opener table — use the OS default handler.
- **Monaco itself** is worth challenging: for read-only viewing of small text files, a
  syntax-highlighted `<pre>` may be enough, at a fraction of the bundle. Decide in P3.
- i18n — v1 is English-only by declaration.
