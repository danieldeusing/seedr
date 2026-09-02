# Conformance audit — Claude Code and OpenAI Codex

Independent read-only audit of `docs/claude-code.html` and
`docs/openai-codex.html` against the Configr implementation, plus the
Claude/Codex rows of `docs/cross-tool-matrix.html`.

- Repo: `/Users/daniel/Work/twiced/toolr/configr`, branch `main`, HEAD `d3d1e445`, clean.
- No source was edited. Mutation testing ran against a scratchpad copy of the
  workspace, never the repo.
- Test suite at HEAD: `cargo test --workspace` → **742 passed, 0 failed**
  (640 `toolr-configr` + 102 `toolr-core`).

---

## 0. Status since this audit

This audit was written against `d3d1e445`. Two of its findings have since been
fixed. The record of what was wrong is kept; only the claim about the present
tense changes.

**Convention used throughout this file.** A superseded verdict is struck through
and followed by `→ <new class> — fixed in <commit>`. A narrative finding keeps
its original text under a heading prefixed `RESOLVED`, with the fix stated
first. §2 carries the recomputed totals beside the ones as audited. Mutation
tables, probe transcripts and the §7 plan are records of what was true at
`d3d1e445` and are left exactly as written.

| Row   | Claim                                                 | As audited      | Now                           | Fixed in   |
| ----- | ----------------------------------------------------- | --------------- | ----------------------------- | ---------- |
| `C13` | Claude's instruction walk has no `$HOME` check        | TESTED-WRONG    | **CONFORMS**                  | `3f933432` |
| `X11` | Codex collects every `AGENTS.md` root→cwd             | TESTED-WRONG    | **CONFORMS**                  | `3f933432` |
| `C55` | The `.mcp.json` walk has neither ceiling              | CONFORMS\*      | **CONFORMS**                  | `cf7ff9a8` |
| `X10` | Upward search for the root via `project_root_markers` | NOT-IMPLEMENTED | NOT-IMPLEMENTED (now partial) | `3f933432` |

`C55` and `X10` keep their class. `C55` was CONFORMS only for the repository
half, with the `$HOME` bound recorded as a documented deferral; `cf7ff9a8`
removed the bound, so the row is now CONFORMS outright. `X10`'s default `.git`
search now runs as the Codex instruction walk's ceiling; the configurable
`project_root_markers` key is still unread, so the row stays NOT-IMPLEMENTED.

Everything else in this file — including §3.2's second half (`X20`, `.agents/skills`
joined to every directory root→cwd), §3.3, §3.4 and §3.5 — is unchanged and
still true.

---

## 1. Executive verdict

### Q1 — "Did we implement exactly what the docs specify?"

**No — and the shortfall is one of coverage, not of correctness.** Of 146
normative claims extracted from the two guides, **60 are not implemented at
all**. But of the 82 claims Configr _does_ act on, **80 are implemented exactly
as the guide specifies**. There are only **2 places where the code does
something the guide contradicts**, and **zero places where Configr asserts
certainty the evidence does not support**.

> **Since `3f933432`:** both contradicting places are fixed. All **82**
> implemented claims are now faithful, and the TESTED-WRONG count is **0**.

That last number is the headline. I hunted deliberately for
IMPLEMENTED-BEYOND-SPEC rows — an app resolving a `U-` unknown, inventing a
winner, or claiming a reader the guides withhold — and found **none**. Every
`U-` number that touches Claude or Codex (U-07, U-08, U-13, U-14, U-16) is
either carried into `LoadVerdict::Unknown` with its citation or is structurally
unreachable for a documented reason. The codebase is consistently _more_
conservative than the guides permit, never less. That is the right direction to
err in, and it is rare.

The 60 missing claims are overwhelmingly **whole surfaces that were never
built** — managed/enterprise scope, Codex's plugin and marketplace stack,
`@import` resolution, Codex `memories`/`goals`/`sessions` — not places where a
built feature drifted. The implemented core (discovery, provenance, the two
ceilings, precedence, effective verdicts) is faithful.

### Q2 — "Did we test that it actually works as expected?"

**Yes, and the tests are unusually strong — stronger than I expected going in.**
This is not the usual "green suite defending nothing".

- **70 of 82 implemented claims (85%) are genuinely pinned.** _(Since
  `3f933432`: **72 of 82, 88%.**)_ I mutation-tested
  17 of them; **15 were caught**, most by more than one test.
- The `example/` census assertions are the real thing: exact totals
  (`components.len() == 27`, `== 25`), exact sorted name sets, exact
  `HookPointer` structs, exact `LoadVerdict` variants, exact shadow labels. Not
  a single `assert!(x > 0)` exists in any of the six census files.
- Provenance is asserted at 21 sites (`project`/`local`/`inherited`/`plugin`).

Only **10 implemented claims are unpinned**, and they are mostly narrow
(`CLAUDE_COWORK_MEMORY_PATH_OVERRIDE`, `$CODEX_HOME`, the auto-memory caps).

**The real answer to Q2 is not the count — it is the two tests that pin the
wrong thing.** Both are in the highest-traffic area of the app (the ancestor
instruction walk), both carry a confident justifying comment, and in one case
the comment is contradicted by another comment in the same codebase.

> **Since `3f933432`:** both tests are gone. `walk_stops_at_home` and
> `agents_that_never_look_upwards_inherit_nothing` were deleted and replaced by
> tests that pin the guide's answer — see §3.1 and §3.2.

### Bottom line

Claude Code and Codex conform well where they are built, and the test suite
would catch a regression in nearly all of it. The dangers are (a) two
green tests defending guide-contradicting behaviour, (b) one hard-coded path the
guide explicitly names as the classic mistake, with **zero** test coverage in
either direction, and (c) a large unbuilt surface area that no one has written
down as deferred.

> **Since `3f933432`:** danger (a) is closed. (b) and (c) are unchanged.

---

## 2. Counts

### As audited at `d3d1e445`

| Class                                                                         | Claude |  Codex |   Total |
| ----------------------------------------------------------------------------- | -----: | -----: | ------: |
| **CONFORMS** — implemented as specified _and_ a test would fail on regression |     40 |     30 |  **70** |
| **IMPLEMENTED-UNTESTED** — code is right, nothing pins it                     |      6 |      4 |  **10** |
| **TESTED-WRONG** — green test pinning behaviour the guide contradicts         |      1 |      1 |   **2** |
| **NOT-IMPLEMENTED** — guide specifies it, Configr does not do it              |     30 |     30 |  **60** |
| **IMPLEMENTED-BEYOND-SPEC** — asserts what the evidence withholds             |      0 |      0 |   **0** |
| **N/A** — runtime behaviour a config browser cannot observe                   |      1 |      3 |   **4** |
| **Total claims**                                                              | **78** | **68** | **146** |

Of the 60 NOT-IMPLEMENTED rows, **6 are deliberate deferrals with a stated
reason in a code comment**; the other **54 are silent**.

### Now, at `eecc1fe8`

Two rows moved, both out of TESTED-WRONG. Nothing else changed class, so the
NOT-IMPLEMENTED column is untouched — the 60 unbuilt surfaces are still 60.

| Class                       | Claude |  Codex |   Total | Moved                           |
| --------------------------- | -----: | -----: | ------: | ------------------------------- |
| **CONFORMS**                | **41** | **31** |  **72** | `+C13` (Claude), `+X11` (Codex) |
| **IMPLEMENTED-UNTESTED**    |      6 |      4 |  **10** | —                               |
| **TESTED-WRONG**            |  **0** |  **0** |   **0** | `−C13`, `−X11`                  |
| **NOT-IMPLEMENTED**         |     30 |     30 |  **60** | —                               |
| **IMPLEMENTED-BEYOND-SPEC** |      0 |      0 |   **0** | —                               |
| **N/A**                     |      1 |      3 |   **4** | —                               |
| **Total claims**            | **78** | **68** | **146** |                                 |

Implemented (CONFORMS + IMPLEMENTED-UNTESTED + TESTED-WRONG) is **82** in both
tables. Pinned share of implemented: **70 / 82 = 85%** as audited, **72 / 82 =
88%** now.

---

## 3. The dangerous findings, ranked by risk

### 3.1 RESOLVED — TESTED-WRONG #1 — `$HOME/CLAUDE.md` is read by Claude Code and reported by Configr nowhere

**Fixed in `3f933432`.** Claude's ancestor instruction walk now carries
`InstructionCeiling::FilesystemRootChild`
(`toolr-core/src/instruction_sources.rs:444-449`) and draws its levels from
`ancestors::ancestor_dirs_below_filesystem_root` (`ancestors.rs:48`), which
passes `None` for `home` and drops only the filesystem root. `$HOME/CLAUDE.md`
is now reported as the ordinary ancestor the guide describes, and the user
scope's own files are excluded from that level by `user_scope_roots`
(`inherited_memory.rs:216`) so `~/.claude/CLAUDE.md` and `~/.claude/rules` are
not reported twice. `walk_stops_at_home` was deleted from `inherited_memory.rs`
and replaced by `the_home_directory_is_an_ordinary_ancestor_for_instructions`
(`inherited_memory.rs:557`); the dedupe is pinned by
`the_home_level_leaves_the_user_scopes_own_files_to_the_user_card`
(`inherited_memory.rs:585`) and by the exact tuple list in
`inherit_fixture_claude_memory_census` (`scanner/fixture_census.rs:575`), which
ends `("~", "~/CLAUDE.md"), ("~", "~/CLAUDE.local.md")`. The walk shape itself is
pinned by `the_instruction_walk_passes_through_home_and_stops_below_the_root`
(`ancestors.rs:189`). _A same-named `walk_stops_at_home` survives at
`scanner/inherited.rs:325` — that one is the **capability** walk, where stopping
at `$HOME` is correct._

The finding as written is kept below, unchanged.

**Risk: high.** This is the worst finding in the audit: a real file, silently
dropped, with a green test asserting the drop and a justification that the
codebase itself refutes.

The guide is unambiguous (`#inheritance`):

> `/Users/me · $HOME` — **instructions ONLY** — _read as an ordinary ancestor_

> "So a `CLAUDE.md` sitting in the home directory is read as an ordinary
> ancestor contribution, while `~/.claude/skills` is not a project directory."

The instruction walk has _no_ `$HOME` check. Configr applies one to every walk:

- `src-tauri/crates/toolr-configr/src/ancestors.rs:27-29` — `ancestor_dirs`
  breaks at `home` unconditionally.
- `src-tauri/crates/toolr-configr/src/inherited_memory.rs:167` — the instruction
  walk consumes that home-capped list.

`$HOME/CLAUDE.md` is therefore not on the inherited card. It is not on the user
card either: `CLAUDE_USER` holds only `$CLAUDE_CONFIG_DIR/CLAUDE.md` and
`$CLAUDE_CONFIG_DIR/rules` —
`src-tauri/crates/toolr-core/src/instruction_sources.rs:169-178`. `~/.claude/CLAUDE.md`
and `~/CLAUDE.md` are different files. Verified: `InstructionRoot::Home` is used
only by Antigravity's `.gemini/GEMINI.md` and OpenCode's `.claude/CLAUDE.md`;
no Claude source resolves to a bare `$HOME/CLAUDE.md` anywhere in the tree.

**The codebase contradicts itself about this.**
`src-tauri/crates/toolr-core/src/instruction_sources.rs:165-168` says:

```
// `~/CLAUDE.md` is deliberately absent. The instruction walk has no `$HOME`
// check, so a home-directory `CLAUDE.md` reaches a project below it as an
// *ancestor* and belongs on an inherited card, not on the user one
```

…while the test that pins the loss,
`src-tauri/crates/toolr-configr/src/inherited_memory.rs:506-523`, says the exact
opposite:

```rust
#[test]
fn walk_stops_at_home() {
    …
    assert_eq!(
        groups[0].label, "~/Work",
        "~/CLAUDE.md is the user scope, reported by its own card"
    );
```

It is not reported by its own card. The file falls between the two stools and
each side's comment points at the other.

The same cap also drops `/Users/CLAUDE.md` — the guide reads to the filesystem
root's immediate child.

**Mutation proof (FIX-A):** applying the guide-conformant behaviour
(`ancestor_dirs(project_path, None)` for the instruction walk) breaks 6 tests.
The decisive one is `walk_stops_at_home`, which constructs `$HOME/CLAUDE.md`
explicitly and asserts its absence. _In fairness:_ the other 5 are census tests
that use `example/` as a stand-in `$HOME`, so their breakage is partly a fixture
artefact — but they would all need updating to fix this.

---

### 3.2 RESOLVED (first half) — TESTED-WRONG #2 — Codex reads ancestor `AGENTS.md`; Configr asserts it reads none

**Fixed in `3f933432`.** `CodingAgent::Codex` now returns `CODEX_ANCESTORS`
(`instruction_sources.rs:459-464`): classes
`[["AGENTS.override.md"], ["AGENTS.md"]]`, ceiling
`InstructionCeiling::RepositoryRoot` (inclusive), class range
`ClassRange::Directory`. Both tests that pinned the gap are gone —
`agents_that_never_look_upwards_inherit_nothing` was replaced by
`only_copilot_reads_nothing_from_an_ancestor_directory`
(`inherited_memory.rs:800`), and the `coding_agent.rs` assertion by
`the_ancestor_walk_matrix_matches_the_five_guides`
(`instruction_sources.rs:649`). The walk is pinned by
`codex_reads_ancestor_agents_md_up_to_the_repository_root`
(`inherited_memory.rs:843`), which asserts the levels
`["~/Work/repo/apps", "~/Work/repo"]` and plants a `~/Work/AGENTS.md` above the
repository that must not appear; per-directory override locality is pinned by
`a_codex_override_silences_its_own_directory_only` (`inherited_memory.rs:873`).

**Still open: the second half of this finding.** The `.agents/skills`
per-directory join (`X20`) is unchanged — `scanner/codex.rs` was not touched —
so Configr still joins that root at the project root and `$HOME` only. See the
last paragraph of this section.

**Risk: high.** This one rests on a misreading of a single phrase.

The guide (`#instructions`) describes the Codex walk in three steps: walk **up**
from cwd to find the project root (marker `.git`), collect **every** `AGENTS.md`
from the project root **down to cwd inclusive**, and never walk past the root.
Directories between the root and cwd are ancestors of cwd, and Codex reads them.

Configr models Codex as having no ancestor instruction surface at all:

- `src-tauri/crates/toolr-core/src/coding_agent.rs:730` — `inherited_memory()`
  returns `None` for Codex.
- The justification at `coding_agent.rs:366-368` reads: _"Codex never walks past
  the project root — its own resolver header says 'we do not walk past the
  project root'"_. **"Does not walk past the root" is not "does not walk up."**
  It walks up _to_ the root.

Consequence: open `/repo/apps/web` as a project and Configr reports zero
inherited `AGENTS.md`, while Codex loads `/repo/AGENTS.md` and
`/repo/apps/AGENTS.md` ahead of the local one. Configr already has every part it
needs — `ancestors::repository_root` exists and Claude's walk uses it.

Two green tests pin the wrong belief:

- `src-tauri/crates/toolr-configr/src/inherited_memory.rs:707-730` —
  `agents_that_never_look_upwards_inherit_nothing` asserts Codex inherits nothing.
- `src-tauri/crates/toolr-core/src/coding_agent.rs:1013-1019` —
  `codex_layout_uses_project_skills_and_no_command_dir` asserts
  `inherited_memory().is_none()`.

**Mutation proof (FIX-B):** giving Codex a guide-conformant
`InheritedMemory { classes: [["AGENTS.override.md", "AGENTS.md"]], stop_at_repository_root: true }`
breaks exactly one test — `agents_that_never_look_upwards_inherit_nothing`. No
census test breaks, because **no census test covers Codex inherited
instructions at all**.

The same misreading produces a second, independent gap: the guide states
`.agents/skills` is "joined to every directory between the project root and cwd
— it is **not** a project-root-only root". Configr joins it at the project root
only (`scanner/codex.rs:46-57`, and there only to seed a dedupe set) and at
`$HOME` (`scanner/codex.rs:94-105`).

---

### 3.3 The user JSON state file is hard-coded — and completely unpinned

**Risk: high.** The guide names this as _the_ classic mistake, twice.

> "It is **not** unconditionally `~/.claude.json`… A configuration manager must
> resolve the file rather than hard-coding a path — reading the obvious file
> yields the wrong effective configuration." (`#scopes`)

> **High risk** — "Effective settings are not one file. The user JSON state file
> is a resolver result, not a fixed `~/.claude.json`." (`#unknowns`)

Configr **has** a correct resolver —
`src-tauri/crates/toolr-core/src/utils.rs:265-285`, which checks
`$CLAUDE_CONFIG_DIR/.config.json` first and falls back to
`${CLAUDE_CONFIG_DIR || $HOME}/.claude.json`, with the OAuth-suffix half
deliberately and honestly deferred at `utils.rs:280-283`. It is tested at
`utils.rs:324+`.

**But the two paths that matter most don't call it:**

| Path                            | Code                                                       | Resolver? |
| ------------------------------- | ---------------------------------------------------------- | --------- |
| Scanner (populates the browser) | `scanner/mcp.rs:128` — `home_dir.join(".claude.json")`     | **No**    |
| MCP write/add target            | `mcp/config_paths.rs:64` — `Ok(home.join(".claude.json"))` | **No**    |
| MCP read                        | `mcp/read.rs:180`                                          | Yes       |
| MCP remove                      | `mcp/remove.rs:167`                                        | Yes       |
| File watcher                    | `file_watcher.rs:261`                                      | Yes       |

This is a split brain, not a uniform shortcut. With `$CLAUDE_CONFIG_DIR` set (or
`.config.json` present) the browser lists user MCP servers from one file while
the removal path edits another. Note the contrast inside
`mcp/config_paths.rs` itself: the Codex and Copilot arms both call
`user_config_dir()` and honour `$CODEX_HOME` / `$COPILOT_HOME`; only the Claude
arm hard-codes. No comment explains it.

**Mutation proof (FIX-C):** replacing the hard-coded join with
`get_claude_config_path()` breaks **nothing — 0 tests**. The wrong behaviour and
the right behaviour are equally unpinned.

---

### 3.4 Three Claude capability types are never discovered

**Risk: medium.** The guide's capability walk serves **six** names —
"commands, agents, output-styles, skills, workflows, routines". Configr scans
three.

- `src-tauri/crates/toolr-core/src/coding_agent.rs:374` —
  `types: &["skill", "command", "agent"]`, directly beneath a doc comment
  (`coding_agent.rs:355`) that names all six.
- `src-tauri/crates/toolr-configr/src/scanner/claude_dir.rs:159-164` — the
  project scan's `component_dirs` is `skills`, `commands`, `hooks`, `agents`.

`.claude/workflows/`, `.claude/output-styles/` and `.claude/routines/` are read
nowhere (`WORKFLOW_DIR` exists only for Antigravity). A user with workflows sees
an empty browser. No comment states a deferral; the doc comment and the value
below it simply disagree.

---

### 3.5 Linked-worktree behaviour is absent across the board

**Risk: medium.** Both guides call this out as a scanner trap. Three claims,
none implemented, none commented:

1. **Claude local settings** — the guide: `.claude/settings.local.json` resolves
   to the **Git main checkout**. Configr reads it project-relative
   (`scanner/claude_dir.rs:641-660`). Inside a worktree the two are different files.
2. **Claude worktree capability fallback** — main checkout's `.claude/CAP` is
   appended when the worktree has no entry. Not implemented.
3. **Codex hook redirect** — the guide is emphatic: _"a scanner reading 'the
   project layer' gets configuration from one directory tree and hooks from
   another. Reporting a single project path for both is wrong, and the hooks
   half is the one that executes commands."_ Not implemented.

`ancestors::git_main_checkout_root` exists and is correct, but has only two
callers — the auto-memory anchor and the `projects` map key.

---

### 3.6 IMPLEMENTED-BEYOND-SPEC: none found — with one coherence note

I found no row where Configr claims more than the evidence supports. Spot-checks
that could have gone wrong and did not:

- `claude_precedence("skill")` stays `Unknown` and cites **U-13**
  (`precedence_tables.rs:18-24`, `coding_agent.rs:570`); `"command"` cites **U-07**.
- A collision inside one recursive agent tree returns no winner
  (`effective.rs:382-407` returns `None` on a distance tie) — matching
  "unspecified filesystem order".
- Codex `skill_discovery_depth` is `Unverified` → nested skills get
  `LoadVerdict::Unknown`, not a guess.
- `$CODEX_HOME/prompts` is scanned but labelled an unverified surface rather
  than asserted as a capability — exactly what the D/U guidance asks for.
- U-14 is structurally unreachable and says so: `precedence_tables.rs:80-88`
  explains that discovery reads only the project root's `.codex`, so two
  project-layer contenders never meet.

**One coherence note, not a beyond-spec claim** — _resolved in `cf7ff9a8`_:
`coding_agent.rs:410-422` declares Claude's ancestor `.mcp.json` walk
`AncestorCeiling::Uncapped`, and `coding_agent.rs:1304` asserts it — but the
actual walk is still capped at `$HOME` by `ancestor_dirs`. The _model_ is
guide-accurate while the _behaviour_ is narrower. `inherited.rs:143-146` is
honest about this ("The one bound this app keeps is the home directory"), so it
is a documented deferral rather than a false claim — but the enum and the
behaviour do not agree, and the test asserts the enum.

> **Fixed in `cf7ff9a8`.** `scan_ancestor_mcp` (`scanner/inherited.rs:152`) now
> draws its levels from `ancestor_dirs_below_filesystem_root` (line 163), so
> `$HOME` is a level the walk passes rather than a bound it stops at. Enum and
> behaviour agree. Pinned by
> `the_mcp_walk_reads_the_home_directory_as_an_ordinary_level`
> (`scanner/inherited.rs:566`), which asserts a count of exactly one for a
> `$HOME/.mcp.json` server — failing at zero if the ceiling returns and at two
> if the level is ever reported twice.

---

## 4. Mutation-proof results

Method: the workspace was copied to a scratchpad, `git init`-ed (4 census tests
require the checkout to be a git repo — worth knowing), and verified green at
**742 passed / 0 failed**. Each mutation was applied alone, the full suite run,
then reverted.

### Round 1 — break a CONFORMS claim, expect a failure

| #   | Mutation                                                      | Result         | Caught by                                                                                                                              |
| --- | ------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Claude `.claude/hooks/` becomes a scanned registry            | **CAUGHT** (1) | `claude_dir::no_hooks_come_from_the_hooks_directory_or_a_claude_hooks_json`                                                            |
| M2  | Claude skill discovery becomes recursive                      | **CAUGHT** (2) | `effective::a_nested_skill_is_not_loaded_for_claude…`; census `shared_fixture_nested_skill_answers_each_agent_differently`             |
| M3  | Capability ceiling stops at nearest `.git` (no widening)      | **CAUGHT** (2) | `ancestors::the_repository_ceiling_widens_to_the_outer_repository`; `inherited::a_nested_repository_still_inherits_from_the_outer_one` |
| M4  | Claude ancestor `.mcp.json` walk gains the capability ceiling | **CAUGHT** (1) | `inherited::the_mcp_walk_passes_the_repository_root…`                                                                                  |
| M5  | Claude stops reserving `synced/`                              | **CAUGHT** (1) | `claude_dir::the_reserved_synced_folder_holds_skills_rather_than_being_one`                                                            |
| M7  | Codex accepts a `SKILL.md` with no description                | **CAUGHT** (1) | `codex_skills::a_skill_without_a_description_is_never_loaded`                                                                          |
| M8  | Codex project layer loses its trust gate                      | **CAUGHT** (2) | `codex::every_project_capability_but_skills_states_the_trust_gate`; census `codex_fixture_census_counts_names_and_dedupe`              |
| M9  | Claude instruction walk stops at the repository root          | **CAUGHT** (1) | `inherited_memory::claude_reads_past_the_repository_root`                                                                              |
| M10 | Claude ancestors stop contributing commands                   | **CAUGHT** (6) | 3 census + `inherited::same_name_across_types_is_not_shadowed` …                                                                       |
| M11 | Claude accepts a loose `<name>.md` as a skill                 | **CAUGHT** (5) | `claude_dir::only_folders_holding_a_skill_md_are_skills` + 4 census                                                                    |
| M12 | Claude stops reading `.claude/CLAUDE.md`                      | **CAUGHT** (2) | census `claude_fixture_only_claude_census`; `copilot_cross_reads_both_documented_claude_md_locations`                                  |
| M14 | `claudeMdExcludes` excludes nothing                           | **CAUGHT** (5) | 3 unit + `instructions::claude_md_excludes_drops_files_for_claude_alone` + `inherited_memory::an_excluded_ancestor…`                   |
| M6  | Claude skill precedence → `FirstLoadedWins` (alone)           | **survived**   | _(no behaviour change — see below)_                                                                                                    |
| M6b | Claude skill source order added (alone)                       | **survived**   | _(no behaviour change — see below)_                                                                                                    |
| M13 | Codex `agents/` sort replaced by `reverse()`                  | **survived**   | **genuine weakness — see below**                                                                                                       |

### Round 2 — combinations and "apply the fix" probes

| #     | Mutation                                                                           | Result            | Notes                                                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M6c   | M6 **+** M6b together: same-name Claude skills resolve to a winner instead of U-13 | **CAUGHT** (2)    | `effective::claude_says_unknown_when_two_skills_share_a_name`; `inherited::only_sub_agents_claim_a_winner…`. **U-13 is genuinely pinned.** M6/M6b survived alone only because neither changes the output on its own. |
| M13b  | Codex `agents/` tie-break becomes reverse-lexicographic                            | **CAUGHT** (1)    | `codex::agent_files_scan_recursively_with_a_lexicographic_tie_break`                                                                                                                                                 |
| M15   | Claude agent precedence flips (user beats project)                                 | **CAUGHT** (1)    | `effective::opencode_takes_the_rootmost_ancestor_where_claude_takes_the_nearest`                                                                                                                                     |
| FIX-A | Instruction walk no longer stops at `$HOME` (**guide-conformant**)                 | **6 tests break** | Confirms §3.1 — the wrong behaviour is actively pinned. **Landed in `3f933432`**; the six tests were re-baselined                                                                                                    |
| FIX-B | Codex reads ancestor `AGENTS.md` to the repo root (**guide-conformant**)           | **1 test breaks** | Confirms §3.2. **Landed in `3f933432`**; the test was replaced                                                                                                                                                       |
| FIX-C | User MCP path uses the resolver (**guide-conformant**)                             | **0 tests break** | Confirms §3.3 — entirely unpinned. **Not landed**                                                                                                                                                                    |

**Score: 15 of 17 meaningful mutations caught.** Every claim I marked CONFORMS
and then mutated was in fact caught, except M13.

### The one CONFORMS row that failed its proof — M13

I marked "Codex `agents/**/*.toml` collisions break lexicographically-first"
CONFORMS on the strength of `codex.rs:380` (`toml_paths.sort()`) and the test at
`codex.rs:968`. Replacing `sort()` with `reverse()` — i.e. **deleting the sort
entirely** and leaving raw `read_dir` order — **passed**. Only an explicit
`sort(); reverse();` was caught.

So the test catches an inverted sort but not a _missing_ one: it is relying on
this filesystem's enumeration order to supply the ordering the code is supposed
to guarantee. On a filesystem with different `read_dir` ordering, removing the
sort would ship silently. **Reclassified: CONFORMS → IMPLEMENTED-UNTESTED** for
the tie-break specifically. (Counts in §2 reflect the reclassification.)

---

## 5. Full claim matrix

Evidence class is the guide's own (D / S / O / I / U / D≠S). `file:line` paths
are relative to `src-tauri/` unless noted.

### 5.1 Claude Code — `docs/claude-code.html`

| #   | Claim                                                                         | Anchor                      | Ev         | Impl?                                                                        | Where                                                                                                                                                                                                  | Pinned?                                                   | Test                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------- | --------------------------- | ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `$CLAUDE_CONFIG_DIR` relocates the whole user scope                           | #scopes                     | D/S        | yes                                                                          | `crates/toolr-core/src/coding_agent.rs:769-779`                                                                                                                                                        | yes                                                       | `claude_user_config_dir_honors_claude_config_dir`                                                                                                                         |
| C2  | User JSON state file is a **resolver result**, not `~/.claude.json`           | #scopes                     | S          | **partial**                                                                  | resolver `toolr-core/src/utils.rs:265-285`; **bypassed** at `scanner/mcp.rs:128`, `mcp/config_paths.rs:64`                                                                                             | **no**                                                    | — (FIX-C broke 0)                                                                                                                                                         |
| C3  | Managed roots (macOS/Linux/Windows) + `managed-settings.d`                    | #scopes                     | D/S        | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C4  | Server-managed tier cached at `~/.claude/remote-settings.json`                | #scopes                     | D/S        | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C5  | `$CLAUDE_CONFIG_DIR` registration list (18 dirs / 7 files)                    | #scopes                     | S          | partial                                                                      | skills/agents/commands/plugins only                                                                                                                                                                    | partial                                                   | census user-scope                                                                                                                                                         |
| C6  | `launch.json` is project-level configuration                                  | #scopes                     | S          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C7  | Auto memory at `<home>/projects/<key>/memory/`                                | #scopes                     | D/S        | yes                                                                          | `inherited_memory.rs:357-365`                                                                                                                                                                          | yes                                                       | `the_auto_memory_key_is_sanitized_and_anchored…`                                                                                                                          |
| C8  | `scheduled_tasks.json` exists at both scopes, opaque                          | #automation                 | D/S/U      | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C9  | `projects.<key>` = normalized abs **main-checkout** path                      | #mcp                        | S          | yes                                                                          | `mcp/config_paths.rs:19-22`                                                                                                                                                                            | yes                                                       | `mcp/tests.rs:946+`                                                                                                                                                       |
| C10 | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` are the instruction files | #instructions               | D          | yes                                                                          | `toolr-core/src/instruction_sources.rs:154-163`                                                                                                                                                        | yes                                                       | M12 (2 tests)                                                                                                                                                             |
| C11 | `.claude/rules/**/*.md` recursive                                             | #instructions               | D          | yes                                                                          | `inherited_memory.rs:79-109`                                                                                                                                                                           | yes                                                       | `finds_nested_rules_recursively`                                                                                                                                          |
| C12 | Per-directory order `CLAUDE.md → .claude/CLAUDE.md → rules → CLAUDE.local.md` | #instructions               | S          | **no**                                                                       | `coding_agent.rs:716` emits `CLAUDE.md, CLAUDE.local.md, .claude/CLAUDE.md`, rules last                                                                                                                | no                                                        | —                                                                                                                                                                         |
| C13 | Instruction walk has **no `$HOME` check**                                     | #inheritance                | S          | ~~**no**~~ → **yes** (`3f933432`)                                            | `instruction_sources.rs:444-449` (`FilesystemRootChild`); `ancestors.rs:48`                                                                                                                            | ~~**TESTED-WRONG**~~ → **CONFORMS** — fixed in `3f933432` | `the_home_directory_is_an_ordinary_ancestor_for_instructions`; `the_home_level_leaves_the_user_scopes_own_files_to_the_user_card`; `inherit_fixture_claude_memory_census` |
| C14 | Instruction walk has no repository check                                      | #inheritance                | S          | yes                                                                          | ~~`coding_agent.rs:718` `stop_at_repository_root: false`~~ → `instruction_sources.rs:447` `ceiling: InstructionCeiling::FilesystemRootChild` (`3f933432` replaced the boolean with a two-variant enum) | yes                                                       | M9; `the_ancestor_walk_matrix_matches_the_five_guides`                                                                                                                    |
| C15 | `claudeMdExcludes` removes files from the effective set                       | #instructions               | D/S        | yes                                                                          | `scanner/claude_md_excludes.rs`                                                                                                                                                                        | yes                                                       | M14 (5 tests)                                                                                                                                                             |
| C16 | Exclusion applies to User/Project/Local, never managed                        | #instructions               | D/S        | yes (narrowed, documented)                                                   | `claude_md_excludes.rs:14-21`                                                                                                                                                                          | yes                                                       | `committed_and_local_settings_both_contribute_patterns`                                                                                                                   |
| C17 | Block-level HTML comments stripped before injection                           | #instructions               | D/S        | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C18 | `@path` imports resolve relative, recurse 4 hops                              | #instructions               | D          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C19 | Linked-worktree instruction skip                                              | #instructions               | S          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C20 | Auto memory loads first 200 lines / 25 KB                                     | #instructions               | D/S        | yes (label only)                                                             | `scanner/instructions.rs:456`                                                                                                                                                                          | **no**                                                    | —                                                                                                                                                                         |
| C21 | Key = sanitized main checkout; 200-char truncate + base36                     | #instructions               | S          | yes                                                                          | `inherited_memory.rs:302-333`                                                                                                                                                                          | yes                                                       | `an_over_long_auto_memory_key_is_matched_on_disk…`                                                                                                                        |
| C22 | `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` sits above the derivation                | #instructions               | S          | yes                                                                          | `inherited_memory.rs:343-347`                                                                                                                                                                          | **no**                                                    | —                                                                                                                                                                         |
| C23 | `autoMemoryDirectory` needs trust → not resolvable by a scan                  | #instructions               | D/S        | yes (deliberate skip)                                                        | `inherited_memory.rs:350-356`                                                                                                                                                                          | n/a                                                       | documented deferral                                                                                                                                                       |
| C24 | Reserved subtrees `team/logs/sessions/proposals`                              | #instructions               | S          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C25 | Agent memory `~/.claude/agent-memory/<agent>/`                                | #instructions               | D          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C26 | A skill is a directory with `SKILL.md`; loose `.md` never loads               | #skills                     | S          | yes                                                                          | `coding_agent.rs:341-346`; `claude_dir.rs:246-251`                                                                                                                                                     | yes                                                       | M11 (5 tests)                                                                                                                                                             |
| C27 | Only the exact 4-segment shape; deeper is not a skill                         | #skills                     | S          | yes                                                                          | `scanner/effective.rs:223-250`                                                                                                                                                                         | yes                                                       | M2 (2 tests)                                                                                                                                                              |
| C28 | `SKILL.md` above 1e6 bytes is skipped                                         | #skills                     | S          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C29 | `synced` reserved in **any capitalization**                                   | #skills                     | D          | yes                                                                          | `claude_dir.rs:57-62`                                                                                                                                                                                  | yes                                                       | M5                                                                                                                                                                        |
| C30 | Synced skills have the **inverted** collision rule                            | #skills                     | D          | yes                                                                          | `claude_dir.rs:298-335` (`ConditionallyLoaded`)                                                                                                                                                        | yes                                                       | `the_reserved_synced_folder_holds_skills…`                                                                                                                                |
| C31 | Skill locations incl. managed, added-dir, bundled                             | #skills                     | D/S        | partial                                                                      | user/project/inherited/plugin only                                                                                                                                                                     | partial                                                   | census                                                                                                                                                                    |
| C32 | `skillOverrides` / `disableBundledSkills` / `disableSkillShellExecution`      | #skills                     | D          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C33 | **U-13** — same-name skill resolution is unknown                              | #unknowns                   | U          | yes                                                                          | `precedence_tables.rs:18-24`; `coding_agent.rs:570`                                                                                                                                                    | yes                                                       | **M6c** (2 tests)                                                                                                                                                         |
| C34 | Directory-scoped variants (`apps/web:deploy`)                                 | #skills                     | S          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C35 | `.claude/agents/**/*.md` recursive with frontmatter                           | #agents                     | D/S        | yes                                                                          | `claude_dir.rs:192-237`                                                                                                                                                                                | yes                                                       | census exact name set                                                                                                                                                     |
| C36 | Priority managed → session → project → user → plugin; closest project wins    | #agents                     | D/S        | yes                                                                          | `precedence_tables.rs:33-36`                                                                                                                                                                           | yes                                                       | M15                                                                                                                                                                       |
| C37 | Collision inside one recursive tree → no winner                               | #agents                     | S          | yes                                                                          | `effective.rs:382-407`                                                                                                                                                                                 | yes                                                       | `two_project_agents_of_one_name_stay_unresolved`                                                                                                                          |
| C38 | Hidden and gitignored `.md` files are included                                | #agents                     | S          | **no**                                                                       | `claude_dir.rs:213` skips dot-entries                                                                                                                                                                  | no                                                        | —                                                                                                                                                                         |
| C39 | Linked-worktree capability fallback                                           | #inheritance                | S          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C40 | Plugin agents ignore `hooks`/`mcpServers`/`permissionMode`                    | #agents                     | D          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C41 | `.claude/commands/` recursive `*.md`, namespaced                              | #skills                     | D          | yes                                                                          | `claude_dir.rs:192-237`                                                                                                                                                                                | yes                                                       | census `["ci:deploy","db:seed:rollback",…]`                                                                                                                               |
| C42 | **U-07** — no legacy-command tie-break across ancestors                       | #unknowns                   | U          | yes                                                                          | `coding_agent.rs:571`                                                                                                                                                                                  | yes                                                       | `unresolved_precedence` assertions                                                                                                                                        |
| C43 | A skill beats an unscoped legacy command                                      | #skills                     | D          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C44 | `.claude/hooks/` is **never** scanned                                         | #hooks                      | S          | yes                                                                          | `coding_agent.rs:298-314`; `claude_dir.rs:158-166`                                                                                                                                                     | yes                                                       | M1                                                                                                                                                                        |
| C45 | No project- or user-level `hooks.json` exists                                 | #hooks                      | S          | yes                                                                          | `claude_dir.rs:646-648`                                                                                                                                                                                | yes                                                       | M1's test covers both                                                                                                                                                     |
| C46 | Exactly five hook contributors                                                | #hooks                      | S          | partial (2 of 5)                                                             | settings + plugin `hooks/hooks.json`                                                                                                                                                                   | partial                                                   | census hook ids                                                                                                                                                           |
| C47 | 31-event vocabulary                                                           | #hooks                      | D/S        | n/a (key-agnostic)                                                           | —                                                                                                                                                                                                      | —                                                         | N/A                                                                                                                                                                       |
| C48 | `hookSource` renders as `plugin:` / `skill:` / `settings`                     | #hooks                      | S          | partial                                                                      | `plugin_name` + `source`                                                                                                                                                                               | **no**                                                    | —                                                                                                                                                                         |
| C49 | `allowManagedHooksOnly` / `disableAllHooks` collapse the set                  | #hooks                      | D/S        | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C50 | Repeated settings handler dedupes; plugin/skill copies stay distinct          | #hooks                      | D          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C51 | User MCP = resolved global file's top-level `mcpServers`                      | #mcp                        | S          | **partial**                                                                  | `scanner/mcp.rs:121-152` hard-codes                                                                                                                                                                    | **no**                                                    | —                                                                                                                                                                         |
| C52 | Local MCP = `projects[key].mcpServers` in the same file                       | #mcp                        | S          | yes                                                                          | `mcp/config_paths.rs:19-22`                                                                                                                                                                            | yes                                                       | `mcp/tests.rs:946+`                                                                                                                                                       |
| C53 | `~/.mcp.json` does **not** exist as an input                                  | #mcp                        | S          | yes (absent everywhere)                                                      | —                                                                                                                                                                                                      | **no**                                                    | —                                                                                                                                                                         |
| C54 | Project `.mcp.json` walks ancestors, merged root→cwd, closest wins            | #mcp                        | S, D≠S     | yes                                                                          | `coding_agent.rs:410-422`; `inherited.rs:147-174`                                                                                                                                                      | yes                                                       | M4 + 3 unit + census                                                                                                                                                      |
| C55 | That walk has neither ceiling                                                 | #mcp                        | S          | ~~yes (repo half); `$HOME` bound kept~~ → **yes (both halves)** (`cf7ff9a8`) | `scanner/inherited.rs:139-179`                                                                                                                                                                         | yes                                                       | `the_mcp_walk_passes_the_repository_root…`; `the_mcp_walk_reads_the_home_directory_as_an_ordinary_level`                                                                  |
| C56 | Precedence local → project → user, whole-server replacement                   | #mcp                        | D          | yes                                                                          | `precedence_tables.rs:45-48`                                                                                                                                                                           | yes                                                       | `claude_resolves_a_contested_mcp_name…`                                                                                                                                   |
| C57 | `enabledMcpjsonServers` / `disabledMcpjsonServers` approval lists             | #mcp                        | D/S        | yes                                                                          | `scanner/mcp.rs:82`; `mcp/read.rs:245`                                                                                                                                                                 | yes                                                       | `mcp/tests.rs:864`                                                                                                                                                        |
| C58 | `managed-mcp.json` is an exclusive administrative set                         | #mcp                        | D          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C59 | `${VAR}` / `${VAR:-default}` expansion — authored ≠ effective                 | #mcp                        | D          | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C60 | Plugin manifest is optional; defaults auto-discovered                         | #plugins                    | D/S        | yes                                                                          | `plugins/manifest.rs:78-96`                                                                                                                                                                            | yes                                                       | `plugins/tests.rs:586,612`                                                                                                                                                |
| C61 | `skills` **adds**; `commands`/`agents` **replace**                            | #plugins                    | D/S        | yes                                                                          | `plugins/manifest.rs:88-95`                                                                                                                                                                            | yes                                                       | `declared_command_and_agent_paths_replace_the_default_directory`; `a_declared_skills_path_adds…`                                                                          |
| C62 | Single-skill plugins (root `SKILL.md`)                                        | #plugins                    | D/S        | yes                                                                          | `plugins/manifest.rs:105-109`                                                                                                                                                                          | **no**                                                    | —                                                                                                                                                                         |
| C63 | Skills-directory plugins load in place as `<name>@skills-dir`                 | #plugins                    | D          | yes                                                                          | `plugins/`                                                                                                                                                                                             | yes                                                       | `skills_dir_plugin_is_listed_without_an_install_record`                                                                                                                   |
| C64 | `pluginConfigs` / `autoMode` ignored outside user scope                       | #plugins, #session-controls | D          | yes                                                                          | `claude_dir.rs:739-750`                                                                                                                                                                                | **no**                                                    | —                                                                                                                                                                         |
| C65 | Disabled plugin's capabilities never load                                     | #plugins                    | D          | yes                                                                          | `effective.rs:261-277`                                                                                                                                                                                 | yes                                                       | `a_disabled_plugins_capability_never_loads_and_never_competes`                                                                                                            |
| C66 | Marketplace catalogs are `.claude-plugin/marketplace.json`                    | #installing                 | D/S        | yes                                                                          | `plugins/marketplaces.rs`                                                                                                                                                                              | yes                                                       | `listing_includes_unsynced_and_legacy_entries`                                                                                                                            |
| C67 | Managed marketplace restrictions (`strictKnownMarketplaces`, …)               | #installing                 | D/S        | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C68 | Dual ceiling: `$HOME` exclusive / repo inclusive                              | #inheritance                | S          | yes                                                                          | `ancestors.rs:94-115`                                                                                                                                                                                  | yes                                                       | M3 (2 tests)                                                                                                                                                              |
| C69 | Repo ceiling **widens** to the outer repository                               | #inheritance                | S          | yes                                                                          | `ancestors.rs:94-105`                                                                                                                                                                                  | yes                                                       | M3                                                                                                                                                                        |
| C70 | Six capability dirs share the walk                                            | #inheritance                | S          | **partial (3 of 6)**                                                         | `coding_agent.rs:374`                                                                                                                                                                                  | partial                                                   | M10 (6 tests) for the 3 present                                                                                                                                           |
| C71 | Project `settings.json` read at cwd only, never walked                        | #inheritance                | S          | yes                                                                          | ancestor scan excludes settings                                                                                                                                                                        | yes                                                       | `ancestor_settings_are_not_reported_as_capabilities`                                                                                                                      |
| C72 | Settings precedence (scannable tiers user < project < local)                  | #precedence                 | D/S        | yes                                                                          | `precedence_tables.rs:51-54`                                                                                                                                                                           | yes                                                       | census `settings`/`settings.local` sources                                                                                                                                |
| C73 | Local settings canonicalize to the Git **main checkout**                      | #inheritance                | S          | **no**                                                                       | `claude_dir.rs:641-660` project-relative                                                                                                                                                               | no                                                        | —                                                                                                                                                                         |
| C74 | Instructions concatenate, never shadow                                        | #precedence                 | S          | yes                                                                          | `claude_precedence` `AllApply`; `shadowed_by: None`                                                                                                                                                    | yes                                                       | `every_ancestor_level_is_reported_for_claude`                                                                                                                             |
| C75 | `fallbackModel` never merges; `extraKnownMarketplaces` version gate           | #inheritance                | D/S        | no                                                                           | —                                                                                                                                                                                                      | no                                                        | —                                                                                                                                                                         |
| C76 | Claude does **not** natively discover `AGENTS.md`                             | #cross-tool                 | D          | yes                                                                          | `instruction_sources.rs:154-163`                                                                                                                                                                       | yes                                                       | `claude_project_level_excludes_agents_md…`; `claude_never_consumes_agents_surfaces`                                                                                       |
| C77 | Shared surfaces + the exact 5-key `.claude/settings.json` subset              | #cross-tool                 | S          | yes                                                                          | `coding_agent.rs:884-932`                                                                                                                                                                              | yes                                                       | `copilot_reads_five_keys_of_claude_settings_and_no_more`                                                                                                                  |
| C78 | **U-16** — `$CLAUDE_CONFIG_DIR` vs OpenCode's literal `~/.claude`             | #unknowns                   | U→resolved | yes                                                                          | `instruction_sources.rs:319-329`                                                                                                                                                                       | yes                                                       | `opencode_reads_the_literal_claude_home…`                                                                                                                                 |

### 5.2 OpenAI Codex — `docs/openai-codex.html`

| #   | Claim                                                                                       | Anchor        | Ev  | Impl?                                                                                                       | Where                                                                                                                         | Pinned?                                                   | Test                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------- | ------------- | --- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X1  | `$CODEX_HOME` relocates the whole user scope                                                | #scopes       | D   | yes                                                                                                         | `coding_agent.rs:769-779`                                                                                                     | **no**                                                    | —                                                                                                                                                                  |
| X2  | System scope `/etc/codex/{config.toml,skills,agents,rules,hooks.json}`                      | #scopes       | D/S | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X3  | Profile overlay `$CODEX_HOME/<name>.config.toml`                                            | #scopes       | D   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X4  | There is **no** `config.local.toml`                                                         | #layers       | S   | yes (correctly absent)                                                                                      | —                                                                                                                             | **no**                                                    | —                                                                                                                                                                  |
| X5  | Numeric layer precedence 50/40/30/25/21/20/15/10/0                                          | #layers       | S   | abstracted                                                                                                  | `precedence_tables.rs:89-92` (Plugin→User→Project)                                                                            | partial                                                   | —                                                                                                                                                                  |
| X6  | Project denylist strips `openai_base_url`, `model_provider`, `notify`, `profile`, `otel`, … | #layers       | S   | **partial (`notify` only)**                                                                                 | `scanner/codex_config.rs:297-307`                                                                                             | partial                                                   | `notify_is_a_hook_and_the_project_copy_is_denylisted`                                                                                                              |
| X7  | Project layers are trust-gated; skills are the exception                                    | #rules        | D/S | yes                                                                                                         | `scanner/codex.rs:262-273`, `:217-236`                                                                                        | yes                                                       | **M8** (2 tests incl. census)                                                                                                                                      |
| X8  | `[features]` gates capabilities (`hooks`, `plugins`, `memories`, `goals`)                   | #layers       | S   | partial (`hooks`)                                                                                           | `codex_config.rs:449`                                                                                                         | partial                                                   | `hooks_feature_off_is_conditional_not_absolute`                                                                                                                    |
| X9  | `requirements.toml` enforcement surface                                                     | #precedence   | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X10 | Upward search for the root via `project_root_markers` (default `.git`)                      | #instructions | S   | ~~**no**~~ → **partial** (`3f933432`): the default `.git` search runs; the configurable key is still unread | `instruction_sources.rs:360` (`RepositoryRoot`) → `ancestors::repository_root`; `project_root_markers` still zero occurrences | partial                                                   | `codex_reads_ancestor_agents_md_up_to_the_repository_root` (default marker only) — row stays **NOT-IMPLEMENTED** for the key                                       |
| X11 | Collect **every** `AGENTS.md` root→cwd inclusive                                            | #instructions | D/S | ~~**no**~~ → **yes** (`3f933432`)                                                                           | `instruction_sources.rs:459-464` (`CODEX_ANCESTORS`)                                                                          | ~~**TESTED-WRONG**~~ → **CONFORMS** — fixed in `3f933432` | `codex_reads_ancestor_agents_md_up_to_the_repository_root`; `a_codex_override_silences_its_own_directory_only`; `the_ancestor_walk_matrix_matches_the_five_guides` |
| X12 | Global slot is exactly `AGENTS.override.md` then `AGENTS.md`                                | #instructions | D/S | yes                                                                                                         | `instruction_sources.rs:196-209`                                                                                              | yes                                                       | `codex.rs:1128`; `only_codex_and_opencode_rank…`                                                                                                                   |
| X13 | Fallback filenames cannot reach the global slot                                             | #instructions | S   | yes                                                                                                         | class ranking, config-dir root                                                                                                | yes                                                       | same                                                                                                                                                               |
| X14 | No byte budget on the global slot                                                           | #instructions | S   | yes (trivially)                                                                                             | —                                                                                                                             | n/a                                                       | —                                                                                                                                                                  |
| X15 | Per directory: at most one file, override → base → fallback                                 | #instructions | D/S | yes (at the project root)                                                                                   | `instruction_sources.rs:187-194` (`class` 0/1)                                                                                | yes                                                       | `codex_override_shadows_agents_md_for_codex_only`; census `:393`                                                                                                   |
| X16 | `project_doc_fallback_filenames` is configurable                                            | #instructions | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X17 | 32 KiB shared budget; **closest file truncated first**                                      | #instructions | D/S | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X18 | Three config instruction channels + resolution order                                        | #instructions | S   | yes                                                                                                         | `codex_config.rs`                                                                                                             | yes                                                       | `config_instruction_channels_are_reported_highest_first`                                                                                                           |
| X19 | Skill = directory + `SKILL.md`; missing `description` fails the parse                       | #skills       | D/S | yes                                                                                                         | `codex_skills.rs:155-164`                                                                                                     | yes                                                       | **M7**; census `flaky-tests`                                                                                                                                       |
| X20 | `.agents/skills` joined to **every** directory root→cwd                                     | #skills       | S   | **no**                                                                                                      | `codex.rs:46-57` (project root, dedupe only); `:94-105` (`$HOME`)                                                             | no                                                        | —                                                                                                                                                                  |
| X21 | Roots `.codex/skills`, `~/.agents/skills`, `$CODEX_HOME/skills`, bundled `.system`          | #skills       | S/O | yes                                                                                                         | `codex.rs:94-137`; `codex_skills.rs:268`                                                                                      | yes                                                       | `user_scan_reports_prompts_instructions_and_both_skill_locations`                                                                                                  |
| X22 | Roots `/etc/codex/skills` and plugin roots                                                  | #skills       | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X23 | Results de-duplicate by path                                                                | #skills       | S   | yes                                                                                                         | `codex.rs` canonical dedupe                                                                                                   | yes                                                       | `user_scan_dedupes_legacy_skills_by_canonical_path`                                                                                                                |
| X24 | `[[skills.config]]`: path **or** name (exactly one), required `enabled`, later wins         | #skills       | D/S | yes                                                                                                         | `codex_config.rs:114-200`                                                                                                     | yes                                                       | `later_skills_config_rules_override_earlier_ones`; `…entries_the_loader_ignores_disable_nothing`                                                                   |
| X25 | `skills.bundled.enabled`                                                                    | #skills       | S   | yes                                                                                                         | `codex_config.rs:80-86`; `codex_skills.rs:280-290`                                                                            | yes                                                       | `bundled_system_skills_are_generated_state…`                                                                                                                       |
| X26 | `skills.include_instructions`                                                               | #skills       | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X27 | `agents/openai.yaml` fail-open; `allow_implicit_invocation:false` hides, does not disable   | #skills       | D/S | yes                                                                                                         | `codex_skills.rs:173-205`                                                                                                     | yes                                                       | `openai_yaml_hides_a_skill_from_the_catalog_without_disabling_it`; census                                                                                          |
| X28 | Catalog budget (2% ctx / 8000 chars / 1024 desc)                                            | #skills       | D/S | no                                                                                                          | runtime                                                                                                                       | n/a                                                       | **N/A**                                                                                                                                                            |
| X29 | `agents/**/*.toml` scanned recursively                                                      | #agents       | S   | yes                                                                                                         | `codex.rs:424-439`                                                                                                            | yes                                                       | `agent_files_scan_recursively_with_a_lexicographic_tie_break`                                                                                                      |
| X30 | System-layer agents participate                                                             | #agents       | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X31 | Inline `[agents]` beats a same-name file in one layer                                       | #agents       | S   | yes                                                                                                         | `codex.rs:185-189`, `:382-390`                                                                                                | yes                                                       | `inline_agent_tables_win_over_same_name_agent_files`; census `:223-237`                                                                                            |
| X32 | Lexicographically first wins inside a recursive scan                                        | #agents       | S   | yes                                                                                                         | `codex.rs:380`                                                                                                                | **weak**                                                  | M13 survived; M13b caught — see §4                                                                                                                                 |
| X33 | Cross-layer merge is **per field** (higher inherits unset fields)                           | #agents       | S   | no (wholesale)                                                                                              | `precedence_tables.rs:89-92`                                                                                                  | no                                                        | —                                                                                                                                                                  |
| X34 | The effective name, not the filename, is identity                                           | #agents       | D/S | yes                                                                                                         | `codex.rs:409-410`                                                                                                            | yes                                                       | `agent_toml_parse_prefers_document_fields`                                                                                                                         |
| X35 | `$CODEX_HOME/prompts/*.md` is **D/U** — scan, do not assert                                 | #prompts      | D/U | yes                                                                                                         | `codex.rs:137` + unverified label                                                                                             | yes                                                       | `user_scan_reports_prompts_instructions_and_both_skill_locations`                                                                                                  |
| X36 | No project prompt directory                                                                 | #prompts      | S   | yes                                                                                                         | `coding_agent.rs:263`                                                                                                         | yes                                                       | `project_scan_never_emits_prompts`; census `:371`                                                                                                                  |
| X37 | `hooks.json` **and** inline `[hooks]` both load                                             | #hooks        | D/S | yes                                                                                                         | `codex.rs:317-326`, `:443-459`                                                                                                | yes                                                       | `hooks_from_both_sources_stay_visible`; census 7 exact ids                                                                                                         |
| X38 | A layer carrying both emits a warning                                                       | #hooks        | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X39 | Exactly eleven hook events                                                                  | #hooks        | S   | n/a (key-agnostic)                                                                                          | —                                                                                                                             | —                                                         | **N/A**                                                                                                                                                            |
| X40 | Only command handlers execute at 0.147.0                                                    | #hooks        | D/S | n/a                                                                                                         | —                                                                                                                             | —                                                         | **N/A**                                                                                                                                                            |
| X41 | Linked worktrees redirect hook discovery to the **main checkout**                           | #hooks        | S   | **no**                                                                                                      | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X42 | `notify` is a hook-adjacent executable, denylisted at project scope                         | #hooks        | S   | yes                                                                                                         | `codex_config.rs:270-309`                                                                                                     | yes                                                       | `notify_is_a_hook_and_the_project_copy_is_denylisted`; census                                                                                                      |
| X43 | Hash trust gate / `allow_managed_hooks_only` / bypass flag                                  | #hooks        | D   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X44 | MCP is `[mcp_servers.<id>]` TOML                                                            | #mcp          | D/S | yes                                                                                                         | `codex.rs:807`-region                                                                                                         | yes                                                       | `config_toml_mcp_servers_become_mcp_children`; census 4 names                                                                                                      |
| X45 | No live reader for root `.mcp.json`, `.github/mcp.json`, `.vscode/mcp.json`                 | #mcp          | S   | yes                                                                                                         | `coding_agent.rs:906`, `:834-838`                                                                                             | yes                                                       | `project_config_roots_cover_each_agents_own_directory`                                                                                                             |
| X46 | Plugin-root `.mcp.json` **is** live-read                                                    | #mcp          | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X47 | Same-ID deep-merge per key; arrays/scalars replace wholesale                                | #mcp          | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X48 | `codex mcp add` has no scope flag; project entries authored by hand                         | #mcp          | S   | yes                                                                                                         | `mcp/config_paths.rs:96-109`                                                                                                  | yes                                                       | `mcp_write_path_removes_what_the_scanner_lists`                                                                                                                    |
| X49 | Inline `bearer_token` rejected for `bearer_token_env_var`                                   | #mcp          | D/S | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X50 | Credential stores configurable (`mcp_oauth_credentials_store`, …)                           | #mcp          | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X51 | `.rules` is **execution policy**, not instruction context                                   | #rules        | D   | yes                                                                                                         | separate `rule` component type                                                                                                | yes                                                       | census 3 exact names + descriptions                                                                                                                                |
| X52 | Combination is restrictive; nothing is shadowed                                             | #rules        | D   | yes                                                                                                         | `codex_precedence` `AllApply`                                                                                                 | yes                                                       | census                                                                                                                                                             |
| X53 | Project rules load only when the project layer is trusted                                   | #rules        | D/S | yes                                                                                                         | `codex.rs:262-273`                                                                                                            | yes                                                       | **M8**; census `:341-352`                                                                                                                                          |
| X54 | User `default.rules` is partly **generated**, not authored                                  | #rules        | S   | yes                                                                                                         | `codex.rs` description branch                                                                                                 | yes                                                       | `the_user_default_rules_file_says_it_is_partly_generated`                                                                                                          |
| X55 | Starlark builtins `prefix_rule` / `network_rule` / `host_executable`                        | #rules        | D/S | content surfaced                                                                                            | `codex.rs:550-565`                                                                                                            | partial                                                   | census content substrings                                                                                                                                          |
| X56 | Root `plugin.json` probed **first**, symlink-rejected, `$schema`-gated                      | #plugins      | S   | **no**                                                                                                      | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X57 | Fallback `.codex-plugin` → `.claude-plugin` → `.cursor-plugin`; overlay                     | #plugins      | S   | **no** (zero occurrences)                                                                                   | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X58 | Marketplace: first existing of four paths per root                                          | #plugins      | S/O | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X59 | `[marketplaces.<name>]` persisted in user `config.toml`                                     | #plugins      | S/O | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X60 | Per-plugin MCP policy overlays                                                              | #plugins      | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X61 | `features.plugins` gates the whole plugin system                                            | #layers       | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X62 | `$CODEX_HOME/memories` generated tree                                                       | #memory-goals | D/S | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X63 | `goals_1.sqlite` via `sqlite_home` → `CODEX_SQLITE_HOME` → `$CODEX_HOME`                    | #memory-goals | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X64 | `sessions/` rollouts + `session_index.jsonl`                                                | #memory-goals | S   | no                                                                                                          | —                                                                                                                             | no                                                        | —                                                                                                                                                                  |
| X65 | Codex shares exactly `AGENTS.md` and `.agents/skills`                                       | #cross-tool   | D   | yes                                                                                                         | `coding_agent.rs:886-897`                                                                                                     | yes                                                       | `shared_surface_consumer_table`                                                                                                                                    |
| X66 | `.agents/` is not a portable root beyond `skills`                                           | #cross-tool   | D/S | yes                                                                                                         | `coding_agent.rs:848-862`                                                                                                     | yes                                                       | census consumer sets                                                                                                                                               |
| X67 | Codex does not live-read `.claude/*`                                                        | #cross-tool   | D   | yes                                                                                                         | consumer tables                                                                                                               | yes                                                       | `shared_fixture_dual_symlinks_dedupe_to_agents_ownership`                                                                                                          |
| X68 | `CLAUDE.md` is not a default Codex input                                                    | #cross-tool   | D   | yes                                                                                                         | `instruction_sources.rs:187-194`                                                                                              | yes                                                       | `claude_project_level_excludes_agents_md_while_codex_includes_it`                                                                                                  |

---

## 6. Notes on test strength

Beyond the mutation results, four structural observations:

1. **The census fixtures are the real safety net.** `only-claude` pins 27
   components with exact name sets for skills, commands, agents, hooks, MCP and
   settings; `only-codex` pins 25 with exact hook ids, agent paths, rule
   descriptions and three distinct `LoadVerdict` variants. Mutations M8, M10,
   M11 and M12 were all caught by census tests.

2. **Claude has no positive `LoadVerdict::Loaded` assertion anywhere.** The only
   Claude verdict a census test asserts is `NotLoaded` (the 2-deep nested skill,
   `fixture_census_legacy.rs:316`). Nothing pins that an ordinary Claude skill
   is reported as _loaded_.

3. **No census test asserts `"user"` provenance**, and none covers Codex
   inherited instructions — which is why FIX-B broke only one unit test.
   _(Since `3f933432`: still no census case for Codex inherited instructions —
   `fixture_census.rs` has `inherit_fixture_claude_memory_census` and
   `inherit_fixture_opencode_memory_census` and no Codex equivalent — but the
   behaviour is now pinned by two unit tests, `inherited_memory.rs:843` and
   `:873`. The `"user"` provenance gap is unchanged.)_

4. **`fixture_census_legacy.rs:336-340` is vacuous:**
   `assert!(state.is_none_or(|state| state.verdict == LoadVerdict::Loaded))`
   passes when no verdict exists at all. It proves nothing.

Also worth recording: 4 census tests silently require the checkout to be a real
git repository (`fixture_census.rs:493` — "census runs inside the repository
checkout"). In a source export without `.git` they fail for environmental
reasons.

---

## 7. What it would take to close the gaps

Ordered by risk-reduction per unit of work.

**Tier 1 — correctness bugs with a green test on top (do these first)**

> **Items 1 and 2 landed in `3f933432`** — by a different route than proposed
> here: the bound and the class rule became two fields on `InheritedMemory`
> (`InstructionCeiling`, `ClassRange`) rather than per-call arguments, so all
> five coding agents are answered by one table. **Item 3 has not landed**;
> `scanner/mcp.rs:128` and `mcp/config_paths.rs:64` still hard-code
> `~/.claude.json`.

1. **`$HOME/CLAUDE.md`** — drop the `home` bound from the _instruction_ walk
   only (`inherited_memory.rs:167` → `ancestor_dirs(project_path, None)`),
   keeping it for the capability walk. Then delete
   `inherited_memory.rs:506-523` (`walk_stops_at_home`) and re-baseline the 5
   census memory tests. Reconcile the contradictory comment at
   `instruction_sources.rs:165-168`. _~1 file + 6 test updates._
2. **Codex ancestor `AGENTS.md`** — give Codex an `InheritedMemory` with
   `classes: [["AGENTS.override.md", "AGENTS.md"]]` and
   `stop_at_repository_root: true`; update
   `agents_that_never_look_upwards_inherit_nothing` and
   `coding_agent.rs:1013-1019`; add a Codex inherited-instruction census case.
   Correct the "never walks past the project root" comment
   (`coding_agent.rs:366-368`) — it means _up to_, not _not at all_.
3. **Route the two remaining callers through `get_claude_config_path()`** —
   `mcp/config_paths.rs:64` and `scanner/mcp.rs:128` (the latter needs the
   resolved path threaded through the mock-mode `home_dir` seam). FIX-C proved
   this breaks nothing; add a test so it stays fixed.

**Tier 2 — visible missing surfaces**

4. **Claude `workflows/`, `output-styles/`, `routines/`** — add to
   `coding_agent.rs:374` and `claude_dir.rs:159-164`; `routines` has no
   published file schema, so list it and mark the contents unspecified, as the
   guide instructs.
5. **Codex `.agents/skills` per-directory join** — falls out of fix #2, since
   both need the same root→cwd directory list.
6. **Linked-worktree trio** — Claude local settings resolved to the main
   checkout, Claude capability fallback, Codex hook redirect. All three can
   reuse `ancestors::git_main_checkout_root`, which already exists and is tested.

**Tier 3 — pin what is already right (10 rows, cheap)**

7. Add tests for `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE`, `$CODEX_HOME`, the
   auto-memory 200-line/25 KB label, single-skill plugins, the
   `autoMode`/`pluginConfigs` scope refusal, and the absence of `~/.mcp.json`.
8. **Strengthen the Codex tie-break test** (`codex.rs:968`) so that _removing_
   `toml_paths.sort()` fails, not only inverting it — e.g. seed the fixture with
   files whose creation order is deliberately not lexicographic.
9. Replace the vacuous `is_none_or` assertion at
   `fixture_census_legacy.rs:336-340` with a positive
   `LoadVerdict::Loaded` check, and add one positive Claude `Loaded` assertion.

**Tier 4 — decide and write it down**

10. The remaining ~50 NOT-IMPLEMENTED rows are whole product surfaces: managed /
    enterprise scope, Codex's plugin + marketplace stack, `@import` resolution,
    HTML-comment stripping, `${VAR}` expansion, Codex `memories`/`goals`/
    `sessions`. Most are legitimate scope decisions — but **54 of the 60 are
    silent**. Record them as explicit deferrals (a `## Not modelled` section per
    guide, or a comment at the relevant `CodingAgent` method), so the next audit
    can tell a decision from an oversight. The codebase already does this well
    in places — `plugins/manifest.rs:74-77`, `claude_md_excludes.rs:14-21` and
    `inherited.rs:143-146` are the model to copy.

---

_Audit performed read-only. No install or removal was executed. Mutation testing
ran against a scratchpad copy; the repository working tree is unmodified._
