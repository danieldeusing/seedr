# Conformance audit — OpenCode, and the cross-tool claims

Independent read-only audit of `docs/opencode.html` against the Configr
implementation, plus the parts of `docs/cross-tool-matrix.html` no
single-agent audit owns — the multi-agent artifact rows, the inheritance
comparison, the four precedence directions, the vocabulary map and the
U-01…U-16 register — plus the install path against `docs/seedr-install-audit.md`
and the fixes in `d3d1e445`.

- Repo `/Users/daniel/Work/twiced/toolr/configr`, branch `main`, HEAD `d3d1e445`, clean.
- **No tracked file was modified.** Every mutation ran against an `rsync` copy in
  a scratchpad; probes were added there and never here.
- Test suite at HEAD: `cargo test --workspace` → **742 passed, 0 failed**
  (640 `toolr-configr` + 102 `toolr-core`). Frontend suite not re-run; the
  install-UI tests were read, not executed.

---

## 0. Status since this audit

This audit was written against `d3d1e445`. Eight of its findings have since been
fixed, plus the `LoadVerdict` blind spot §1 calls the headline. The record of
what was wrong is kept; only the claim about the present tense changes.

**Convention used throughout this file.** A superseded verdict is struck through
and followed by `→ <new class> — fixed in <commit>`. A narrative finding keeps
its original text under a heading prefixed `RESOLVED`, with the fix stated
first. §2 carries the recomputed totals beside the ones as audited. Mutation
tables, probe transcripts and the §8 plan are records of what was true at
`d3d1e445` and are left exactly as written.

| Row   | Claim                                                                | As audited               | Now          | Fixed in   |
| ----- | -------------------------------------------------------------------- | ------------------------ | ------------ | ---------- |
| `O31` | First-match across classes, across the whole walk (TW-1)             | TESTED-WRONG             | **CONFORMS** | `3f933432` |
| `O46` | Project `CLAUDE.md` loads only if no `AGENTS.md` (TW-1)              | TESTED-WRONG             | **CONFORMS** | `3f933432` |
| `O26` | `OPENCODE_DISABLE_PROJECT_CONFIG` exempts foreign skill roots (BS-1) | IMPLEMENTED-BEYOND-SPEC  | **CONFORMS** | `3f933432` |
| `X26` | Vocabulary — **Plugin** (BS-2, the install refusal)                  | IMPLEMENTED-BEYOND-SPEC  | **CONFORMS** | `3f933432` |
| `O12` | `.jsonc` wins over `.json` in one directory (D-1)                    | IMPLEMENTED-AGAINST-SPEC | **CONFORMS** | `3f933432` |
| `O98` | U-09: duplicate skill names get `Unknown`, never a winner            | IMPLEMENTED-UNTESTED     | **CONFORMS** | `3f933432` |
| `O37` | `CONTEXT.md` is OpenCode's third instruction class                   | IMPLEMENTED-UNTESTED     | **CONFORMS** | `3f933432` |
| `X05` | `CONTEXT.md` is OpenCode-only, third class (same finding as `O37`)   | IMPLEMENTED-UNTESTED     | **CONFORMS** | `3f933432` |

`O37`/`X05` were not named in the fix commit — they fall out of a test it added
for a different reason, and the re-classification rests on reading
`the_ancestor_classes_align_with_the_project_table_class_for_class`
(`instruction_sources.rs:709`) rather than on re-running mutation M38. The
argument is in the `O37` row of §4.1; check it before relying on it.

Two more rows keep their class but no longer read true, and are corrected in
place:

- **`O10`** (legacy `~/.opencode`) stays a documented deferral, because the half
  the row turns on — that the directory _outranks every project one_ — is still
  deliberately not expressed. But the other half shipped: `scan_legacy_user_root`
  (`scanner/opencode.rs:83`, wired into `scan_user_scope` in `scanner/mod.rs`)
  now lists it,
  stamping every card `LoadVerdict::Unknown` with `LEGACY_ROOT_NOTE`. §7's
  "install into a root the browser denies exists" is therefore closed.
- **`O119`** (TUI stack, ×4 collapsed sub-claims) keeps its class, but one of
  its four is done: the `theme` / `keybinds` / `tui` strip is now stated on the
  settings card.

**Not fixed, still live:** `TW-2` (`O89`, OpenCode's user scope omits
`~/.claude/skills` and `~/.agents/skills`) and `D-2` (two settings cards resolve
to `Unknown` citing a register with no entry for them, plus the `settingss`
typo). All 48 silent gaps stand except the `O119` sub-claim noted above.

---

## 1. Executive verdict

### Q1 — "Did we implement exactly what the docs specify?"

**Mostly, and the misses are concentrated in one place: the instruction
filename-class rule stops working the moment the two files sit at different
levels.**

Of **158** normative claims extracted, **108 are implemented**, and of those
**101 are implemented correctly** (89 with a test that would catch a
regression, 12 without). _(Since `3f933432`: **106 correct** — 97 pinned, 9
not.)_ The mechanically hard parts are right and right for
the right reason:

- Merge-all _within_ a class and first-match _across_ classes — correct.
- The two opposite project walks in one repository — top-level `opencode.json(c)`
  closest-wins, `.opencode` rootmost-wins, `.opencode` outranking its own
  sibling — all three correct, and correct in the MCP collector _and_ in the
  effective-state pass.
- The `ctx.worktree` inclusive ceiling, a linked worktree as its own root,
  singular+plural with no precedence, recursive agent/command globs against
  single-level `mode`/`tool`/`plugin` globs, the mode-file deep merge, the
  `environment` key, the bare `{enabled}` toggle, V1-vs-V2 discrimination by key
  shape, no hooks surface, `**/SKILL.md` deeper than Claude accepts, the literal
  `~/.claude/CLAUDE.md` anchoring that resolves U-16.

**But seven claim rows — six distinct defects — are implemented against the
guide, and three of those rows are pinned by green tests.** The worst is not
exotic: OpenCode's class rule is evaluated
**per directory** for a project's own files (`scanner/instructions.rs:316`) and
**per walk** for ancestors (`inherited_memory.rs:131`). The result is visible in
the repository's own showcase fixture — the same `AGENTS.md` files suppress two
ancestor `CLAUDE.md` cards and fail to suppress the project's own, in one
project view.

> **Since `3f933432`: two claim rows, two distinct defects, remain** (`O89`/TW-2
> and `D-2`). The split-owner class rule is gone —
> `inherited_memory::ancestor_class_floor` (`:182`) is fed into the project scan
> at `scanner/instructions.rs:442` and combined at `:358-359`, so one range
> answers both halves of the screen.

The 47 unimplemented claims are overwhelmingly whole subsystems that were never
built — themes, the TUI stack, the ten-layer merge, managed/MDM/remote/org
layers, `skills.paths`/`skills.urls`, the command registration order, the tool
shadow order. Four of them carry a written reason. The rest are silent.

### Q2 — "Did we test that it actually works as expected?"

**The discovery layer is very well tested. The _verdict_ layer — what the app
tells the user actually loads — is barely tested at all for OpenCode, and the
single most emphatic instruction in the guide is defended by nothing.**

- **89 of 108 implemented claims (82%) are pinned.** I ran **44 distinct
  mutations**; **31 were caught**, 13 survived, and 2 of those survivors are
  equivalent mutants — so **11 genuine survivors**, a 74% kill rate on
  non-equivalent mutants. _(Since `3f933432`: **97 of 108, 90%**; seven of the
  thirteen survivors are dead, leaving **4 genuine survivors** and a 90% kill
  rate — see §5.)_
- The `example/` census assertions are the real thing: `only-opencode` pins an
  exact 34-row `(type, name)` census, exact per-type totals with singular _and_
  plural evidence, exact skill support-file lists, an exact presence count of 35.
  Ten separate mutations die on that one file.
- The `acme-corp` census pins the ancestor walk end to end, including
  rootmost-wins shadowing and the ancestor class suppression.

**And then the blind spot the siblings predicted, confirmed and worse here.**
`fixture_census_oc_ag.rs` contains **zero** `LoadVerdict` assertions and **zero**
`.effective` references — 1026 lines of OpenCode/Antigravity census that never
looks at a verdict. The consequence is measurable:

> Adding `"skill"` to `opencode_precedence` **and** `opencode_source_order` makes
> Configr render `Loaded` / `Shadowed by …` for two same-named OpenCode skills —
> exactly the thing U-09 forbids, exactly the thing the guide calls "the
> highest-ranked residual unknown for OpenCode" — and **742 tests stay
> green**. Nothing anywhere asserts the U-09 verdict, the U-09 citation, or the
> refusal to name a winner.

> **Closed in `3f933432`.** `fixture_census_oc_ag.rs` now asserts verdicts in
> both halves: `opencode_fixture_verdicts_are_exactly_these_three` (`:183`)
> pins the whole fixture's verdict set by equality against a four-row list, and
> `antigravity_fixture_verdicts_state_what_is_known_and_withhold_the_rest`
> (`:585`) pins eight `Unknown` pairs plus a negative control.
> `fixture_census_acme.rs:261` and `fixture_census.rs:614` pin the OpenCode
> suppression verdicts. U-09 itself is pinned twice, and deliberately in two
> places: `opencode_says_unknown_when_two_skills_share_a_name`
> (`scanner/effective.rs:653`) asserts the outcome _and_ `spec == "U-09"`, and
> `opencode_skills_are_ranked_by_neither_precedence_table`
> (`toolr-core/src/coding_agent.rs:1134`) asserts each half of the pair
> separately — because, as its docstring says, adding `"skill"` to either table
> alone changes nothing observable, so the outcome test alone could not localise
> the break.

### Bottom line

OpenCode discovery is faithful and heavily pinned. OpenCode _resolution_ is
faithful and almost entirely unpinned. The install path — the thing `d3d1e445`
rebuilt — is the best-tested surface in my scope, front and back, with one
factually wrong sentence and one root the app can install into but can never
show.

> **Since `3f933432`:** resolution is pinned — U-09, the class rule and the
> census verdicts all have assertions now. The wrong sentence is rewritten and
> the invisible root is listed.

---

## 2. Counts

Counted straight off the matrix in §4 — one row per claim, `O88` excluded as a
heading.

### As audited at `d3d1e445`

| Class                                                                                                                   | OpenCode | Cross-tool |   Total |
| ----------------------------------------------------------------------------------------------------------------------- | -------: | ---------: | ------: |
| **CONFORMS** — implemented as specified _and_ a test would fail on regression                                           |       62 |         27 |  **89** |
| **IMPLEMENTED-UNTESTED** — code is right, nothing pins it                                                               |        9 |          3 |  **12** |
| **TESTED-WRONG** — green test pinning behaviour the guide contradicts                                                   |        3 |          0 |   **3** |
| **IMPLEMENTED-BEYOND-SPEC** — Configr asserts what the guide withholds or denies                                        |        1 |          1 |   **2** |
| **IMPLEMENTED-AGAINST-SPEC, unpinned** — a decision is made, it contradicts the guide, no test defends either direction |        2 |          0 |   **2** |
| **NOT-IMPLEMENTED — documented deferral**                                                                               |        7 |          0 |   **7** |
| **NOT-IMPLEMENTED — silent gap**                                                                                        |       39 |          1 |  **40** |
| **N/A** — session/runtime surface a file browser cannot have                                                            |        3 |          0 |   **3** |
| **Total claims**                                                                                                        |  **126** |     **32** | **158** |

Implemented = CONFORMS + IMPLEMENTED-UNTESTED + TESTED-WRONG + BEYOND-SPEC +
AGAINST-SPEC = **108**. Pinned share of implemented: **89 / 108 = 82%**.

### Now, at `eecc1fe8`

Eight rows moved, all of them into CONFORMS. Implemented stays **108** and
NOT-IMPLEMENTED stays **47** — nothing crossed the built/unbuilt line, so the
parked backlog is unchanged.

| Class                                     | OpenCode | Cross-tool |   Total | Moved                                        |
| ----------------------------------------- | -------: | ---------: | ------: | -------------------------------------------- |
| **CONFORMS**                              |   **68** |     **29** |  **97** | `+O31 +O46 +O26 +O12 +O98 +O37`, `+X26 +X05` |
| **IMPLEMENTED-UNTESTED**                  |    **7** |      **2** |   **9** | `−O98`, `−O37`, `−X05`                       |
| **TESTED-WRONG**                          |    **1** |          0 |   **1** | `−O31`, `−O46` (only `O89`/TW-2 left)        |
| **IMPLEMENTED-BEYOND-SPEC**               |    **0** |      **0** |   **0** | `−O26`, `−X26`                               |
| **IMPLEMENTED-AGAINST-SPEC, unpinned**    |    **1** |          0 |   **1** | `−O12` (only `D-2` left)                     |
| **NOT-IMPLEMENTED — documented deferral** |        7 |          0 |   **7** | —                                            |
| **NOT-IMPLEMENTED — silent gap**          |       39 |          1 |  **40** | —                                            |
| **N/A**                                   |        3 |          0 |   **3** | —                                            |
| **Total claims**                          |  **126** |     **32** | **158** |                                              |

Implemented = **108**, unchanged. Pinned share of implemented: **97 / 108 =
90%** (82% as audited).

**One counting decision, stated so it can be overruled.** `O10` is left at
NOT-IMPLEMENTED (documented deferral) even though `scan_legacy_user_root` now
lists `~/.opencode`, because the half the claim turns on — that the directory
_outranks every project one_ — is still deliberately not expressed, with the
reason written at `scanner/opencode.rs:61-70`. Counting the discovery half as
implemented would move one row out of the 47 and out of the estate's parked 170.

Two notes on the counting, so the numbers can be checked rather than trusted:

- The sixth class, **IMPLEMENTED-AGAINST-SPEC (unpinned)**, is a sub-case the
  two sibling audits did not need. It holds **D-1** and **D-2**: Configr makes a
  decision, the decision contradicts the guide, and no test pins either
  direction, so neither TESTED-WRONG nor NOT-IMPLEMENTED fits honestly. Counting
  them as defects rather than implementations gives 106 implemented / 84% pinned.
- The three TESTED-WRONG rows are **two** distinct defects: `O31` and `O46` are
  the same per-directory class evaluation, stated as two separate claims in two
  separate guide sections (`#instructions` and `#ceiling`).

---

## 3. Findings ranked by risk

### 3.1 TESTED-WRONG (2)

---

#### RESOLVED — TW-1 · The class rule is evaluated per directory, so an ancestor `AGENTS.md` never suppresses the project's own `CLAUDE.md` — and the shipped fixture pins the wrong answer

**Fixed in `3f933432`.** The two owners now share one range.
`inherited_memory::ancestor_class_floor` (`:182`) returns the lowest filename
class found _above_ the project — and returns `None` unless the agent's
`class_range` is `ClassRange::Walk`, so Codex's per-directory rule is untouched.
`scanner/instructions.rs:442` passes it into the project scan, and `:358-359`
combines it: `let winning_class = here.chain(ancestor_floor).min();
let winner_is_here = here == winning_class;`. `qualified_verdict` (`:270`) then
splits the two cases the old code could not tell apart — beaten by a local
sibling gives `LoadVerdict::Shadowed { by }` (`:282`), beaten by a class that won
higher up gives `LoadVerdict::NotLoaded { reason }` built from
`InheritedMemory::suppressed_reason` (`:291`), whose wording differs by range
("on this walk" vs "in this directory",
`toolr-core/src/instruction_sources.rs:431-435`).

Both cases are pinned separately:

- **Local sibling** — `opencodes_class_rule_shadows_claude_md_without_touching_its_other_readers`
  (`scanner/instructions.rs:651`).
- **Class that won higher up** — `acme_fixture_identity_service_census`
  (`scanner/fixture_census_acme.rs:261`, assertion at `:294`) now asserts
  `LoadVerdict::NotLoaded { reason }` containing both `"AGENTS.md"` and
  `"on this walk"` against the same shipped fixture this finding used as its
  proof, and `:304` asserts OpenCode is the only agent carrying a verdict there.
- **Ancestor side** — `inherit_fixture_opencode_memory_census`
  (`scanner/fixture_census.rs:614`) pins the exact suppressed path list.

The finding as written is kept below, unchanged — including the PROBE-13
transcript, which is now the record of a behaviour that no longer occurs.

**Guide.** `opencode.html#ceiling`, "The CLAUDE.md fallback, with its
exact conditions": the project half loads only if _"No `AGENTS.md` exists
anywhere from cwd through the worktree. A single `AGENTS.md` at any level of
that range suppresses every startup project `CLAUDE.md`."_ `#instructions`
states the same consequence twice ("Distance loses to class") and
`cross-tool-matrix.html#matrix-instructions` closes with it as its **Trap**:
_"A browser listing it as an active instruction source is showing a file that
never enters the context."_

**Code.** Two different owners compute "which filename class wins", over two
different ranges.

- `crates/toolr-configr/src/inherited_memory.rs:131` — `winning_class(project_path, dirs, memory)`
  takes the project **and every ancestor**. Correct.
- `crates/toolr-configr/src/scanner/instructions.rs:316` — `claim_sources`
  computes `winning_class` from `resolved`, which holds only the files found
  under the **one** `project_root` it was handed. It has no ancestor input and
  no way to get one.

**Failure scenario, from the repository's own fixture.**
`example/acme-corp/platform/backend/identity-service/` has its own `CLAUDE.md`;
`example/acme-corp/platform/backend/AGENTS.md` sits one directory above it,
inside the walk. Probe against the real fixture through `scan_single_project_inner`:

```
PROBE-13 path=CLAUDE.md consumers=["claude","copilot","opencode"] effective=[]
PROBE-13 presence=[("claude",2),("codex",1),("copilot",1),("opencode",1)]
PROBE-13 inherited path=~/acme-corp/platform/CLAUDE.md
         effective=[NotLoaded { reason: "a higher filename class (AGENTS.md) matches
                    on this walk, and only the first matching class is read" }]
PROBE-13 inherited path=~/acme-corp/CLAUDE.md
         effective=[NotLoaded { reason: "a higher filename class (AGENTS.md) matches …" }]
```

One project view, one walk, one set of `AGENTS.md` files — two ancestor
`CLAUDE.md` cards correctly marked dead, and the project's own `CLAUDE.md`
presented as live, contributing 1 to OpenCode's presence badge.

**The pinning test.** `crates/toolr-configr/src/scanner/fixture_census_acme.rs:263`
`acme_fixture_identity_service_census`:

```rust
// CLAUDE.md carries Copilot and OpenCode in as readers
// (github-copilot.html#cross-read, opencode.html#ceiling).
assert_eq!(sorted_tool_ids(&tools), ["claude", "codex", "copilot", "opencode"]);
assert_eq!(census_tool(&tools, "opencode").component_count, 1);
```

The justifying comment cites `opencode.html#ceiling` — the section that
says the opposite. Fixing the scanner turns this test red.

**Risk.** Highest in this report. It is the guide's own named trap, it is live
in the shipped example project, and the app is _internally inconsistent_ about
it inside one screen.

---

#### TW-2 · OpenCode's user scope omits `~/.claude/skills` and `~/.agents/skills`, and a test asserts that omission as a rule

**Guide.** `opencode.html#skills`, discovery order step 1:
_"`~/.claude/skills/**/SKILL.md` (unless Claude compatibility is disabled) and
`~/.agents/skills/**/SKILL.md`"_ — `S`.
`#cross-read` repeats both at `S`. `cross-tool-matrix.html#matrix-skills`
gives OpenCode `R` on `User ~/.agents/skills/<name>/SKILL.md` and `R · at the
literal path` on `User ~/.claude/skills/<name>/SKILL.md`.

**Code.** `crates/toolr-configr/src/scanner/mod.rs:513` —
`CodingAgent::Opencode => scan_opencode_dir(root, "user", "user", "")` where
`root` is `~/.config/opencode` alone. The user scope is scanned **one agent at a
time** (`user_components_with_home`, `mod.rs:929`), so unlike the project scan
and the ancestor walk — both of which scan every owner and filter by _consumer_ —
nothing ever brings a foreign user root into OpenCode's list. Codex's user scan
does add `~/.agents/skills`; OpenCode's does not.

**Probe.** Home holding `~/.claude/skills/claude-root-skill`,
`~/.agents/skills/agents-root-skill`, `~/.config/opencode/skills/opencode-root-skill`,
`~/.opencode/skills/legacy-root-skill`:

```
PROBE-11 opencode -> [("skill","opencode-root-skill",…), ("instruction","CLAUDE",…), ("instruction","AGENTS",…)]
PROBE-11 codex    -> [("skill","agents-root-skill","codex",".agents/skills/agents-root-skill")]
PROBE-11 claude   -> [("skill","claude-root-skill",…), ("instruction","CLAUDE",…)]
```

Two of the five roots OpenCode reads at user scope are invisible to it.

**The pinning test.** `crates/toolr-configr/src/scanner/mod.rs:1169`
`home_loads_each_agent_user_scope_without_cross_agent_leakage`:

```rust
assert!(
    !components.iter().any(|c| c.tool == other.as_str()),
    "{} must not list components owned by {}", agent.as_str(), other.as_str()
);
```

`mixed_agent_home` (`mod.rs:1094`) writes `~/.claude/skills/claude-user-skill`,
so for `agent = Opencode` this asserts precisely the missing read. The assertion
is _already_ false for instructions — PROBE-11 shows OpenCode's user scope
returning `("instruction", "CLAUDE", tool = "claude", "~/.claude/CLAUDE.md")` —
and only passes because the fixture happens not to write a `~/.claude/CLAUDE.md`.

**Risk.** High. It is silent under-reporting on the coding agent with the widest
cross-read surface of the five, and the test states the wrong invariant as a
principle rather than as an accident.

---

### 3.2 IMPLEMENTED-BEYOND-SPEC (2)

---

#### RESOLVED — BS-1 · `OPENCODE_DISABLE_PROJECT_CONFIG` is applied to scans the guide explicitly exempts

**Fixed in `3f933432`, by the exempt-roots change proposed in §8.**
`scanner/effective.rs:195` now holds
`const EXEMPT_FROM_DISABLE_PROJECT_CONFIG: [&str; 2] = [".claude/skills", ".agents/skills"]`,
checked at `:218-223` — before the `source` gate at `:224`, so the exemption
covers ancestor-scoped components as well as project ones. Pinned by
`the_foreign_skill_roots_survive_a_disabled_opencode_project_scope`
(`scanner/effective.rs:908`), which asserts `LoadVerdict::Loaded` for
`.claude/skills/compat`, `.agents/shared` and an inherited `.claude/skills/above`
while keeping `NotLoaded` for `.opencode` — i.e. exactly the four PROBE-14 cases,
three of which used to be wrong. The non-exempt half stays pinned by
`a_disabled_opencode_project_scope_neither_loads_nor_competes` (`:863`).

_The guide's third exempt item, the theme walk, is vacuous here: Configr has no
theme scan at all (row `O14`), so there is no theme component to mis-mark._

The finding as written is kept below, unchanged.

**Guide.** `opencode.html#scopes`: _"**Not gated**: the ancestor
`.claude/skills` and `.agents/skills` scans and the theme walk still run, and
`~/.opencode` and `OPENCODE_CONFIG_DIR` survive in the directory list."_
`#layers` enumerates exactly what the switch removes; neither foreign skill root
is in the list.

**Code.** `crates/toolr-configr/src/scanner/effective.rs:194-214` —
`disabled_project_scope_verdict` keys on `component.source` alone:

```rust
matches!(component.source.as_str(), "project" | "local" | "inherited").then(|| …)
```

Every project- and ancestor-scoped component gets `NotLoaded`, whatever
directory it came from.

**Probe.**

```
PROBE-14 .claude/skills/foreign  opencode=NotLoaded { OPENCODE_DISABLE_PROJECT_CONFIG … }
PROBE-14 .agents/skills/shared   opencode=NotLoaded { OPENCODE_DISABLE_PROJECT_CONFIG … }
PROBE-14 .claude/skills/above    opencode=NotLoaded { OPENCODE_DISABLE_PROJECT_CONFIG … }
PROBE-14 .opencode/skills/own    opencode=NotLoaded { OPENCODE_DISABLE_PROJECT_CONFIG … }   ← the only correct one
```

Three of four are wrong. The existing test
(`effective.rs:803 a_disabled_opencode_project_scope_neither_loads_nor_competes`)
uses `.opencode/agent/…` paths only, so the over-application is invisible to it.

**Risk.** Moderate — the switch is undocumented upstream and rare — but the
direction is the dangerous one: it tells a user a live skill is dead.

---

#### RESOLVED — BS-2 · The install refusal tells the user "OpenCode has no plugin loader", which the guide contradicts in its vocabulary section

**Fixed in `3f933432`**, close to the wording proposed below. The OpenCode arm of
`install_matrix.rs:424-428` now reads, verbatim:

> "Claude Code plugin bundles are a Claude Code format. OpenCode plugins are
> JS/TS modules or npm packages declared in opencode.json, with no manifest to
> install and no marketplace at 1.18.16 (U-10)."

The old sentence survives only for the four manifest-bundle coding agents
(`:429-432`). Pinned by
`the_plugin_refusal_does_not_deny_opencodes_own_plugin_format` (`:579`), which
asserts the message does **not** contain "no plugin loader", **does** contain
`opencode.json`, and names the format OpenCode does take — with a negative
control looping over `codex`, `copilot` and `antigravity` to prove the generic
sentence is still theirs.

The finding as written is kept below, unchanged.

**Guide.** `opencode.html#plugins`: _"An OpenCode plugin is executable
code, not a manifest bundle."_ `cross-tool-matrix.html#vocabulary` lists
`Plugin` under **"Same name, different concept"**: _"Claude, Codex, Copilot and
Antigravity all mean a manifest bundle. OpenCode means a JavaScript/TypeScript
module or an npm package … There is no manifest to read and no marketplace to
browse."_

**Code.** `crates/toolr-configr/src/install_matrix.rs:415-418`:

```rust
Err(format!("Claude Code plugins are a Claude Code surface; {} has no plugin loader.",
            agent.display_name()))
```

**Probe.** `PROBE-9 → "Claude Code plugins are a Claude Code surface; OpenCode
has no plugin loader."` — shown on hover over the disabled install control
(`AddCapabilityDialog.tsx:400-402`, `installAffordance.ts:16-17`).

The _decision_ is right — Claude plugin bundles are not an OpenCode input — and
the same module's own scanner emits OpenCode `plugin` components from
`{plugin,plugins}/*.{ts,js}` and the `plugin` array. Only the sentence is wrong,
and it is wrong in exactly the way the vocabulary map exists to prevent. No test
asserts it.

**Fix.** "Claude Code plugin bundles are a Claude Code format; OpenCode plugins
are JS/TS modules or npm packages declared in `opencode.json`, with no
marketplace at 1.18.16 (U-10)."

---

### 3.3 Implemented-against-the-guide, unpinned in either direction (2)

These are defects, not TESTED-WRONG: no test defends the wrong behaviour, and
none would notice the fix either.

---

#### RESOLVED — D-1 · `.json` beats `.jsonc` in one directory; the guide says the reverse

**Fixed in `3f933432`.** `mcp_opencode.rs:47` is now
`const SETTINGS_FILES: [&str; 2] = ["opencode.jsonc", "opencode.json"]`, with a
doc comment at `:38-46` explaining why the array has to be the reverse of the
merge order: it is consumed first-claim-wins (`:107`, and the dedupe at
`:276-280`), so `.jsonc` wins. Pinned by `jsonc_outranks_json_in_one_directory`
(`:662`), which writes both files in one directory and asserts one winner,
`from-jsonc`. Reverting the array fails that assertion — M25 is dead.

**Two consequences of the flip that are still unpinned**, recorded so they are
not lost: `mcp_opencode.rs:332-333` uses `SETTINGS_FILES[0]` for the MCP
dashboard's reported `config_path`, so that path is now `opencode.jsonc` for
both project and `~/.config/opencode`, and no test asserts OpenCode's
`config_path` (Copilot's and Antigravity's are asserted). The scanner's own
opposite-order constant at `scanner/opencode_settings.rs:26` is unchanged and
still harmless — it enumerates rather than resolves, and the census pins that
settings cards carry no verdict at all.

The finding as written is kept below, unchanged.

**Guide.** `#layers` layer 4 and `#scopes` project-top-level row: _"with `.json`
merged **before** `.jsonc` at each level"_ — later merge wins, so `.jsonc` wins.
Layer 2 spells the same direction out (`config.json`, then `opencode.json`, then
`opencode.jsonc`), and the TUI stack repeats it ("JSONC after JSON at every
location").

**Code.** `crates/toolr-configr/src/mcp_opencode.rs:39`
`const SETTINGS_FILES = ["opencode.json", "opencode.jsonc"]`, consumed by
`scan_opencode_settings` (`:99`) and then de-duplicated first-claim-wins in
`opencode_project_servers` (`:263`). First in the array wins ⇒ `.json` wins.

**Probe.** One directory holding both, each declaring `mcp.docs`:

```
PROBE-1 servers=1 winner="from-json"      ← guide says "from-jsonc"
```

**Mutation M25** flipped the array to the guide direction: winner becomes
`from-jsonc`, **742 tests still pass**. Neither direction is pinned.

Same constant, same order, in `scanner/opencode_settings.rs:26` — harmless there
(both files are enumerated, nothing is resolved).

---

#### D-2 · Two OpenCode settings cards resolve to `Unknown`, citing a register that has no entry for them — for a question `#shadow` answers

**Guide.** `#shadow`: _"Because step 5 runs after step 4, `.opencode` **always**
outranks the sibling top-level `opencode.json` in the same directory."_ `S`.

**Code.** `opencode_precedence("settings") = RankedByScope`
(`precedence_tables.rs:168`); both files are `Project` scope, so `winning_scope`
returns both; `ancestor_precedence` maps `RankedByScope` to `Unresolved`
(`coding_agent.rs:611`); `pick_finalist` returns `None`; `unresolved()` fires
with `unresolved_precedence(Opencode,"settings") == None`, so the citation falls
back to `"cross-tool-matrix.html#unknowns"` (`effective.rs:429`).

**Probe.**

```
PROBE-2 opencode.json          Unknown { "2 declarations of this name; no primary
                               evidence orders OpenCode settingss" } spec=cross-tool-matrix.html#unknowns
PROBE-2 .opencode/opencode.json  (same)
```

Three things are wrong at once: the guide _does_ order them; the app claims no
evidence exists; and it points the user at a consolidated register that contains
no entry about OpenCode settings. **PROBE-10 shows these two cards are the only
`Unknown` verdicts in the shipped `only-opencode` fixture** — the app's own
showcase says "unknown" about the one thing this section of the guide is most
emphatic about. (Note the plural typo, "settingss", in the same string.)

The MCP collector gets the same question right
(`dot_opencode_configs_outrank_direct_ones`, `mcp_opencode.rs:627`); only the
component verdict path does not.

---

### 3.4 IMPLEMENTED-UNTESTED, ranked (13)

| #       | Claim                                                                                                   | Where                                             | Why it is unpinned                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~U-1~~ | **U-09: duplicate OpenCode skill names get `Unknown` citing U-09, never a winner**                      | `coding_agent.rs:575`, `effective.rs:411-439`     | ~~M3, M36, M37 and the combined M46 all survive. See §5 — this is the headline~~ → **RESOLVED in `3f933432`, now CONFORMS.** `opencode_says_unknown_when_two_skills_share_a_name` (`effective.rs:653`) pins the verdict and `spec == "U-09"`; `opencode_skills_are_ranked_by_neither_precedence_table` (`coding_agent.rs:1134`) pins each table half separately. Kills M3, M26/M36, M37 and M46 |
| U-2     | seedr's user-scope OpenCode skill root is `~/.opencode`, not `~/.config/opencode`                       | `install_verify.rs:151`, `install_matrix.rs:216`  | M11 and M12 both survive; no test resolves a user-scope OpenCode capability dir                                                                                                                                                                                                                                                                                                                 |
| U-3     | skills.sh's user-scope OpenCode root is `~/.config/opencode/skills`                                     | `install_matrix.rs:367`                           | M27 survives                                                                                                                                                                                                                                                                                                                                                                                    |
| ~~U-4~~ | `CONTEXT.md` is OpenCode's third project instruction class                                              | `instruction_sources.rs:306`                      | ~~M38 (delete the row) survives. The _ancestor_ table is pinned (M39 caught)~~ → **RESOLVED in `3f933432`, now CONFORMS.** `the_ancestor_classes_align_with_the_project_table_class_for_class` (`:709`) forces the project table and the ancestor classes to agree class for class, so M38 can no longer survive                                                                                |
| U-5     | OpenCode instruction files all apply — none shadows another                                             | `precedence_tables.rs:167`                        | M28 (→ `LastLoadedWins`) survives                                                                                                                                                                                                                                                                                                                                                               |
| U-6     | `OPENCODE_DISABLE_PROJECT_CONFIG` truthiness is `"true"`/`"1"` and nothing else                         | `coding_agent.rs:807-810`                         | M32 survives. The comment at `effective.rs:74-77` states the reason: the switch is injected in tests rather than read from the environment                                                                                                                                                                                                                                                      |
| U-7     | The app reads the tree directly and never shells out to `opencode`, because enumeration triggers writes | `scanner/opencode.rs:11-29`                       | Structural; no test asserts no `opencode` process is spawned                                                                                                                                                                                                                                                                                                                                    |
| U-8     | `opencode.local.json` does not exist and is never read                                                  | `mcp_opencode.rs:39`, `opencode_settings.rs:26`   | A bounded negative enforced by two 2-element arrays; no fixture contains the decoy                                                                                                                                                                                                                                                                                                              |
| U-9     | `mcp-auth.json`, `~/.local/share/opencode`, `~/.cache/opencode` are generated state, never scanned      | absence                                           | Bounded negative, no decoy fixture                                                                                                                                                                                                                                                                                                                                                              |
| U-10    | Command frontmatter carries `agent`/`model`/`variant`/`subtask` beyond `description`                    | `opencode.rs:299`                                 | Only `description` is surfaced; nothing asserts the others are ignored deliberately                                                                                                                                                                                                                                                                                                             |
| U-11    | `instructions` is re-resolved on every agent step                                                       | `opencode_settings.rs:129-131` (description text) | The phrase is in the URL description only; the `#instructions` test asserts other substrings                                                                                                                                                                                                                                                                                                    |
| U-12    | `hooks_dir() == ""` / `hooks_dir_is_registry() == false` for OpenCode                                   | `coding_agent.rs:278`, `:311`                     | **M4 and M35 are equivalent mutants** — flipping both leaves the scan unchanged (PROBE-8). "No hooks surface" is enforced structurally by `scan_opencode_dir` having no hooks branch, not by the table                                                                                                                                                                                          |
| U-13    | Cross-tool: `skills_require_skill_md(Opencode) == false` while `scan_skills_dir` requires `SKILL.md`    | `coding_agent.rs:344` vs `opencode.rs:364`        | The table row misdescribes its own scanner. Harmless today (nothing reads the row for OpenCode) but it is a latent contradiction                                                                                                                                                                                                                                                                |

---

### 3.5 NOT-IMPLEMENTED — documented deferrals (5)

Each carries a written reason in the code. These are the good kind.

| Claim                                                                                                           | Reason, in the codebase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy `~/.opencode` as a full config directory ranked above every project one                                  | `precedence_tables.rs:182-188` — "this app scans neither … inventing a scope for it would put an unbacked claim on every card". **Since `3f933432` the directory _is_ scanned** (`scanner/opencode.rs:83`, wired into `scan_user_scope` in `scanner/mod.rs`) with every card stamped `LoadVerdict::Unknown` / `LEGACY_ROOT_NOTE`; only the _rank_ is still deferred, for the reason at `scanner/opencode.rs:61-70`. Pinned by `the_legacy_opencode_root_is_listed_with_no_rank_claimed` (`scanner/mod.rs`) |
| `$OPENCODE_CONFIG_DIR`'s two behaviours (replace for the global `AGENTS.md`, append for capability directories) | `instruction_sources.rs:58-65` — "This app models the static XDG root only … and under-reports the instruction slot when the variable is set"                                                                                                                                                                                                                                                                                                                                                              |
| No `.git` above cwd ⇒ worktree is `/` and every walk reaches the filesystem root through `$HOME`                | `mcp_opencode.rs:210-216` — "lifting the cap would make one scan traverse the user's whole home ancestry". Verified: PROBE-5 finds `~/Work/AGENTS.md` and stops before `~/AGENTS.md`                                                                                                                                                                                                                                                                                                                       |
| Loader-triggered writes are not reproduced                                                                      | `scanner/opencode.rs:11-29` — the module header states the whole write family and why the tree is read directly                                                                                                                                                                                                                                                                                                                                                                                            |
| The TUI and legacy-TOML migrations                                                                              | same header, `:19-23`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

### 3.6 NOT-IMPLEMENTED — silent gaps (48)

No comment anywhere says these were considered. Grouped by subsystem, largest
first.

**Whole subsystems (34 claims).** Themes (the separate unbounded walk, plural-only,
non-recursive, basename keying, rootmost-wins, plugin-shipped `oc-themes`,
`addTheme`/`upsertTheme`, the `D≠S` against the docs). The TUI stack (`tui.json(c)`,
`OPENCODE_TUI_CONFIG`, its six-level order, the no-worktree walks, the key
inventory, the legacy-key strip). The ten-layer merge (remote `.well-known`,
`OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, the organization API, OS-managed
paths, macOS MDM `ai.opencode.managed`, deep-merge semantics, the two array
exceptions, the four post-processing stages beyond `mode`→`agent`). Skills
beyond directories (`skills.paths`, `skills.urls` and their cache, the built-in
`customize-opencode`, per-agent permission gating, `OPENCODE_DISABLE_EXTERNAL_SKILLS`
and the two `_CLAUDE_CODE_*` variants).

**Resolution rules that exist but are not modelled (9).** The four-stage command
registration and its skills exception; `server:prompt` namespacing; the tool
shadow order `built-ins → file → plugin → MCP resource → MCP server`; named
exports becoming `filename_export`; plugin identity/order (npm name irrespective
of version, `--pure`, `OPENCODE_DISABLE_DEFAULT_PLUGINS`, the 11 internal
plugins); MCP same-ID deep merge across layers (Configr drops the loser instead
of merging).

**Instruction mechanisms (3).** The lazy descendant path (`Instruction.resolve`
walking up to _but excluding_ the session directory, mixing classes); insertion
order (global → nearest→root → configured); `OPENCODE_DISABLE_CLAUDE_CODE` and
`_PROMPT`.

**Two worth calling out individually.**

- ~~**The main config strips `theme`, `keybinds` and `tui` on load.**~~
  **RESOLVED in `3f933432`.** `#themes`:
  _"A tool that reads them from `opencode.json` and reports them as effective is
  reporting values the loader has already discarded."_ The settings card
  (`opencode_settings.rs:54-66`) warns about `{env:}`/`{file:}` placeholders and
  says nothing about the three stripped keys — and the `only-opencode` fixture's
  own `.opencode/opencode.json` is a `{"theme": …}` file in two unit fixtures.
  → `settings_description` now accumulates caveats into a `Vec<String>` (`:55`)
  and adds a second from the new `stripped_keys` helper (`:90`), which _parses_
  the document rather than substring-matching it and checks top-level presence of
  `["theme", "keybinds", "tui"]` (`:97`). Pinned by
  `a_settings_card_says_which_of_its_keys_the_loader_discards` (`:446`), which
  asserts the singular, plural and JSONC forms and includes
  `assert_eq!(settings_description("{\"model\": \"themed-tui-keybinds\"}"), "OpenCode settings")`
  to kill a substring implementation.
- **A V2-shaped config is read but never labelled.** `#versions` is explicit:
  _"A scanner that finds `mcp.servers` has found an OpenCode 2 config that the
  installed `opencode` 1.18.16 will silently ignore … present the conclusion as
  an inference."_ Configr discriminates the shape correctly
  (`mcp_opencode.rs:69-86`) and then renders both alike — no `LoadVerdict`, no
  badge, nothing tells the user which binary reads what.

**Install-path gaps carried forward from `docs/seedr-install-audit.md` (2).**
P1-6 ("no install validates the shape the coding agent requires") and P2-6
("installer CLI versions are unpinned") are both untouched by `d3d1e445`.

---

### 3.7 N/A (9)

Session/runtime state a file browser cannot have: sessions, history, compaction,
summary agents, share/server state, `auth.json` contents, the remote layers'
reachability without an account, per-step re-resolution timing, and the V1/V2
"both binaries installed" detection.

---

## 4. The claim matrix

Legend: **C** CONFORMS · **IU** IMPLEMENTED-UNTESTED · **TW** TESTED-WRONG ·
**BS** IMPLEMENTED-BEYOND-SPEC · **NI-d** documented deferral ·
**NI** silent gap · **N/A**.

### 4.1 OpenCode — `docs/opencode.html` (119 claims)

| #    | Claim                                                                                                      | Anchor                      | Ev     | Impl?                                                                                     | Where                                                                                 | Pinned by                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------- | --------------------------- | ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O01  | V1 `mcp.<name>` + `enabled` vs V2 `mcp.servers` + `disabled`, discriminated by key **shape**               | `#versions`                 | S      | yes                                                                                       | `mcp_opencode.rs:69-86`                                                               | **C** `reads_the_v2_nested_schema_with_its_disabled_flag`; M21 caught                                                                                                                                                                                                                                                                                                                                                              |
| O02  | A V1 server legitimately named `servers` is not the V2 container                                           | `#versions`                 | S      | yes                                                                                       | `mcp_opencode.rs:56-64`                                                               | **C** `a_v1_server_named_servers_is_not_mistaken_for_the_v2_container`                                                                                                                                                                                                                                                                                                                                                             |
| O03  | A V2 config is **silently ignored** by 1.18.16; present the conclusion as an inference                     | `#versions`                 | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O04  | 1.18.16 is a separate binary from `opencode2`; neither reads the other's shape                             | `#versions`                 | D/O    | —                                                                                         | —                                                                                     | **N/A**                                                                                                                                                                                                                                                                                                                                                                                                                            |
| O05  | Remote `.well-known/opencode` layer                                                                        | `#scopes`, `#layers` 1      | D/S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O06  | Organization API `<account>/api/config` layer                                                              | `#layers` 7                 | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O07  | User/global XDG `~/.config/opencode` is the user root                                                      | `#scopes`                   | D/S    | yes                                                                                       | `coding_agent.rs:819`                                                                 | **C** M42 caught                                                                                                                                                                                                                                                                                                                                                                                                                   |
| O08  | The global dir reads `config.json` **first**, then `opencode.json`, then `.jsonc`                          | `#layers` 2                 | S      | yes                                                                                       | `opencode_settings.rs:41,80-84`                                                       | **C** `only_the_global_scope_reads_config_json`; M15 caught                                                                                                                                                                                                                                                                                                                                                                        |
| O09  | A project-root `config.json` is **not** an OpenCode surface                                                | `#layers` 2                 | I      | yes                                                                                       | `opencode_settings.rs:36-40`                                                          | **C** same test                                                                                                                                                                                                                                                                                                                                                                                                                    |
| O10  | Legacy `~/.opencode` is a full config dir outranking every project one                                     | `#scopes`                   | S      | ~~no~~ → **listed, not ranked** (`3f933432`)                                              | `scanner/opencode.rs:61-70,83`; `scan_user_scope` in `scanner/mod.rs`                 | **NI-d** for the rank (`scanner/opencode.rs:61-70`); the listing is **C**, pinned by `the_legacy_opencode_root_is_listed_with_no_rank_claimed`                                                                                                                                                                                                                                                                                     |
| O11  | Project top-level `opencode.json(c)` from worktree root down to cwd                                        | `#scopes`, `#layers` 4      | S      | yes                                                                                       | `mcp_opencode.rs:203-215`                                                             | **C** `reads_ancestor_settings_up_to_the_repository_root`                                                                                                                                                                                                                                                                                                                                                                          |
| O12  | `.json` merged **before** `.jsonc` at each level ⇒ `.jsonc` wins                                           | `#layers` 4                 | S      | ~~**inverted**~~ → **yes** (`3f933432`)                                                   | `mcp_opencode.rs:47,276-280`                                                          | ~~**D-1** — M25 survives~~ → **C** — fixed in `3f933432`; `jsonc_outranks_json_in_one_directory` kills M25                                                                                                                                                                                                                                                                                                                         |
| O13  | Project structured `.opencode/` at every ancestor carries **full** capabilities                            | `#scopes`                   | D/S    | yes                                                                                       | `coding_agent.rs:378-382`                                                             | **C** `acme_fixture_opencode_ancestor_agents_let_the_rootmost_copy_win`; M24 caught                                                                                                                                                                                                                                                                                                                                                |
| O14  | Themes scope (own walk, `~/.config/opencode/themes` + `<dir>/.opencode/themes`)                            | `#scopes`, `#themes`        | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O15  | TUI configuration scope (`tui.json(c)`, `OPENCODE_TUI_CONFIG`)                                             | `#scopes`, `#themes`        | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O16  | Explicit scope: `OPENCODE_CONFIG`                                                                          | `#scopes`, `#layers` 3      | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O17  | Explicit scope: `OPENCODE_CONFIG_CONTENT`                                                                  | `#layers` 6                 | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O18  | Explicit scope: `OPENCODE_CONFIG_DIR` (replace **and** append)                                             | `#scopes`                   | S      | no                                                                                        | —                                                                                     | **NI-d** `instruction_sources.rs:58-65`                                                                                                                                                                                                                                                                                                                                                                                            |
| O19  | Managed scope: three OS paths + macOS MDM `ai.opencode.managed`                                            | `#scopes`, `#layers` 8-9    | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O20  | Session/runtime scope (XDG data/cache/state)                                                               | `#scopes`                   | D/S/O  | —                                                                                         | —                                                                                     | **N/A**                                                                                                                                                                                                                                                                                                                                                                                                                            |
| O21  | Every config directory contributes the same six capability globs                                           | `#scopes`                   | S      | yes                                                                                       | `opencode.rs:82-142`                                                                  | **C** `opencode_fixture_singular_and_plural_dirs_both_scan`                                                                                                                                                                                                                                                                                                                                                                        |
| O22  | Only `.opencode`-suffixed entries contribute a further `opencode.json(c)`                                  | `#scopes`, `#layers` 5      | S      | yes                                                                                       | `opencode.rs:42-52`, `mcp_opencode.rs:250-258`                                        | **C** `dot_opencode_configs_outrank_direct_ones`                                                                                                                                                                                                                                                                                                                                                                                   |
| O23  | Singular and plural are both real, with **no** precedence                                                  | `#scopes`                   | S      | yes                                                                                       | `opencode.rs:76-142`                                                                  | **C** M9, M29, M33 caught                                                                                                                                                                                                                                                                                                                                                                                                          |
| O24  | A singular/plural collision inside one directory has no winner — report both                               | `#unknowns`                 | S/U    | yes                                                                                       | `opencode.rs:76-81` (comment + behaviour)                                             | **C** census emits both                                                                                                                                                                                                                                                                                                                                                                                                            |
| O25  | `OPENCODE_DISABLE_PROJECT_CONFIG` removes the whole project tier                                           | `#scopes`, `#layers`        | S      | yes                                                                                       | `coding_agent.rs:799`, `effective.rs:194`                                             | **C** `a_disabled_opencode_project_scope_neither_loads_nor_competes`; M13 caught                                                                                                                                                                                                                                                                                                                                                   |
| O26  | …but **not** the `.claude`/`.agents` skill scans or the theme walk                                         | `#scopes`                   | S      | ~~over-applied~~ → **yes** (`3f933432`); the theme half is vacuous — no theme scan exists | `effective.rs:195,218-223`                                                            | ~~**BS-1** — PROBE-14~~ → **C** — fixed in `3f933432`; `the_foreign_skill_roots_survive_a_disabled_opencode_project_scope`                                                                                                                                                                                                                                                                                                         |
| O27  | Truthiness is `"true"`/`"1"` only                                                                          | `#scopes`                   | S      | yes                                                                                       | `coding_agent.rs:807-810`                                                             | **IU** M32 survives                                                                                                                                                                                                                                                                                                                                                                                                                |
| O28  | There is no `opencode.local.json`                                                                          | `#scopes`                   | S      | yes                                                                                       | `mcp_opencode.rs:39`                                                                  | **IU** bounded negative, no decoy                                                                                                                                                                                                                                                                                                                                                                                                  |
| O29  | **Merge-all within one filename class**                                                                    | `#instructions`             | S      | yes                                                                                       | `coding_agent.rs:726`, `inherited_memory.rs:59-71`                                    | **C** `acme_fixture_opencode_memory_census`; M5 caught                                                                                                                                                                                                                                                                                                                                                                             |
| O30  | **First-match across classes** — same level                                                                | `#instructions`             | S      | yes                                                                                       | `instructions.rs:316-320`                                                             | **C** `opencodes_class_rule_shadows_claude_md_without_touching_its_other_readers`                                                                                                                                                                                                                                                                                                                                                  |
| O31  | **First-match across classes** — across the whole walk (root `AGENTS.md` suppresses a closer `CLAUDE.md`)  | `#instructions`, `#ceiling` | S      | ~~**no**~~ → **yes** (`3f933432`)                                                         | `inherited_memory.rs:182` (`ancestor_class_floor`) → `instructions.rs:442,358-359`    | ~~**TW-1**~~ → **C** — fixed in `3f933432`; `acme_fixture_identity_service_census:294` now asserts `NotLoaded … "on this walk"`                                                                                                                                                                                                                                                                                                    |
| O32  | Two ancestor `AGENTS.md` both load; neither shadows the other                                              | `#instructions`             | S      | yes                                                                                       | `inherited_memory.rs:157-190`                                                         | **C** `acme_fixture_opencode_memory_census`                                                                                                                                                                                                                                                                                                                                                                                        |
| O33  | An ancestor `CLAUDE.md` is still **reported**, marked with what suppressed it                              | `#instructions`             | I      | yes                                                                                       | `inherited_memory.rs:24-35,140-150`                                                   | **C** same census (`false` rows)                                                                                                                                                                                                                                                                                                                                                                                                   |
| O34  | Insertion order: global → nearest→root → configured                                                        | `#instructions`             | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O35  | The lazy descendant path is a second mechanism and may mix classes                                         | `#instructions`             | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O36  | Startup and lazily-attached sets are different sets                                                        | `#instructions`             | I      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O37  | `CONTEXT.md` is the third class, deprecated, undocumented, still read                                      | `#instructions`             | S, D≠S | yes                                                                                       | `instruction_sources.rs:306,485`                                                      | ~~**IU** M38 survives~~ → **C** — fixed in `3f933432`: `the_ancestor_classes_align_with_the_project_table_class_for_class` (`instruction_sources.rs:709`) compares the ancestor classes and the project table by equality, so deleting the project row leaves `walked[2] == ["CONTEXT.md"]` against `in_project[2] == []`; deleting both fails `the_ancestor_walk_matrix_matches_the_five_guides` (`:692`). M39 was already caught |
| O38  | Every project walk stops at `ctx.worktree`, **inclusive**                                                  | `#ceiling`                  | S      | yes                                                                                       | `inherited_memory.rs:118-123`, `ancestors.rs:113`                                     | **C** `opencode_stops_at_the_repository_root`, `the_ceiling_directory_is_itself_in_reach`; M6 caught                                                                                                                                                                                                                                                                                                                               |
| O39  | "Project root" is Git-defined only — no `.opencode`-marker root                                            | `#ceiling`                  | S      | yes                                                                                       | `ancestors.rs:40-44`                                                                  | **C** `opencode_inherits_nothing_when_the_project_is_the_repository_root`                                                                                                                                                                                                                                                                                                                                                          |
| O40  | A **linked worktree** is its own root; the main checkout's ancestors are never visited                     | `#ceiling`                  | S      | yes                                                                                       | `ancestors.rs:42` accepts a `.git` **file**                                           | **C** `the_repository_ceiling_widens_to_the_outer_repository` (asserts the file form)                                                                                                                                                                                                                                                                                                                                              |
| O41  | No `.git` above cwd ⇒ worktree `/`, walks reach the filesystem root through `$HOME`                        | `#ceiling`                  | S      | no                                                                                        | `ancestors.rs:27-29` stops at home                                                    | **NI-d** `mcp_opencode.rs:210-216`; PROBE-5                                                                                                                                                                                                                                                                                                                                                                                        |
| O42  | Themes and both TUI walks are not worktree-bounded                                                         | `#ceiling`, `#themes`       | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O43  | Global `CLAUDE.md` fallback loads only if `<config>/AGENTS.md` is absent                                   | `#ceiling`                  | S      | yes                                                                                       | `instruction_sources.rs:319-329`                                                      | **C** PROBE-12a/b; M22 caught                                                                                                                                                                                                                                                                                                                                                                                                      |
| O44  | The global loop breaks on first hit — at most one global file loads                                        | `#ceiling`                  | S      | yes                                                                                       | `instructions.rs:316-320` (class ranking)                                             | **C** PROBE-12b shows `Shadowed by AGENTS.md`                                                                                                                                                                                                                                                                                                                                                                                      |
| O45  | The global fallback is the **literal** `~/.claude/CLAUDE.md`, not a `$CLAUDE_CONFIG_DIR` resolution (U-16) | `#ceiling`, `#cross-read`   | S      | yes                                                                                       | `instruction_sources.rs:324-328` (`InstructionRoot::Home`)                            | **C** `opencode_reads_the_literal_claude_home_while_claude_relocates_it`; M22 caught                                                                                                                                                                                                                                                                                                                                               |
| O46  | Project `CLAUDE.md` loads only if no `AGENTS.md` cwd→worktree                                              | `#ceiling`                  | S      | ~~partial~~ → **yes** (`3f933432`)                                                        | see O31                                                                               | ~~**TW-1**~~ → **C** — fixed in `3f933432`                                                                                                                                                                                                                                                                                                                                                                                         |
| O47  | Both halves removed by `OPENCODE_DISABLE_CLAUDE_CODE` / `_PROMPT`                                          | `#ceiling`                  | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O48  | Relative `instructions` glob runs once per ancestor via `globUp`                                           | `#configured-instructions`  | S      | yes                                                                                       | `opencode_settings.rs:147-152`                                                        | **C** `instructions_entries_are_reported_by_form_and_never_resolved`                                                                                                                                                                                                                                                                                                                                                               |
| O49  | Absolute entry globs its **last segment only**                                                             | same                        | S      | yes                                                                                       | `opencode_settings.rs:139-146`                                                        | **C** same test                                                                                                                                                                                                                                                                                                                                                                                                                    |
| O50  | `~/`-prefixed entries take the absolute path                                                               | same                        | S      | yes                                                                                       | `opencode_settings.rs:138-139`                                                        | **C** same test                                                                                                                                                                                                                                                                                                                                                                                                                    |
| O51  | URL entries: separate fetch, 5 s timeout, silent failure                                                   | same                        | S      | yes                                                                                       | `opencode_settings.rs:126-135`                                                        | **C** M20 caught                                                                                                                                                                                                                                                                                                                                                                                                                   |
| O52  | The effective file list is not computable from the entry — never resolve it                                | same                        | I      | yes                                                                                       | `opencode_settings.rs:156-162`                                                        | **C** same test                                                                                                                                                                                                                                                                                                                                                                                                                    |
| O53  | `instructions` is re-resolved on every agent step                                                          | same                        | S      | yes                                                                                       | description text only                                                                 | **IU**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O54  | Every entry is addressable as one array element                                                            | `#installing`               | I      | yes                                                                                       | `opencode_settings.rs:187-192`                                                        | **C** test asserts `EntryPointer{keys:["instructions"],array_value:Some}`                                                                                                                                                                                                                                                                                                                                                          |
| O55  | `instructions` concatenates across layers (array exception)                                                | `#layers`                   | D/S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O56  | `plugin` de-duplicates by load identity (the other exception)                                              | `#layers`                   | D/S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O57  | Ten layers, low→high, in statement order                                                                   | `#layers`                   | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O58  | Layer 5 list: XDG → project `.opencode` cwd→root → `~/.opencode` → `$OPENCODE_CONFIG_DIR`                  | `#layers` 5                 | S      | partial                                                                                   | `precedence_tables.rs:173-194`                                                        | **C** for the two scanned entries; M1 caught                                                                                                                                                                                                                                                                                                                                                                                       |
| O59  | `{env:}` / `{file:}` substituted **before** parsing at every scope                                         | `#layers`                   | D/S    | yes                                                                                       | `opencode_settings.rs:44-66`                                                          | **C** `a_settings_card_warns_when_it_is_showing_substitution_placeholders`                                                                                                                                                                                                                                                                                                                                                         |
| O60  | A `{file:}` target can pull a secrets file into effective config — render raw                              | `#layers`                   | S      | yes                                                                                       | same                                                                                  | **C** same test                                                                                                                                                                                                                                                                                                                                                                                                                    |
| O61  | A missing `{file:}` is a hard error in the main stack, empty in the TUI stack                              | `#layers`                   | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O62  | Post-processing 1: `mode` entries promoted into `agent` as `mode:"primary"`                                | `#layers` 10                | S      | yes                                                                                       | `opencode_settings.rs:218-222`, `opencode.rs:161-190`                                 | **C** `opencode_fixture_settings_file_declares_agents_commands_and_modes`; M31 caught                                                                                                                                                                                                                                                                                                                                              |
| O63  | Post-processing 2-4: `OPENCODE_PERMISSION`, `tools`→permissions, username/autoshare/compaction             | `#layers` 10                | S      | no                                                                                        | —                                                                                     | **NI** ×3                                                                                                                                                                                                                                                                                                                                                                                                                          |
| O64  | Top-level `opencode.json(c)` walks root→cwd — **closest wins**                                             | `#shadow`                   | S      | yes                                                                                       | `mcp_opencode.rs:257`                                                                 | **C** `the_rootmost_dot_opencode_wins_while_the_nearest_top_level_config_does`; M7 caught                                                                                                                                                                                                                                                                                                                                          |
| O65  | `.opencode` dirs walk cwd→root — **rootmost wins**                                                         | `#shadow`                   | S      | yes                                                                                       | `mcp_opencode.rs:255`, `precedence_tables.rs:176-193`                                 | **C** same test; M1, M7, M19, M24 caught                                                                                                                                                                                                                                                                                                                                                                                           |
| O66  | `.opencode` always outranks its sibling top-level `opencode.json`                                          | `#shadow`                   | S      | yes (MCP) / no (verdicts)                                                                 | `mcp_opencode.rs:250-258`                                                             | **C** for MCP; **D-2** for the settings verdict                                                                                                                                                                                                                                                                                                                                                                                    |
| O67  | `~/.opencode` and `$OPENCODE_CONFIG_DIR` outrank every project directory                                   | `#shadow`                   | S      | no                                                                                        | —                                                                                     | **NI-d**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| O68  | The direction is the **opposite** of Claude's identically-shaped walk                                      | `#shadow`                   | S      | yes                                                                                       | `coding_agent.rs:586-613`                                                             | **C** `opencode_takes_the_rootmost_ancestor_where_claude_takes_the_nearest`, `ancestor_precedence_runs_in_opposite_directions`; M19 caught                                                                                                                                                                                                                                                                                         |
| O69  | Loading configuration is **not read-only** — read the tree directly, never shell out                       | `#side-effects`             | S      | yes                                                                                       | `scanner/opencode.rs:11-29`; no `Command::new("opencode")` anywhere                   | **IU**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O70  | `node_modules`, `package.json`, lockfiles, generated `.gitignore` are never capabilities                   | `#side-effects`             | S      | yes                                                                                       | `opencode.rs:30,256-258`                                                              | **C** `opencode_fixture_decoys_and_opencode_md_stay_invisible`; M17 caught                                                                                                                                                                                                                                                                                                                                                         |
| O71  | `$schema` injection / stub global config / directory creation                                              | `#side-effects`             | S      | no                                                                                        | —                                                                                     | **NI-d** (header)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| O72  | TUI migration writes (`tui.json`, `.tui-migration.bak`, in-place strip)                                    | `#side-effects`             | S      | no                                                                                        | —                                                                                     | **NI-d** (header)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| O73  | Legacy TOML migration (`config` → `config.json`, unlink)                                                   | `#side-effects`             | S      | no                                                                                        | —                                                                                     | **NI-d** (header)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| O74  | Agents from `{agent,agents}/**/*.md`, **recursive**                                                        | `#agents`                   | D/S    | yes                                                                                       | `opencode.rs:82-89,272-327`                                                           | **C** `opencode_fixture_nested_command_and_folder_skills` (3 levels deep); M9, M34 caught                                                                                                                                                                                                                                                                                                                                          |
| O75  | Nested directories become `parent/child` names                                                             | `#agents`                   | S      | yes                                                                                       | `opencode.rs:286-298`                                                                 | **C** M34 caught                                                                                                                                                                                                                                                                                                                                                                                                                   |
| O76  | Agents from the inline `agent` map — a file is not required                                                | `#agents`                   | D/S    | yes                                                                                       | `opencode_settings.rs:218-268`                                                        | **C** `opencode_fixture_settings_file_declares_agents_commands_and_modes`; M31 caught                                                                                                                                                                                                                                                                                                                                              |
| O77  | `{mode,modes}/*.md` is **single-level**, not recursive                                                     | `#agents`                   | S      | yes                                                                                       | `opencode.rs:210-252`                                                                 | **C** `mode_files_load_as_agents_and_never_from_a_subdirectory`                                                                                                                                                                                                                                                                                                                                                                    |
| O78  | A mode file **deep-merges over** a same-named agent — both are live                                        | `#agents`, `#corrections`   | S      | yes                                                                                       | `opencode.rs:148-206`                                                                 | **C** `a_mode_and_a_same_named_agent_both_load_rather_than_contesting_the_name`; M23 caught                                                                                                                                                                                                                                                                                                                                        |
| O79  | The same promotion applies to inline `mode` entries                                                        | `#agents`                   | S      | yes                                                                                       | `opencode.rs:196-206` (`Artifact::Entry` branch)                                      | **C** PROBE-7; census pins the `mode:pairing` id                                                                                                                                                                                                                                                                                                                                                                                   |
| O80  | Agent field inventory (`variant`, `temperature`, `steps`, `disable`, `options`, …)                         | `#agents`                   | D/S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O81  | `tools` is deprecated in favour of `permission` and folds into it                                          | `#agents`                   | D/S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O82  | Built-ins `build`/`plan`/`general`/`explore` + hidden; "Scout" is absent (`D≠S`)                           | `#agents`                   | D≠S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O83  | A directory-only inventory misses every JSON-declared agent                                                | `#agents`                   | I      | yes                                                                                       | both sources scanned                                                                  | **C** census                                                                                                                                                                                                                                                                                                                                                                                                                       |
| O84  | Commands from `{command,commands}/**/*.md`, recursive, + inline `command` map                              | `#commands`                 | D/S    | yes                                                                                       | `opencode.rs:90-97`, `opencode_settings.rs:218`                                       | **C** census; M31, M34 caught                                                                                                                                                                                                                                                                                                                                                                                                      |
| O85  | Command frontmatter `description`/`agent`/`model`/`variant`/`subtask`; body → template                     | `#commands`                 | D/S    | partial                                                                                   | `opencode.rs:299`                                                                     | **IU**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O86  | Four-stage registration; three stages overwrite, skills never displace                                     | `#commands`                 | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O87  | MCP prompts register namespaced `sanitize(server):sanitize(prompt)`                                        | `#commands`, `#mcp`         | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O88  | Skills discovery order, 5 stages                                                                           | `#skills`                   | D/S    | partial                                                                                   | see O89-O93                                                                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| O89  | `~/.claude/skills` + `~/.agents/skills` at **user** scope                                                  | `#skills`                   | S      | **no**                                                                                    | `mod.rs:513` scans one root                                                           | **TW-2**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| O90  | `.claude/skills` and `.agents/skills` at every **ancestor** cwd→worktree                                   | `#skills`                   | S      | yes                                                                                       | `inherited.rs:50-72` scans every owner, filters by consumer                           | **C** `finds_skills_in_an_ancestor_directory` asserts the 3-consumer set; M44 caught                                                                                                                                                                                                                                                                                                                                               |
| O91  | `{skill,skills}/**/SKILL.md` in every config directory, recursive                                          | `#skills`                   | S      | yes                                                                                       | `opencode.rs:114-120,332-370`                                                         | **C** census (`quality/perf-audit` at depth); M29, M40 caught                                                                                                                                                                                                                                                                                                                                                                      |
| O92  | `skills.paths`                                                                                             | `#skills`                   | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O93  | `skills.urls` + `~/.cache/opencode/skills` staging                                                         | `#skills`                   | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O94  | `OPENCODE_DISABLE_EXTERNAL_SKILLS` / `_CLAUDE_CODE_SKILLS`                                                 | `#skills`                   | D/S    | no                                                                                        | —                                                                                     | **NI** ×2                                                                                                                                                                                                                                                                                                                                                                                                                          |
| O95  | Built-in `customize-opencode` seeded first, overridable                                                    | `#skills`                   | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O96  | Only a string `name` is validated; a description-less skill loads but is not advertised                    | `#skills`                   | D≠S    | partial                                                                                   | `opencode.rs:374-386` (name falls back to the folder)                                 | **NI** for the catalog nuance                                                                                                                                                                                                                                                                                                                                                                                                      |
| O97  | Skill availability is permission-filtered per agent                                                        | `#skills`                   | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O98  | **U-09: duplicate skill names have no winner — enumerate, never resolve**                                  | `#skills`, `#unknowns`      | U      | yes                                                                                       | `coding_agent.rs:552`, `precedence_tables.rs:164-173`, `effective.rs:438-462`         | ~~**IU** — M3/M36/M37/M46 all survive~~ → **C** — fixed in `3f933432`; `opencode_says_unknown_when_two_skills_share_a_name` + `opencode_skills_are_ranked_by_neither_precedence_table`                                                                                                                                                                                                                                             |
| O99  | Custom tools `{tool,tools}/*.{js,ts}`, **single-level**                                                    | `#tools`                    | D/S    | yes                                                                                       | `opencode.rs:127-134,440-489`                                                         | **C** census; M33 caught                                                                                                                                                                                                                                                                                                                                                                                                           |
| O100 | Default export takes the filename                                                                          | `#tools`                    | S      | yes                                                                                       | `opencode.rs:471-475`                                                                 | **C** census names                                                                                                                                                                                                                                                                                                                                                                                                                 |
| O101 | Named exports become `filename_export`                                                                     | `#tools`                    | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O102 | Tool shadow order, silent last-write                                                                       | `#tools`                    | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O103 | An OpenCode plugin is executable JS/TS or an npm package, not a manifest bundle                            | `#plugins`, `#vocabulary`   | D/S    | yes (scanner)                                                                             | `opencode.rs:135-142`, `opencode_settings.rs:342-381`                                 | **C** census; M30 caught. Contradicted by **BS-2** in the install refusal                                                                                                                                                                                                                                                                                                                                                          |
| O104 | The `plugin` array holds npm **and** path-like specs, reported by literal value                            | `#plugins`                  | S      | yes                                                                                       | `opencode_settings.rs:342-381`                                                        | **C** census pins `./scripts/opencode-audit.ts`; M30 caught                                                                                                                                                                                                                                                                                                                                                                        |
| O105 | Local `{plugin,plugins}/*.{js,ts}`, single-level, auto-discovered                                          | `#plugins`                  | D/S    | yes                                                                                       | `opencode.rs:135-142`                                                                 | **C** census                                                                                                                                                                                                                                                                                                                                                                                                                       |
| O106 | Plugin identity/order; internal-plugin roster; `--pure`; `OPENCODE_DISABLE_DEFAULT_PLUGINS`                | `#plugins`                  | S      | no                                                                                        | —                                                                                     | **NI** ×2                                                                                                                                                                                                                                                                                                                                                                                                                          |
| O107 | **There is NO hooks surface at all** — do not scan for one                                                 | `#plugins`                  | S      | yes                                                                                       | `coding_agent.rs:278,311`; `scan_opencode_dir` has no hooks branch                    | **C** structurally (PROBE-8); **IU** for the table (M4/M35 equivalent)                                                                                                                                                                                                                                                                                                                                                             |
| O108 | **U-10:** no uninstall verb, no marketplace manifest                                                       | `#plugins`, `#unknowns`     | U      | yes                                                                                       | every OpenCode plugin install cell closed; removal edits the array / deletes the file | **C** `install_matrix` closure tests                                                                                                                                                                                                                                                                                                                                                                                               |
| O109 | Only the merged config `mcp` map is native — no `.mcp.json` reader                                         | `#mcp`                      | S      | yes                                                                                       | `mcp_opencode.rs`; `install_matrix.rs:251-261`                                        | **C** `seedr_mcp_is_refused_for_agents_that_do_not_read_claudes_files`; M16 caught                                                                                                                                                                                                                                                                                                                                                 |
| O110 | Local shape: `command` argv array + **`environment`**, not `env`                                           | `#mcp`                      | S      | yes                                                                                       | `mcp_opencode.rs:180`                                                                 | **C** `only_the_environment_key_supplies_mcp_variables`; M8 caught                                                                                                                                                                                                                                                                                                                                                                 |
| O111 | Remote shape: `url`, `headers`, `oauth`                                                                    | `#mcp`                      | S      | yes                                                                                       | `mcp_opencode.rs:179`                                                                 | **C** `maps_local_and_remote_servers_from_root_jsonc`                                                                                                                                                                                                                                                                                                                                                                              |
| O112 | A bare `{"enabled": bool}` toggle is a legal entry with no transport                                       | `#mcp`                      | S      | yes                                                                                       | `mcp_opencode.rs:56-64`; `opencode_settings.rs:305-313`                               | **C** `a_bare_enabled_toggle_is_a_legal_server_entry`; M21 caught                                                                                                                                                                                                                                                                                                                                                                  |
| O113 | `enabled:false` short-circuits before any transport                                                        | `#mcp`                      | S      | yes                                                                                       | `mcp_opencode.rs:194-199`                                                             | **C** census asserts `status == "off"`                                                                                                                                                                                                                                                                                                                                                                                             |
| O114 | Same server ID **deep-merges** across layers                                                               | `#mcp`                      | S      | no                                                                                        | `mcp_opencode.rs:263` drops the loser                                                 | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O115 | Tool/prompt name sanitisation is lossy                                                                     | `#mcp`                      | S      | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O116 | `mcp-auth.json` is generated state, never authored configuration                                           | `#mcp`                      | S      | yes                                                                                       | never scanned                                                                         | **IU**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O117 | Timeout `D≠S` — do not render "timeout: 5000 (default)"                                                    | `#mcp`                      | D≠S    | yes                                                                                       | no timeout is rendered                                                                | **C** by omission (census pins the exact server fields)                                                                                                                                                                                                                                                                                                                                                                            |
| O118 | Themes (walk, plural-only, non-recursive, basename keying, rootmost, plugin themes, `D≠S`)                 | `#themes`                   | S      | no                                                                                        | —                                                                                     | **NI** ×5                                                                                                                                                                                                                                                                                                                                                                                                                          |
| O119 | TUI stack + key inventory + the legacy-key strip on load                                                   | `#themes`                   | S      | no — except the strip, stated on the card since `3f933432`                                | `opencode_settings.rs:55,70-74,90-97`                                                 | **NI** ×3 (was ×4); the strip is **C**, pinned by `a_settings_card_says_which_of_its_keys_the_loader_discards`                                                                                                                                                                                                                                                                                                                     |
| O120 | Permission model (`ask`/`allow`/`deny`, key inventory, `propertyOrder`)                                    | `#themes`                   | D/S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O121 | Config-key inventory (`snapshot`, `subagent_depth`, `enterprise.url`, `logLevel`, …)                       | `#themes`                   | D/S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O122 | **No native durable learned-memory** contract                                                              | `#themes`                   | S      | yes                                                                                       | `instruction_sources.rs:370-372` (`reads_auto_memory` ⇒ Claude only)                  | **C** `claude_owns_the_only_local_instruction_source`-adjacent; census                                                                                                                                                                                                                                                                                                                                                             |
| O123 | Session/share/server state is runtime-owned — do not parse, do not edit                                    | `#themes`                   | S      | —                                                                                         | —                                                                                     | **N/A**                                                                                                                                                                                                                                                                                                                                                                                                                            |
| O124 | `opencode plugin <module>` / `mcp add` / `agent create` / `github install` exist as first-party writers    | `#installing`               | D/S    | no                                                                                        | —                                                                                     | **NI**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O125 | Instruction files have **no frontmatter contract** (plain `readFileString`)                                | `#installing`               | S      | yes                                                                                       | `instructions.rs:207-223` parses frontmatter but never gates on it                    | **C** census                                                                                                                                                                                                                                                                                                                                                                                                                       |
| O126 | "Where to put a file so it wins": rootmost for `.opencode`, closest for top-level                          | `#installing`               | I      | yes                                                                                       | see O64/O65                                                                           | **C**                                                                                                                                                                                                                                                                                                                                                                                                                              |
| O127 | Hook: **does not exist** — use a plugin callback                                                           | `#installing`               | S      | yes                                                                                       | every OpenCode hook cell closed                                                       | **C** `install_matrix` closure tests                                                                                                                                                                                                                                                                                                                                                                                               |

_(`O88` is a heading and is not counted, giving 126 OpenCode claim rows. `O63`,
`O94`, `O106`, `O118` and `O119` each collapse several closely-related
sub-claims into one row rather than padding the count. `O103` is classed
**CONFORMS** — the scanner is right — and its install-side contradiction is
counted once, as **BS-2**, on row `X26`.)_

### 4.2 Cross-tool — `docs/cross-tool-matrix.html` (32 claims)

| #   | Claim                                                                                                   | Anchor                                   | Ev     | Impl?                     | Where                                                                                              | Pinned by                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ | ------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X01 | One `AGENTS.md`, four readers — Codex, Copilot, Antigravity, OpenCode; **never** Claude                 | `#matrix-instructions`                   | D/S    | yes                       | `coding_agent.rs:892-897`; `instruction_sources.rs` tables                                         | **C** `shared_surface_consumer_table`, `agents_md_readers_match_the_shared_surface_table`, `shared_files_carry_exactly_the_agents_whose_table_names_them`; M43 caught                                                                                                                                                                                                                                                                          |
| X02 | `CLAUDE.md` readers: Claude, Copilot, OpenCode                                                          | `#matrix-instructions`                   | D/S    | yes                       | `instruction_sources.rs:227-252,295-307`                                                           | **C** `shared_files_carry_exactly_the_agents_whose_table_names_them`                                                                                                                                                                                                                                                                                                                                                                           |
| X03 | `GEMINI.md` readers: Copilot, Antigravity — **no** OpenCode reader                                      | `#matrix-instructions`                   | S      | yes                       | same tables                                                                                        | **C** same test                                                                                                                                                                                                                                                                                                                                                                                                                                |
| X04 | `AGENTS.override.md` is Codex-only; absent from OpenCode                                                | `#matrix-instructions`                   | S      | yes                       | `CODEX_PROJECT` only                                                                               | **C** `codex_override_shadows_agents_md_for_codex_only`                                                                                                                                                                                                                                                                                                                                                                                        |
| X05 | `CONTEXT.md` is OpenCode-only, third class, undocumented                                                | `#matrix-instructions`                   | S, D≠S | yes                       | `OPENCODE_PROJECT` only                                                                            | ~~**IU** M38 survives~~ → **C** — fixed in `3f933432`; see `O37`                                                                                                                                                                                                                                                                                                                                                                               |
| X06 | `~/.claude/CLAUDE.md`: Claude resolves via `$CLAUDE_CONFIG_DIR`, OpenCode reads the literal path        | `#matrix-instructions`, `#unknowns` U-16 | S      | yes                       | `instruction_sources.rs:66-87,324-328`                                                             | **C** `opencode_reads_the_literal_claude_home_while_claude_relocates_it`; M22 caught                                                                                                                                                                                                                                                                                                                                                           |
| X07 | Only Codex and OpenCode **rank** their instruction classes; the rest concatenate                        | `#precedence`                            | S      | yes                       | `instruction_sources.rs:98-105`                                                                    | **C** `only_codex_and_opencode_rank_their_instruction_classes`; M5 caught                                                                                                                                                                                                                                                                                                                                                                      |
| X08 | `.claude/agents` readers: Claude, Copilot — **not** OpenCode                                            | `#matrix-skills`                         | S      | yes                       | `coding_agent.rs:903-905`                                                                          | **C** `shared_surface_consumer_table:1383` asserts OpenCode's absence                                                                                                                                                                                                                                                                                                                                                                          |
| X09 | `.claude/commands` readers: Claude, Copilot — not OpenCode                                              | `#matrix-commands`                       | S      | yes                       | same                                                                                               | **C** same                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| X10 | `.claude/settings.json` is a **five-key subset** for Copilot; not an OpenCode surface at all            | `#matrix-settings`                       | S      | yes                       | `coding_agent.rs:916-932`                                                                          | **C** `shared_surface_consumer_table`                                                                                                                                                                                                                                                                                                                                                                                                          |
| X11 | `.mcp.json` readers: Claude, Copilot only                                                               | `#matrix-mcp`                            | S      | yes                       | `coding_agent.rs:906`                                                                              | **C** M16 caught                                                                                                                                                                                                                                                                                                                                                                                                                               |
| X12 | `.claude/skills` readers: Claude, Copilot, OpenCode                                                     | `#matrix-skills`                         | S      | yes                       | `coding_agent.rs:898-902`                                                                          | **C** `project_claude_skills_carry_three_consumers`, `user_claude_skills_carry_three_consumers`; M44 caught                                                                                                                                                                                                                                                                                                                                    |
| X13 | `.agents/skills` readers: Codex, Copilot, Antigravity, OpenCode — `.agents/` is **not** a portable root | `#matrix-skills`                         | S      | yes                       | `coding_agent.rs:886-891,849-852`                                                                  | **C** `shared_skill_lists_all_native_agents_skills_readers`; M18 caught                                                                                                                                                                                                                                                                                                                                                                        |
| X14 | **Depth asymmetry**: Claude accepts only the 4-segment shape; OpenCode globs `**/SKILL.md`              | `#matrix-skills`                         | S      | yes                       | `coding_agent.rs:457-463`, `effective.rs:223-258`                                                  | **C** `a_nested_skill_is_not_loaded_for_claude_and_loaded_for_opencode`, `shared_fixture_nested_skill_answers_each_agent_differently`; M2 caught                                                                                                                                                                                                                                                                                               |
| X15 | `~/.claude/skills/synced/` is read **incidentally** by OpenCode                                         | `#matrix-skills`                         | S      | yes                       | `claude_dir.rs:298-333` emits it with the shared consumer set                                      | **IU** the verdict is Claude-specific; OpenCode's incidental read is not asserted                                                                                                                                                                                                                                                                                                                                                              |
| X16 | Plugin-supplied `skills/` is `B:R` for four coding agents and **absent** for OpenCode                   | `#matrix-skills`                         | D/S    | yes                       | `mod.rs:944-948` — plugin scanning is Claude-only                                                  | **C** census                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| X17 | Five inheritance ceilings, no two alike — the comparison table                                          | `#inheritance`                           | S      | yes                       | `coding_agent.rs:371-390` (`AncestorCeiling`)                                                      | **C** `only_three_agents_walk_upwards_for_capabilities`; M24 caught                                                                                                                                                                                                                                                                                                                                                                            |
| X18 | Claude's dual ceiling vs OpenCode's Repository ceiling                                                  | `#inheritance`                           | S      | yes                       | `ancestors.rs:94-105` vs `:40-44`                                                                  | **C** `the_repository_ceiling_widens_to_the_outer_repository`, `walk_stops_above_the_repository_root`                                                                                                                                                                                                                                                                                                                                          |
| X19 | Only Claude walks ancestors for `.mcp.json`, and that walk is uncapped                                  | `#inheritance`                           | S      | yes                       | `coding_agent.rs:410-422`                                                                          | **C** `only_claude_walks_ancestors_for_project_mcp_and_that_walk_is_uncapped`                                                                                                                                                                                                                                                                                                                                                                  |
| X20 | Codex and Antigravity never walk past the project root                                                  | `#inheritance`                           | S      | yes                       | `instruction_sources.rs:459-479` (`RepositoryRoot`, inclusive)                                     | **C** ~~`agents_that_never_look_upwards_inherit_nothing`~~ → since `3f933432` that test is gone and both agents walk _up to_ the repository root rather than not at all — the row's claim is unchanged and still holds; the sibling reports' TESTED-WRONG rows (`CX-X11`, `AG-A15`) are fixed. Now pinned by `codex_reads_ancestor_agents_md_up_to_the_repository_root` and `antigravity_accumulates_both_filenames_up_to_the_repository_root` |
| X21 | **Direction 1 — NEAREST wins**: Claude capability dirs, Copilot workspace MCP                           | `#precedence`                            | S      | yes                       | `coding_agent.rs:602-610`                                                                          | **C** `ancestor_precedence_runs_in_opposite_directions`; M19 caught                                                                                                                                                                                                                                                                                                                                                                            |
| X22 | **Direction 2 — ROOTMOST wins**: OpenCode `.opencode` dirs (and themes)                                 | `#precedence`                            | S      | yes (dirs) / no (themes)  | same                                                                                               | **C** for `.opencode`; **NI** for themes                                                                                                                                                                                                                                                                                                                                                                                                       |
| X23 | **Direction 3 — FIRST loaded wins**: Copilot skills and agents, opposite outcomes from one rule         | `#precedence`                            | D/S    | yes                       | `precedence_tables.rs:99-142`                                                                      | **C** `copilot_orders_skills_project_first_and_agents_user_first`                                                                                                                                                                                                                                                                                                                                                                              |
| X24 | **Direction 4 — NO winner exists**: U-05, U-09, U-13 — enumerate, never resolve                         | `#precedence`                            | U      | yes                       | `coding_agent.rs:568-578`, `effective.rs:411-439`                                                  | **C** for U-13 only (`claude_says_unknown_when_two_skills_share_a_name`). **U-09 unpinned**; **U-05 unreachable** — see §6                                                                                                                                                                                                                                                                                                                     |
| X25 | Vocabulary — **Rule**: instruction context in Claude/Antigravity/OpenCode; shell policy in Codex        | `#vocabulary`                            | D      | yes                       | `inherited_memory` `rules_dir` is `None` for OpenCode; Codex `.rules` is not an instruction source | **C** ~~`claude_walks_past_the_repository_root_but_opencode_does_not`~~ → since `3f933432` that test is gone; `the_ancestor_walk_matrix_matches_the_five_guides` asserts `opencode.rules_dir == None` (`instruction_sources.rs:689`) and `claude.rules_dir == Some(".claude/rules")` (`:658`)                                                                                                                                                  |
| X26 | Vocabulary — **Plugin**: manifest bundle in four, executable JS/TS in OpenCode                          | `#vocabulary`                            | D/S    | yes (scanner and refusal) | `opencode.rs:135-142`; `install_matrix.rs:424-428`                                                 | ~~**BS-2** — the install refusal says the opposite~~ → **C** — fixed in `3f933432`; `the_plugin_refusal_does_not_deny_opencodes_own_plugin_format`                                                                                                                                                                                                                                                                                             |
| X27 | Vocabulary — **Mode**: OpenCode `{mode,modes}/*.md` deep-merges over a same-named agent                 | `#vocabulary`                            | S      | yes                       | `opencode.rs:148-206`                                                                              | **C** M23 caught                                                                                                                                                                                                                                                                                                                                                                                                                               |
| X28 | Vocabulary — **Local**: never an override class in OpenCode                                             | `#vocabulary`                            | S      | yes                       | no `opencode.local.json` reader                                                                    | **IU**                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| X29 | Vocabulary — **Hooks**: plugin callbacks are OpenCode's whole lifecycle contract                        | `#vocabulary`                            | S      | yes                       | `coding_agent.rs:276-314`                                                                          | **C** structurally (PROBE-8)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| X30 | Vocabulary — **Memory**: none native for OpenCode                                                       | `#vocabulary`                            | S      | yes                       | `reads_auto_memory`                                                                                | **C**                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| X31 | Vocabulary — **Inherited** is a _label on a discovery source_, not a fifth storage scope                | `#vocabulary`                            | D/S    | yes                       | `inherited.rs:37` `INHERITED_SOURCE` + `InheritedOrigin`                                           | **C** census                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| X32 | "Model the edge, not the folder" — compatibility is per artifact, never `.claude/` wholesale            | `#overview`                              | —      | yes                       | consumer sets derived from `instruction_sources` + `shared_surface_consumers`                      | **C** `shared_files_carry_exactly_the_agents_whose_table_names_them`                                                                                                                                                                                                                                                                                                                                                                           |

---

## 5. Mutation results

46 mutations were attempted against the scratchpad copy, each applied alone,
with a full `cargo test --workspace` run and a revert between each. One was a
no-op (a type annotation) and one was an accidental duplicate, leaving **44
distinct mutations: 31 caught, 13 survived, 2 of the survivors equivalent
mutants** (both verified by probe). Kill rate on non-equivalent mutants:
31 / 42 = **74%**.

### Caught (31)

| Mutation                                                                 | Killed by                                                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1 `opencode_source_order` reversed                                      | `opencode_takes_the_rootmost_ancestor_where_claude_takes_the_nearest`, `without_the_switch_the_project_scope_competes_as_usual`, `fixture_census_acme` |
| M2 OpenCode skill depth → `ExactlyOneLevel`                              | `a_nested_skill_is_not_loaded_for_claude_and_loaded_for_opencode`, `shared_fixture_nested_skill_answers_each_agent_differently`                        |
| M5 OpenCode instruction classes all `0`                                  | `opencodes_class_rule_shadows_claude_md_without_touching_its_other_readers`, `complete_fixture_project_level_lists_only_what_each_agent_reads`         |
| M6 `stop_at_repository_root` → false                                     | `opencode_stops_at_the_repository_root`, `opencode_inherits_nothing_when_the_project_is_the_repository_root`                                           |
| M7 `.opencode` dirs walked nearest-first                                 | `the_rootmost_dot_opencode_wins_while_the_nearest_top_level_config_does`                                                                               |
| M8 MCP `environment` → `env`                                             | `only_the_environment_key_supplies_mcp_variables` + 3 more                                                                                             |
| M9 singular `agent/` dropped                                             | 4 census tests incl. `acme_fixture_opencode_ancestor_agents_let_the_rootmost_copy_win`                                                                 |
| M10 `mode`/`modes` dropped                                               | 4 tests incl. `a_mode_and_a_same_named_agent_both_load_…`                                                                                              |
| M13 disabled project scope no longer covers `inherited`                  | `a_disabled_opencode_project_scope_neither_loads_nor_competes`                                                                                         |
| M14 skills.sh no longer writes `.agents/skills`                          | `skills_sh_project_skills_resolve_to_the_shared_agents_directory`, `removal_finds_a_skills_sh_skill_in_the_shared_directory`                           |
| M15 global `config.json` dropped                                         | `only_the_global_scope_reads_config_json`                                                                                                              |
| M16 seedr MCP opened for every coding agent                              | `seedr_mcp_is_refused_for_agents_that_do_not_read_claudes_files`                                                                                       |
| M17 `node_modules` becomes scannable                                     | `node_modules_and_lockfiles_are_never_components`, `scans_every_capability_type_from_the_full_layout`                                                  |
| M18 OpenCode dropped from `.agents/skills` readers                       | 4 tests across `crud`, `install_matrix`, `install_verify`, `registry_install`                                                                          |
| M19 ancestor precedence flipped                                          | `opencode_takes_the_rootmost_ancestor_…`, `acme_fixture_opencode_ancestor_agents_…`                                                                    |
| M20 `instructions` URL loses its conditional verdict                     | `instructions_entries_are_reported_by_form_and_never_resolved`                                                                                         |
| M21 bare `{enabled}` toggle no longer a declaration                      | `a_bare_toggle_named_servers_is_not_mistaken_for_the_v2_container`                                                                                     |
| M22 OpenCode's `~/.claude/CLAUDE.md` re-anchored to `$CLAUDE_CONFIG_DIR` | `opencode_reads_the_literal_claude_home_while_claude_relocates_it`                                                                                     |
| M23 mode files no longer merge with a same-named agent                   | `a_mode_and_a_same_named_agent_both_load_rather_than_contesting_the_name`                                                                              |
| M24 OpenCode ancestor types narrowed to `skill`                          | `acme_fixture_opencode_ancestor_agents_let_the_rootmost_copy_win`                                                                                      |
| M29 plural `skills/` dropped                                             | 4 census tests                                                                                                                                         |
| M30 `plugin` array entries dropped                                       | 4 census tests                                                                                                                                         |
| M31 inline `agent`/`command`/`mode` maps dropped                         | 4 census tests                                                                                                                                         |
| M33 singular `tool/` dropped                                             | 4 tests                                                                                                                                                |
| M34 nested command naming flattened                                      | `opencode_fixture_nested_command_and_folder_skills`, `nested_and_singular_dirs_shape_component_names`                                                  |
| M39 `CONTEXT.md` dropped from the ancestor class table                   | `claude_walks_past_the_repository_root_but_opencode_does_not`                                                                                          |
| M40 skill folders no longer discovered at depth                          | 4 census tests                                                                                                                                         |
| M42 OpenCode `user_config_dir` → `~/.opencode`                           | 3 `scanner::tests`                                                                                                                                     |
| M43 `AGENTS.md` readers lose OpenCode                                    | `shared_surface_consumer_table`, `agents_md_readers_match_the_shared_surface_table`                                                                    |
| M44 `ClaudeSkills` readers lose OpenCode                                 | 5 tests incl. two census files                                                                                                                         |
| M45 seedr no longer refuses Antigravity                                  | 3 `install_matrix` tests                                                                                                                               |

### Survived (13, of which 2 are equivalent) — and what each one means

> **Since `3f933432`, seven of these thirteen are dead**: M46, M26/M36, M37 and
> M3 (the U-09 cluster, killed by the two tests in §3.4 `U-1`), M25 (killed by
> `jsonc_outranks_json_in_one_directory`) and M38 (killed by
> `the_ancestor_classes_align_with_the_project_table_class_for_class`). The
> remaining survivors are unchanged. The table below is the record of the run at
> `d3d1e445`.

| Mutation                                                                            | Effect if shipped                                                                                                                                                                                                                         | Verified observable?                                       |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **M46** `"skill"` added to _both_ `opencode_precedence` and `opencode_source_order` | Two same-named OpenCode skills render `Loaded` / `Shadowed by project · .opencode/skills/lint` instead of `Unknown{U-09}`. **The app starts inventing the winner U-09 forbids.** 742 green                                                | **yes** — PROBE-6 under mutation                           |
| M26 (= M36, run twice) and M37 — each half of M46 alone                             | `Unknown` is preserved by the _other_ table: `rank_contenders` needs both a non-`Unknown` precedence **and** a `source_load_order` arm. Real defence in depth — but neither half is asserted, so a future edit that touches both loses it | yes                                                        |
| M3 drop the `U-09` citation                                                         | The card still says Unknown but cites `cross-tool-matrix.html#unknowns` instead of `U-09`                                                                                                                                                 | yes                                                        |
| M25 `.jsonc` ordered before `.json`                                                 | The **guide-correct** winner appears. Neither direction is pinned → **D-1**                                                                                                                                                               | **yes** — PROBE-1                                          |
| M28 OpenCode instructions → `LastLoadedWins`                                        | Instruction files start shadowing each other for OpenCode                                                                                                                                                                                 | not probed                                                 |
| M38 drop `CONTEXT.md` from the project table                                        | OpenCode's third filename class disappears from project cards. **Dead since `3f933432`** — `the_ancestor_classes_align_with_the_project_table_class_for_class` compares the two tables by equality                                        | not probed                                                 |
| M32 `OPENCODE_DISABLE_PROJECT_CONFIG` truthiness widened to any non-empty value     | `=no` would switch the project scope off                                                                                                                                                                                                  | equivalent for the probe (env not set); genuinely untested |
| M11 seedr user-scope OpenCode root special case removed                             | Install verification looks in `~/.config/opencode/skills` while seedr wrote `~/.opencode/skills` ⇒ every such install reports `verificationFailed`                                                                                        | not probed                                                 |
| M12 seedr user-scope OpenCode **target string** changed                             | The pre-install tooltip names the wrong directory                                                                                                                                                                                         | not probed                                                 |
| M27 skills.sh user-scope OpenCode target changed                                    | Same, for the other marketplace                                                                                                                                                                                                           | not probed                                                 |
| M4 / M35 OpenCode gains a `hooks` dir / a hooks registry                            | **Equivalent mutants** — `scan_opencode_dir` has no hooks branch, so `.opencode/hooks/pre.sh` still yields nothing                                                                                                                        | **yes** — PROBE-8 unchanged under both                     |

### Behavioural probes (14, no mutation)

PROBE-1 `.json` beats `.jsonc` · PROBE-2 two settings cards → `Unknown` ·
PROBE-3 project `CLAUDE.md` not suppressed by an ancestor `AGENTS.md` ·
PROBE-4 the OpenCode ancestor walk returns agent/tool/plugin with rootmost-wins
shadowing · PROBE-5 the no-`.git` walk stops at `$HOME` · PROBE-6 duplicate
skills → `Unknown{U-09}` · PROBE-7 an inline `agent` entry and a `mode` file of
one name both load · PROBE-8 `.opencode/hooks/` yields nothing · PROBE-9 the
plugin refusal sentence · PROBE-10 the only `Unknown` verdicts in
`only-opencode` are the two settings cards · PROBE-11 OpenCode's user scope
misses two foreign skill roots · PROBE-12 the user-scope class rule is correct ·
PROBE-13 the shipped acme fixture contradicts itself · PROBE-14
`OPENCODE_DISABLE_PROJECT_CONFIG` over-applies.

---

## 6. The U-01…U-16 register — consistency check

**Every U-number Configr cites is live, correctly numbered, and matches the
register. No renumbering, no invention.** Three defects, none of them a wrong
number.

| U    | Coding agent | Cited in Configr?                                                                        | Reachable at runtime?                        | Consistent?                                                      |
| ---- | ------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| U-01 | Antigravity  | `antigravity_user.rs:56,94,271`                                                          | yes (verdict text)                           | ✓                                                                |
| U-02 | Antigravity  | `antigravity.rs:776,820`, `antigravity_mcp.rs:120`                                       | yes                                          | ✓                                                                |
| U-03 | Antigravity  | `antigravity.rs:55,60,286,705`, `coding_agent.rs:243`, `fixture_census_oc_ag.rs:449,793` | yes                                          | ✓                                                                |
| U-04 | Copilot      | `precedence_tables.rs:116-118` (as **resolved**)                                         | n/a                                          | ✓ matches the register's "Resolved 2026-08-13"                   |
| U-05 | Copilot      | `coding_agent.rs:572`                                                                    | **no — structurally unreachable**            | numbering ✓, wiring ✗                                            |
| U-06 | Copilot      | not cited                                                                                | —                                            | ✓ (no surface needs it)                                          |
| U-07 | Claude       | `coding_agent.rs:571`                                                                    | yes                                          | ✓                                                                |
| U-08 | Codex        | not cited                                                                                | —                                            | ✓                                                                |
| U-09 | **OpenCode** | `coding_agent.rs:552`                                                                    | yes                                          | ✓ ~~**but asserted nowhere**~~ → asserted twice since `3f933432` |
| U-10 | **OpenCode** | not cited                                                                                | honoured structurally (no uninstall offered) | ✓                                                                |
| U-11 | all five     | not cited                                                                                | —                                            | ✓ (documentation-level)                                          |
| U-12 | Antigravity  | not cited                                                                                | —                                            | ✓                                                                |
| U-13 | Claude       | `coding_agent.rs:570`, asserted at `effective.rs:611-613`                                | yes                                          | ✓ — the only U-number with a test                                |
| U-14 | Codex        | `precedence_tables.rs:83-88` (comment, explains unreachability)                          | n/a                                          | ✓                                                                |
| U-15 | Copilot      | not cited                                                                                | —                                            | ✓                                                                |
| U-16 | Cross-tool   | `instruction_sources.rs:83,318,419`                                                      | yes                                          | ✓ OpenCode half correctly recorded as **resolved**               |

**Defect R-1 — U-05 is dead wiring.** `unresolved_precedence(Copilot,"instruction")`
returns `Some("U-05")`, but `capability_precedence(Copilot,"instruction")` is
`AllApply` (`coding_agent.rs:526`), and `resolve_contenders` returns early for
`AllApply` (`effective.rs:294-297`) — `unresolved()` can never run for that pair.
The behaviour is _correct_ (GitHub says the files combine), so this is a dangling
citation rather than a wrong answer; it should be deleted or the comment should
say why it is kept.

**Defect R-2 — the fallback citation is used for questions the register does not
contain.** `effective.rs:429` falls back to `"cross-tool-matrix.html#unknowns"`
whenever `unresolved_precedence` returns `None`. That fires for OpenCode
`settings` (**D-2**) — a question `#shadow` answers at `S` strength — and sends
the reader to a register with no such entry. The fallback should either name the
guide section that _does_ settle it or refuse to render `Unknown` at all.

**Defect R-3 — U-09 is the only "no winner exists" number with no test.** U-13
is asserted twice (`effective.rs:611-613`). U-09 is asserted nowhere, and M46
proves the contract can be broken silently. Given that the register ranks U-09
second only to U-13 in "how likely each is to make a tool state something false",
this is the single most valuable missing test in my scope.

> **RESOLVED in `3f933432`.** Two tests, split along the axis the mutation
> results identified: `opencode_says_unknown_when_two_skills_share_a_name`
> (`scanner/effective.rs:653`) asserts the rendered verdict and
> `spec == "U-09"`, and `opencode_skills_are_ranked_by_neither_precedence_table`
> (`toolr-core/src/coding_agent.rs:1134`) asserts `capability_precedence`,
> `source_load_order` and `unresolved_precedence` separately, with positive
> controls on `"agent"` proving the tables are not simply empty. **R-1 (U-05
> dead wiring) and R-2 (the fallback citation, `D-2`) are unchanged.**
>
> One thing this does not fix: there is still **no `U-01…U-16` register in the
> Rust tree**. The register lives only in
> `docs/cross-tool-matrix.html#unknowns`; code cites individual numbers, and
> U-06, U-08, U-11, U-12 and U-15 appear nowhere in `src-tauri`. A renumbering
> or a dropped register entry would still be caught by nothing except the two
> `spec` assertions for U-09 and U-13.

**Consistency between the three sources.** `scanner/effective.rs` holds no
U-numbers of its own — it reads them from `CodingAgent::unresolved_precedence`
and stores them in `EffectiveState::spec`. `unresolved_precedence`'s six entries
use exactly the register's numbers, and its two Antigravity rows correctly cite
the per-guide register instead of inventing consolidated numbers (the register
confirms those two are section-level unknowns without a number). **No drift.**

---

## 7. The install path against `docs/seedr-install-audit.md` and `d3d1e445`

`d3d1e445` is the strongest-tested work in my scope. Backend and frontend both.

| Audit finding                                                              | Fixed? | Where                                                                                             | Pinned by                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-1** seedr silently installs for Claude                                | yes    | `install_matrix.rs:132-160`                                                                       | `seedr_claude_only_types_are_refused_for_every_other_agent`, `seedr_refusal_names_the_requested_agent_and_type`                                                                                                                     |
| **P0-2** aitmpl ignores the coding agent; user scope → `~/.claude/.claude` | yes    | `install_matrix.rs:278-297`                                                                       | `aitmpl_is_claude_and_project_only`                                                                                                                                                                                                 |
| **P0-3** seedr Copilot user root `~/.github`                               | yes    | `install_matrix.rs:220-226`                                                                       | `seedr_user_scope_copilot_skills_are_refused`                                                                                                                                                                                       |
| **P0-4** three no-op outcomes exit 0                                       | yes    | `install_matrix.rs:33-47`, `install_verify.rs:212-289`                                            | `a_missing_artifact_is_reported_instead_of_trusted`, `a_removal_that_left_the_capability_behind_does_not_verify`, `outcome_success_projection_is_only_true_for_succeeded`                                                           |
| **P1-2** skills.sh project installs for OpenCode unremovable               | yes    | `install_verify.rs:131-135`                                                                       | `skills_sh_project_skills_resolve_to_the_shared_agents_directory` (asserts **opencode** explicitly); M14 caught                                                                                                                     |
| **P1-3** no shared-surface warning                                         | yes    | `install_matrix.rs:505-514` + `useSharedSurfaceConfirm.ts:28-33`, `SharedSurfaceConfirmModal.tsx` | `shared_project_skill_installs_report_the_other_readers` (uses `CodingAgent::Opencode`); `installGating.test.tsx` "names the other coding agents before the install runs"                                                           |
| **P1-4** install used the main checkout, removal the worktree              | yes    | `useInstallContext.ts:43-45`, `useSeedrActions.ts:450-452`                                        | `useInstallContext.test.ts` "installs into the active worktree, not the canonical checkout". **Gap:** `useSeedrActions.test.ts:81` sets `activeWorktrees: {}`, so that hook's resolution is never exercised with an active worktree |
| **P1-7** structural gaps not communicated                                  | yes    | every closed cell carries a sentence                                                              | `every_closed_cell_carries_a_reason_and_every_open_cell_does_not`                                                                                                                                                                   |
| **P2-5** aitmpl `--plugin` flag it never declares                          | yes    | `install_matrix.rs:322-326`                                                                       | `aitmpl_plugins_are_refused`                                                                                                                                                                                                        |
| **P1-6** no install validates the coding agent's shape                     | **no** | —                                                                                                 | —                                                                                                                                                                                                                                   |
| **P2-3** seedr ignores `$CLAUDE_CONFIG_DIR`                                | **no** | —                                                                                                 | —                                                                                                                                                                                                                                   |
| **P2-6** installer CLI versions unpinned                                   | **no** | —                                                                                                 | —                                                                                                                                                                                                                                   |

### Do the new cells match what the OpenCode guide says OpenCode reads?

| Cell                                                        | Target                                                                                                                                                                                                    | Guide check                                                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| seedr / skill / opencode / project                          | `.opencode/skills/<name>/`                                                                                                                                                                                | ✓ `#scopes` — a project `.opencode` is a config directory                                                                                   |
| seedr / skill / opencode / **user**                         | `~/.opencode/skills/<name>/`                                                                                                                                                                              | ✓ `#scopes` — legacy `~/.opencode` _is_ a config directory. **But see below**                                                               |
| skills-sh / skill / opencode / user                         | `~/.config/opencode/skills/<name>/`                                                                                                                                                                       | ✓ the XDG global directory                                                                                                                  |
| skills-sh / skill / opencode / project                      | `.agents/skills/<name>/` shared with Codex/Copilot/Antigravity                                                                                                                                            | ✓ `#cross-read`                                                                                                                             |
| seedr / mcp / opencode / \*                                 | **closed** — "seedr writes project MCP servers into `.mcp.json`, which OpenCode does not load"                                                                                                            | ✓ `#mcp` bounded negative                                                                                                                   |
| seedr / {command, agent, hook, plugin, settings} / opencode | **closed**                                                                                                                                                                                                | ✓ decision right; the _hook_ sentence blames seedr rather than saying OpenCode has no hooks surface (cosmetic)                              |
| claude-plugins / plugin / opencode                          | **closed** — ~~"OpenCode has no plugin loader"~~ → since `3f933432`, "Claude Code plugin bundles are a Claude Code format. OpenCode plugins are JS/TS modules or npm packages declared in opencode.json…" | ~~✗ **BS-2** — the guide says the opposite~~ → ✓                                                                                            |
| every aitmpl cell for opencode                              | **closed**                                                                                                                                                                                                | ✓                                                                                                                                           |
| `capability_dir(_, Opencode, "hook", _)`                    | `Err("Tool 'opencode' has no hook directory")`                                                                                                                                                            | ✓ `#plugins`. Untested for OpenCode — `capability_dir_rejects_types_without_a_directory` covers Codex `command` and Antigravity `hook` only |

**One structural inconsistency worth the owner's attention** — _closed in
`3f933432`_. Configr will install a skill into `~/.opencode/skills/` and verify
it there — and then never show it, because `~/.opencode` is a documented
non-scan (`precedence_tables.rs:182-188`). The install succeeds, the card does
not flip, and the user has a live capability the browser denies exists. That is
the same class of "silently wrong place" the whole commit was written to
eliminate, one level up.

> **Fixed by making the scanner agree with the installer, not the other way
> round.** `scan_legacy_user_root` (`scanner/opencode.rs:83`) scans
> `~/.opencode` and stamps every card `LoadVerdict::Unknown` with
> `LEGACY_ROOT_NOTE` — present, no rank claimed. The install target
> (`install_matrix.rs:217`) and the verifier (`install_verify.rs:153`) are
> unchanged. Pinned by `the_legacy_opencode_root_is_listed_with_no_rank_claimed`
> (`scanner/mod.rs`), which also asserts the XDG root's card carries no
> verdict and that Claude and Codex user scopes do not surface the skill.
>
> **The installer half is still unpinned in the other direction**: no test
> asserts the seedr OpenCode user-scope target string, so `install_matrix.rs:217`
> could be changed to `~/.config/opencode/skills/` and nothing would fail. That
> is audit rows `U-2`/`U-3` (M11, M12, M27), still open.

---

## 8. What would it take to close the gaps

### Tier 1 — correctness, small, high value

> **Items 1, 2, 3 and 4 landed in `3f933432`.** TW-1 was fixed close to the
> shape proposed in item 1 — `ancestor_class_floor` is exported from
> `inherited_memory` and passed into the project scan — with one addition: the
> "ranks classes" condition became a typed `ClassRange` field rather than an
> `inherited_memory().is_some()` test, so Codex's per-directory rule is
> explicitly excluded. **Item 5 (D-2) has not landed**, and neither has the
> `settingss` typo at `effective.rs:425`.

1. **Fix TW-1.** `scan_project_instructions` needs the ancestor walk's
   `winning_class`. `inherited_memory::winning_class` already computes it over
   project + ancestors; export it and pass the result into
   `instructions::claim_sources` as an override for agents whose
   `inherited_memory()` ranks classes (Codex and OpenCode). Then update
   `acme_fixture_identity_service_census` — OpenCode's count drops from 1 to 0
   and the `CLAUDE.md` card gains a `NotLoaded` verdict. ~30 lines.
2. **Fix D-1.** Flip `mcp_opencode.rs:39` to `["opencode.jsonc", "opencode.json"]`
   and add a two-file test asserting `.jsonc` wins. ~5 lines. (Leave
   `opencode_settings.rs:26` alone — it enumerates rather than resolves.)
3. **Fix BS-1.** Give `disabled_project_scope_verdict` the exempt roots: skip
   components whose path runs through `.claude/skills` or `.agents/skills`.
   ~8 lines + the PROBE-14 case as a test.
4. **Fix BS-2.** Rewrite one sentence in `install_matrix.rs:415-418` and assert
   it. ~3 lines.
5. **Fix D-2.** Give OpenCode a `settings` answer: `.opencode` outranks the
   sibling top-level file, `.jsonc` outranks `.json`. Either extend
   `opencode_source_order` with a within-scope rank or record the verdict at
   discovery the way `mark_mode_agent_merges` does. Until then, stop citing
   `#unknowns` for it. (Also: fix the `settingss` typo at `effective.rs:425`.)

### Tier 2 — pin what is already right (11 mutations to kill)

> **Since `3f933432`: the U-09 test below was written** (as two tests, see §6
> R-3), killing M3, M26/M36, M37 and M46; the `.json`/`.jsonc` test (M25) was
> written; M38 fell to the ancestor/project class-alignment test; and
> `fixture_census_oc_ag.rs` gained the `LoadVerdict` assertions it had none of.
> **Still outstanding:** the instruction all-apply test (M28), the truthiness
> test (M32) and the three install-target tests (M11, M12, M27) — four tests,
> not eight.

The cheapest high-value test in the whole report:

```rust
/// U-09: two OpenCode skills of one name have no published winner. The loader
/// parses every SKILL.md at unbounded concurrency and assigns by frontmatter
/// name on completion, so the survivor follows IO timing
/// (cross-tool-matrix.html#unknowns, U-09).
#[test]
fn opencode_says_unknown_when_two_skills_share_a_name() { … assert spec == "U-09" … }
```

That single test kills M3, M26/M36, M37 and M46. Then: a `.json`/`.jsonc` test
(M25), a `CONTEXT.md` project-table test (M38), an instruction all-apply test
(M28), a `project_scope_disabled` truthiness test with a scoped env guard (M32),
and three install-target tests for the user-scope OpenCode roots (M11, M12, M27).
**Eight tests close all eleven genuine surviving mutants.**

Also add to `fixture_census_oc_ag.rs` what it does not have at all: **any**
`LoadVerdict` assertion. The `only-opencode` fixture already produces a
`ConditionallyLoaded` URL entry, two mode-merge `Loaded` verdicts and (today)
two `Unknown` settings cards — pin all five.

> **Done in `3f933432`, and harder than proposed.**
> `opencode_fixture_verdicts_are_exactly_these_three` (`:183`) pins the whole
> verdict set by _equality_ against a four-row list — the `ConditionallyLoaded`
> URL entry and three `Loaded` — rather than asserting each individually.
> It does **not** cover the two `Unknown` settings cards of `D-2`: it calls
> `scan_opencode_project`, the discovery pass, and asserts settings cards claim
> nothing _there_; the `D-2` verdicts are produced later by the effective-state
> pass, which this test never runs. `D-2` remains unpinned in either direction.

### Tier 3 — the silent gaps, prioritised by how wrong they make the UI

1. ~~**The `theme`/`keybinds`/`tui` strip.**~~ **Done in `3f933432`**, exactly as
   proposed: the settings card already has a
   warning mechanism; add a second sentence when those keys are present. Small,
   and it stops the app reporting values the loader discards.
2. **Label a V2-shaped config.** `declared_mcp_servers` already returns the
   schema; surface it as an inference on the card.
3. **`skills.paths`.** The cheapest missing discovery surface, and the only one
   that hides authored capabilities.
4. **The user-scope foreign roots (TW-2).** Make `scan_user_scope` scan every
   owner's user roots and filter by consumer, the way `scan_ancestor` already
   does — then rewrite `home_loads_each_agent_user_scope_without_cross_agent_leakage`
   to assert _consumer_ isolation instead of _owner_ isolation.
5. ~~**`~/.opencode`.**~~ **Done in `3f933432`**, by the first of the two
   options: Either scan it (closing both the discovery gap and the
   install/scan inconsistency in §7) or refuse to install into it. The _rank_
   half remains deferred.
6. Themes, the TUI stack and the ten-layer merge are large and low-risk; write
   them down as deferred rather than leaving them silent.

### Tier 4 — process

Every silent gap in §3.6 would have been a deferral note if the guides had been
walked section by section when they landed. The four deferrals that _do_ carry a
reason are all in modules someone rewrote after the second verification pass —
the habit exists, it just was not applied to the subsystems nobody touched.

---

## 9. Consolidated view across all three audits

### As audited at `d3d1e445`

|                             | Claude + Codex | Copilot + Antigravity | OpenCode + cross-tool | **Total** |
| --------------------------- | -------------: | --------------------: | --------------------: | --------: |
| Claims                      |            146 |                   152 |                   158 |   **456** |
| Implemented                 |             82 |                    90 |                   108 |   **280** |
| Pinned (CONFORMS)           |             70 |                    72 |                    89 |   **231** |
| TESTED-WRONG                |              2 |                     3 |                     3 |     **8** |
| IMPLEMENTED-BEYOND-SPEC     |              0 |                     1 |                     1 |     **2** |
| IMPLEMENTED-AGAINST-SPEC    |              — |                     — |                     2 |     **2** |
| NOT-IMPLEMENTED             |             60 |                    63 |                    47 |   **170** |
| Pinned share of implemented |            85% |                   81% |                   82% |   **83%** |

_(Granularity is comparable but not identical across the three audits — each
extracted claims independently — so read the ratios, not the absolute totals.)_

### Now, at `eecc1fe8`

Twelve rows moved across the three audits, all of them defects or unpinned
implementations becoming CONFORMS. **The 170 unimplemented rows are still
170** — no unbuilt surface was built, and the parked backlog is untouched.

|                             | Claude + Codex | Copilot + Antigravity | OpenCode + cross-tool | **Total** |
| --------------------------- | -------------: | --------------------: | --------------------: | --------: |
| Claims                      |            146 |                   152 |                   158 |   **456** |
| Implemented                 |             82 |                    90 |                   108 |   **280** |
| Pinned (CONFORMS)           |         **72** |                **74** |                **97** |   **243** |
| TESTED-WRONG                |          **0** |                 **2** |                 **1** |     **3** |
| IMPLEMENTED-BEYOND-SPEC     |              0 |                 **0** |                 **0** |     **0** |
| IMPLEMENTED-AGAINST-SPEC    |              — |                     — |                 **1** |     **1** |
| NOT-IMPLEMENTED             |             60 |                    63 |                    47 |   **170** |
| Pinned share of implemented |        **88%** |               **82%** |               **90%** |   **87%** |

The twelve: `C13`, `X11` (Claude/Codex); `A15`, `A27` (Copilot/Antigravity);
`O31`, `O46`, `O26`, `O12`, `O98`, `O37`, `X26`, `X05` (OpenCode/cross-tool).
Two more — `A74` and `C75` — moved _within_ NOT-IMPLEMENTED, from silent gap to
documented deferral, which is why the Copilot/Antigravity NOT-IMPLEMENTED cell
is unchanged.

**The estate-wide picture.** Configr implements roughly 61% of what the five
guides specify and pins 83% of what it implements. That is a genuinely good
ratio. The unimplemented 170 are overwhelmingly whole surfaces that were never
built — managed/enterprise scope, themes, TUI, layered merges, Codex's plugin
stack — not features that drifted. Almost none of them is written down as
deferred.

> **Since `3f933432`: 61% implemented is unchanged; the pinned share is 87%.**
> The 170 are still 170. Two of them — `A74` and `C75` — are now written down as
> deferred, taking the estate's documented-deferral count from 18 (6 + 5 + 7) to 20. The other 150 remain silent.

**The eight TESTED-WRONG rows are the estate's real defect list**, and five of
the eight sit in **one** place: the ancestor instruction walk.

- Claude: `$HOME/CLAUDE.md` is read by Claude and reported nowhere.
- Codex: reads ancestor `AGENTS.md`; Configr asserts it reads none.
- Antigravity: accumulates cwd→repository root; Configr asserts no walk.
- OpenCode ×2 rows: an ancestor `AGENTS.md` fails to suppress the project's own
  `CLAUDE.md`.

The other three are scope-attribution defects: Copilot's skill shape, Copilot's
`~/.agents/skills` reader set, and OpenCode's user scope missing two foreign
skill roots.

`ancestors.rs` / `inherited_memory.rs` / `instructions.rs` / `coding_agent.rs::inherited_memory`
are four files, and they hold five of the seven defects. **That is where a fix
should start, and it should start with a single test matrix over the ancestor
walk — five coding agents × {ceiling, direction, assembly} — rather than five
separate patches.**

> **All five landed in `3f933432`, and as the single design pass this paragraph
> asked for.** `InheritedMemory` moved to
> `toolr-core/src/instruction_sources.rs` beside the per-directory tables, and
> gained the two axes the five guides actually differ on: `InstructionCeiling`
> (where the walk stops) and `ClassRange` (whether a filename class wins per
> directory or across the whole walk). The test matrix exists:
> `the_ancestor_walk_matrix_matches_the_five_guides`
> (`instruction_sources.rs:649`) walks all five coding agents, and
> `the_ancestor_classes_align_with_the_project_table_class_for_class` (`:709`)
> forces the ancestor table and the per-directory table to agree class for
> class. Two caveats on that matrix: `class_range` is asserted only for Codex
> and OpenCode — Claude's and Antigravity's values are behaviourally inert
> today, being single-class, and go unpinned.
>
> **The remaining three are the ones still open:** `C51` (Copilot skill shape),
> `A29` (Copilot's `~/.agents/skills` consumer set naming Antigravity) and
> `O89` (OpenCode's user scope). All three are scope-attribution defects, none
> of them in the four files above.

### Top five things to fix first

> **Items 1–4 all landed in `3f933432`** (item 2's `fixture_census_acme.rs` half
> included — `:294` now asserts the OpenCode `NotLoaded` verdict). **Item 5 has
> not**: no `docs/deferred.md` exists, and the estate's documented-deferral
> count went from 18 to 20 out of 170. It is now the only one of the five still
> open, which makes it the top item rather than the last.

1. **The ancestor-walk cluster (5 TESTED-WRONG rows).** One design pass over
   `inherited_memory`/`instructions`/`ancestors`, driven by the
   `cross-tool-matrix.html#inheritance` table, which is already a
   ready-made test matrix.
2. **The `LoadVerdict` blind spot (all three audits found it independently).**
   Verdicts are what the effective-configuration card _renders_, and across
   ~4,300 lines of census tests they are asserted for Codex and Copilot only.
   Add verdict assertions to `fixture_census_oc_ag.rs` (zero today) and
   `fixture_census_acme.rs`.
3. **U-09** — one test, kills four surviving mutants, protects the guide's
   most emphatic instruction (§6, R-3).
4. **The three IMPLEMENTED-BEYOND-SPEC rows** — Antigravity's `commands/` scan,
   OpenCode's over-broad `DISABLE_PROJECT_CONFIG`, and the "no plugin loader"
   sentence. All three are small, and all three make the app say something
   false with confidence.
5. **Write the deferrals down.** 176 unimplemented claims with ~10 recorded
   reasons between them is the reason this audit had to be run at all. A
   `docs/deferred.md` keyed by guide anchor would turn most of the "silent gap"
   column into a decision someone made.
