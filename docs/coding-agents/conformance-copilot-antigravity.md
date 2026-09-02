# Conformance audit — GitHub Copilot and Google Antigravity

Independent read-only audit of `docs/github-copilot.html` and
`docs/google-antigravity.html` against the Configr implementation, plus
the Copilot and Antigravity rows of `docs/cross-tool-matrix.html`.

- Repo: `/Users/daniel/Work/twiced/toolr/configr`, branch `main`, HEAD `d3d1e445`, clean.
- **No source was edited and no git command mutated anything.** All 31 mutations
  and 2 behavioural probes ran against an `rsync` copy of the workspace in the
  session scratchpad.
- Test suite at HEAD: `cargo test --workspace` → **742 passed, 0 failed**
  (640 `toolr-configr` + 102 `toolr-core`).
- Method note: the scratchpad copy initially failed 4 tests until a `.git`
  marker was created at its root. Three of those four are Antigravity census
  tests — the Antigravity declared-source resolver is genuinely repository-root
  dependent, which is itself confirmation that the resolver is real.

---

## 0. Status since this audit

This audit was written against `d3d1e445`. Five of its findings have since been
addressed. The record of what was wrong is kept; only the claim about the
present tense changes.

**Convention used throughout this file.** A superseded verdict is struck through
and followed by `→ <new class> — fixed in <commit>`. A narrative finding keeps
its original text under a heading prefixed `RESOLVED`, with the fix stated
first. §2 carries the recomputed totals beside the ones as audited. Mutation
tables, probe transcripts and the §7 plan are records of what was true at
`d3d1e445` and are left exactly as written.

| Row   | Claim                                               | As audited               | Now                                   | Fixed in   |
| ----- | --------------------------------------------------- | ------------------------ | ------------------------------------- | ---------- |
| `A15` | Antigravity accumulates cwd→repository root (TW-3)  | TESTED-WRONG             | **CONFORMS**                          | `3f933432` |
| `A27` | `.agents/commands` does not exist (BS-1)            | IMPLEMENTED-BEYOND-SPEC  | **CONFORMS**                          | `3f933432` |
| `A74` | Plugin enablement lives in the shared `config.json` | NOT-IMPLEMENTED (silent) | **NOT-IMPLEMENTED (deferral)**        | `3f933432` |
| `C75` | Folder trust stops the Copilot MCP walk early       | NOT-IMPLEMENTED (silent) | **NOT-IMPLEMENTED (deferral)**        | `3f933432` |
| `C69` | Copilot `{"type":"http", …}` handler shape          | NOT-IMPLEMENTED (silent) | NOT-IMPLEMENTED (silent), **partial** | `3f933432` |

`A74`, `C75` and `C69` are still not implemented as claimed — no code reads
`~/.gemini/config/config.json`, no trust gate stops the Copilot walk, and
`headers` / `allowedEnvVars` / `timeoutSec` are still unread. What changed is
that Configr stopped stating the unknown half as fact: `A74` and `C75` now carry
a written reason and a user-visible caveat, which is what moves them from silent
gap to documented deferral, and `C69`'s HTTP handlers are named by endpoint
instead of being binned as commandless. The consequences those rows record —
"a disabled plugin is shown as enabled", "a hook is a nameless `inline:<n>`
blob" — no longer hold; the gaps themselves do.

**Not fixed, still live:** `TW-1` (`C51`, Copilot skills need no `SKILL.md`) and
`TW-2` (`A29`, Antigravity listed as a `~/.agents/skills` reader). Every
IMPLEMENTED-UNTESTED row in §3.3 except `UT-13` is unchanged, as are all 58
silent gaps except the three above.

---

## 1. Executive verdict

### Q1 — "Did we implement exactly what the docs specify?"

**Partly. Antigravity is the best-implemented coding agent I have seen in this
codebase. Copilot is faithful in its core and has one wrong shape at its most
common capability type.**

Of **152** normative claims extracted from the two guides, **89 are
implemented**, and of those **83 are faithful**. _(Since `3f933432`: **90
implemented, 88 faithful** — 74 pinned, 14 not.)_ But the shortfall is not evenly
spread and it is not only coverage:

- **3 rows are TESTED-WRONG** — green tests actively defending behaviour the
  guides contradict. Two of them are `assert_eq!` on an exact value, so they
  will keep the wrong answer in place until somebody deletes the assertion.
  _(Since `3f933432`: **2**. `A15`/TW-3 is fixed; `C51`/TW-1 and `A29`/TW-2
  stand.)_
- **1 row is IMPLEMENTED-BEYOND-SPEC** — Configr reports an Antigravity
  capability the guide states does not exist, with no caveat and no verdict,
  in a module that carefully attaches `LoadVerdict::Unknown` to a _better_-evidenced
  neighbouring surface. That inversion is the single most quotable defect here.
  _(Since `3f933432`: **0**. The row was deleted, not softened — see §3.2.)_
- **63 claims are not implemented at all**, 58 of them silently. As with the
  Claude/Codex sibling, most are whole unbuilt surfaces (Copilot's LSP,
  extensions, marketplaces, policy hooks, folder trust; Antigravity's sidecars,
  settings files, plugin enablement), not drifted features. _(Since `3f933432`:
  still 63 unimplemented, but **56 silent** — `A74` and `C75` gained a written
  reason and a user-visible caveat.)_

Where Antigravity _is_ built, it is genuinely exemplary. Every `U-` number that
touches it — U-01 (global skill root), U-02 (opaque literals), U-03 (workflow
path) — is carried into the code with the right epistemic status: U-01 reads the
config tree first and labels the private tree "private CLI app-data probe";
U-02's five undocumented literals are pinned _not_ to be scanned; U-03 scans the
one published lead and stamps every card `LoadVerdict::Unknown`. The
`GLOBAL_INFERRED_NOTE` machinery even marks `config/rules` and `config/agents`
as _inferred_ subpaths rather than stated ones. That is the correct direction to
err in and it is rare.

### Q2 — "Did we test that it actually works as expected?"

**Yes for Antigravity. Mostly for Copilot, with one systematic blind spot that
matters: `LoadVerdict` values are not pinned.**

- **72 of 89 implemented claims (81%) are genuinely pinned.** _(Since
  `3f933432`: **74 of 90, 82%.**)_
- I mutation-tested **31** claims. **24 were caught**, 7 survived. _(M31 is now
  the guide's answer rather than a mutation; the 7 survivors are unchanged.)_
- The `example/` census assertions are real: `assert_eq!(components.len(), 25)`,
  exact sorted name sets, exact descriptions verbatim including the migration
  note. Deleting the recursive hook glob breaks 6 tests. Dropping one of the four
  Antigravity root spellings breaks 4.

**The blind spot:** three of the seven surviving mutations are the same defect
class — _the description note is asserted, the `LoadVerdict` beside it is not._

| Surface                                                | Note asserted?            | Verdict asserted?     |
| ------------------------------------------------------ | ------------------------- | --------------------- |
| Copilot `prompts/*.prompt.md` → `NotLoaded`            | yes (census, verbatim)    | **no** (M10 survived) |
| Antigravity workspace `mcp_config.json` → `Unknown`    | yes (unit test, verbatim) | **no** (M22 survived) |
| Antigravity `unresolved_precedence` citation for `mcp` | —                         | **no** (M21 survived) |

The verdicts are what an effective-configuration card renders. A future refactor
can flip `NotLoaded` to `Loaded` on Copilot's proven-negative prompt files and
the suite stays green — the exact failure mode the owner asked me to hunt for.

The other blind spot is Copilot's **entire ancestor capability walk**. The table
entry is pinned (`only_three_agents_walk_upwards_for_capabilities` asserts
Copilot is in the list) but neither its `types` nor its `ceiling` is: dropping
`"agent"` from Copilot's ancestor tier (M03) and widening its ceiling past the
repository root (M04) both leave 742 green tests. `collect_inherited_components`
is called with `CodingAgent::Copilot` **zero times** in the entire test suite.

### Bottom line

Antigravity conforms well and is well pinned — say so plainly. Copilot's
discovery, provenance, settings tiers, MCP walk and `.claude` cross-read are
faithful and well pinned; its skill _shape_, its ancestor tier and its
proven-negative verdicts are not.

---

## 2. Counts

### As audited at `d3d1e445`

| Class                                                                            | Copilot | Antigravity |   Total |
| -------------------------------------------------------------------------------- | ------: | ----------: | ------: |
| **CONFORMS** — implemented as specified _and_ a test would fail on regression    |      33 |          39 |  **72** |
| **IMPLEMENTED-UNTESTED** — code is right, nothing pins it                        |       8 |           6 |  **14** |
| **TESTED-WRONG** — green test pinning behaviour the guide contradicts            |       2 |           1 |   **3** |
| **IMPLEMENTED-BEYOND-SPEC** — Configr asserts what the guide withholds or denies |       0 |           1 |   **1** |
| **NOT-IMPLEMENTED — documented deferral**                                        |       3 |           2 |   **5** |
| **NOT-IMPLEMENTED — silent gap**                                                 |      29 |          29 |  **58** |
| **N/A** — session/runtime surface a file browser cannot have                     |       4 |           5 |   **9** |
| **Total claims**                                                                 |      79 |          73 | **152** |

Implemented = CONFORMS + IMPLEMENTED-UNTESTED + TESTED-WRONG + BEYOND-SPEC = **90**
(89 counting the beyond-spec row as a defect rather than an implementation).
Pinned share of implemented: **72 / 89 = 81%**.

### Now, at `eecc1fe8`

Four rows moved. The 63 NOT-IMPLEMENTED claims are still 63 — two of them
simply stopped being silent.

| Class                          | Copilot | Antigravity |   Total | Moved                                  |
| ------------------------------ | ------: | ----------: | ------: | -------------------------------------- |
| **CONFORMS**                   |      33 |      **41** |  **74** | `+A15` (from TW-3), `+A27` (from BS-1) |
| **IMPLEMENTED-UNTESTED**       |       8 |           6 |  **14** | —                                      |
| **TESTED-WRONG**               |       2 |       **0** |   **2** | `−A15`                                 |
| **IMPLEMENTED-BEYOND-SPEC**    |       0 |       **0** |   **0** | `−A27`                                 |
| **NOT-IMPLEMENTED — deferral** |   **4** |       **3** |   **7** | `+C75`, `+A74`                         |
| **NOT-IMPLEMENTED — silent**   |  **28** |      **28** |  **56** | `−C75`, `−A74`                         |
| **N/A**                        |       4 |           5 |   **9** | —                                      |
| **Total claims**               |      79 |          73 | **152** |                                        |

Implemented = **90**. Pinned share of implemented: **74 / 90 = 82%** (81% as
audited).

**A counting note, recorded rather than corrected.** The published table above
does not sum: the Antigravity column adds to 83 against a stated 73, and the
per-class column adds to 162 against a stated 152 — one cell out, almost
certainly the Antigravity "silent gap" figure, which is the same 29 as
Copilot's. The claim matrix in §4 carries 102 Copilot rows and 98 Antigravity
rows, which the section footnotes say merge to 79 and 73 "distinct claims"
without enumerating the merge, so the totals cannot be re-derived from the rows
either. This predates every fix listed in §0, so the published figures are left
as they are and only the four moved cells above are changed. Anyone re-running
this audit should re-derive the whole table rather than trust either version of
the arithmetic.

---

## 3. Findings ranked by risk

### 3.1 TESTED-WRONG (3) — the highest-value rows in this report

---

#### TW-1 · Copilot skills are not required to be a `SKILL.md` directory, and a test pins the wrong value

**Guide** (`github-copilot.html#skills`, class **D/S**):

> "**Shape — D/S.** A skill is a directory containing `SKILL.md`. Frontmatter is
> `name` (required, lowercase-hyphenated) and `description` (required)…"

and `#installing`, Skill row: _"Directory containing SKILL.md; required name
(lowercase-hyphenated) and description"_.

**Code** — `src-tauri/crates/toolr-core/src/coding_agent.rs:341-346`:

```rust
pub fn skills_require_skill_md(&self) -> bool {
    match self {
        CodingAgent::Claude | CodingAgent::Antigravity | CodingAgent::Codex => true,
        CodingAgent::Copilot | CodingAgent::Opencode => false,
    }
}
```

The doc comment above it says _"Copilot and OpenCode keep the behavior their own
scanners implement"_ — i.e. the value was never decided against the guide, it was
inherited from the pre-existing scanner. Copilot's own scanner
(`src-tauri/crates/toolr-configr/src/scanner/copilot.rs:268`) accepts any folder
with at least one file:

```rust
let skill = collect_skill_folder(&skill_path);
if skill.files.is_empty() {
    continue;
}
```

**The test that pins it** —
`src-tauri/crates/toolr-core/src/coding_agent.rs:1084-1087`:

```rust
fn antigravity_skills_must_be_folders_with_a_skill_md() {
    assert!(CodingAgent::Antigravity.skills_require_skill_md());
    assert!(!CodingAgent::Copilot.skills_require_skill_md());   // <-- pins the wrong half
}
```

**Behavioural proof (probe P1, scratchpad).** Given
`.github/skills/no-skill-md/notes.md` (no `SKILL.md`) and
`.github/skills/no-frontmatter/SKILL.md` (body only, no frontmatter),
`scan_copilot_dir` returns:

```
[("skill", "no-frontmatter", None), ("skill", "no-skill-md", None)]
```

Two green cards. Copilot CLI loads neither. **Mutation M23** (flip the value to
`true`) fails exactly one test — the assertion above — confirming nothing else
depends on the wrong value.

**Why it matters.** This is the most common capability type in the app, and the
failure is a _false positive_: the browser shows a live Copilot skill for a
folder of notes. Antigravity's scanner does this correctly and even flags
missing `name`/`description` (`note_skill_frontmatter`,
`scanner/antigravity.rs:180-208`); Copilot has no equivalent.

---

#### TW-2 · Antigravity is listed as a reader of `~/.agents/skills`, which its guide denies at binary/documentation strength

**Guide** (`google-antigravity.html#skills`, class **D**):

> "Antigravity does not read `~/.agents/skills`. Codex, Copilot and OpenCode all
> consume that user-scope directory; Antigravity's user scope is `~/.gemini/`,
> and no first-party source gives it a `~/.agents` reader. **A bounded
> negative**, scoped to this version row."

`cross-tool-matrix.html` repeats it: _"`~/.agents/skills` | Not read by
Antigravity, although Codex, Copilot and OpenCode all read it. | D"_.

**Code** — `src-tauri/crates/toolr-configr/src/scanner/copilot.rs:426`, inside
`scan_personal_agents_skills` (which scans `$HOME/.agents/skills`):

```rust
skill.consumers = surface_consumer_ids(SharedSurface::AgentsSkills);
```

`SharedSurface::AgentsSkills` is documented at `coding_agent.rs:849` as
**"`.agents/skills/` in a **project root**"** and its consumer list
(`coding_agent.rs:886-891`) is `[Codex, Copilot, Antigravity, Opencode]`. Reusing
a _project_-scope surface constant for the _user_-scope directory imports
Antigravity as a reader of a path its own guide says it never reads.

**The test that pins it** —
`src-tauri/crates/toolr-configr/src/scanner/copilot.rs:875-879`:

```rust
assert_eq!(
    triage.consumers,
    ["codex", "copilot", "antigravity", "opencode"],
    "the .agents surface is shared, and the card must keep saying so"
);
```

The `triage` skill in that fixture is written to `home/.agents/skills/triage` —
user scope. The assertion is exact, so the wrong consumer set cannot drift out.

**Why it matters.** Provenance is the product. A user reading that card believes
editing `~/.agents/skills/triage` affects `agy`. It does not. The correct
consumer set for the _user_-scope `.agents/skills` is
`["codex", "copilot", "opencode"]`.

---

#### RESOLVED — TW-3 · Antigravity's ancestor instruction walk is unimplemented, and two tests defend its absence

**Fixed in `3f933432`.** `CodingAgent::Antigravity` now returns
`ANTIGRAVITY_ANCESTORS` (`toolr-core/src/instruction_sources.rs:474-479`):
one class `["AGENTS.md", "GEMINI.md"]`, ceiling
`InstructionCeiling::RepositoryRoot` (inclusive), class range
`ClassRange::Walk`. Both defending tests were deleted —
`only_claude_and_opencode_read_ancestors` and
`agents_that_never_look_upwards_inherit_nothing` no longer exist anywhere in the
tree. The walk is pinned by
`antigravity_accumulates_both_filenames_up_to_the_repository_root`
(`inherited_memory.rs:914`), which asserts the exact triple list
`[("~/Work/repo/apps","GEMINI.md",true), ("~/Work/repo","AGENTS.md",true),
("~/Work/repo","GEMINI.md",true)]` with a `~/Work/AGENTS.md` planted above the
repository that must not appear; the table is pinned by
`the_ancestor_walk_matrix_matches_the_five_guides`
(`instruction_sources.rs:649`), and the negative by
`only_copilot_reads_nothing_from_an_ancestor_directory`
(`inherited_memory.rs:800`).

**One clause of the claim is still unpinned.** "Deduplicate by resolved path"
exists only as prose in the `ANTIGRAVITY_ANCESTORS` doc comment — there is no
`canonicalize` anywhere in the instruction walk. The walk visits each ancestor
once, so duplicates cannot arise from the modelled shape, but a symlinked
ancestor chain is not handled and no test covers it.

**And §6's conditional has been answered.** §6 note 1 said row `A22` must be
re-examined "if the walk in TW-3 is ever implemented". It has been, and `A22` is
unaffected: `ANTIGRAVITY_ANCESTORS.rules_dir` is `None` by design (the doc
comment explains that `.agents/rules/` are progressive-disclosure capabilities
with their own cards), and Antigravity is still absent from
`ancestor_capabilities` — `only_three_agents_walk_upwards_for_capabilities`
(`coding_agent.rs:1206`) asserts `["claude", "copilot", "opencode"]`. The
same-level rule collision the guide's `U` covers still cannot be produced.

The finding as written is kept below, unchanged.

**Guide** (`google-antigravity.html#instructions`, class **S** — from the
shipped manual, not the website):

> "Relevant instruction and rule files accumulate from cwd, or from the directory
> of the file being worked on, **upward to the repository root** — the manual's
> own words, 'the folder containing `.git`' — and stop there. They are then
> **deduplicated by resolved file path**…"

`#precedence-table` repeats it, and `cross-tool-matrix.html:287` states
_"Antigravity accumulates cwd→repository root with resolved-path
de-duplication"_.

**Code** — `src-tauri/crates/toolr-core/src/coding_agent.rs:730`:

```rust
CodingAgent::Codex | CodingAgent::Copilot | CodingAgent::Antigravity => None,
```

The doc comment justifying it (`coding_agent.rs:707-709`) cites
`antigravity.google/docs/rules-workflows` and says _"whether it reads ancestors
is not documented either way, so nothing is claimed here"_ — a first-pass,
website-derived reason that the guide's own second pass superseded with a
manual-strength statement. Antigravity's ceiling is the same shape as OpenCode's
(`stop_at_repository_root: true`), which _is_ implemented.

**The two tests that pin it:**

1. `src-tauri/crates/toolr-core/src/coding_agent.rs:1195-1203`
   ```rust
   fn only_claude_and_opencode_read_ancestors() {
       assert_eq!(inheriting, ["claude", "opencode"]);
   }
   ```
2. `src-tauri/crates/toolr-configr/src/inherited_memory.rs:706-729`
   ```rust
   fn agents_that_never_look_upwards_inherit_nothing() {
       for agent in [Codex, Copilot, Antigravity] {
           assert!(collect_inherited_instruction_files(&project, agent, Some(&home)).is_empty(),
                   "{} caps its lookup at the project or repository root", agent.as_str());
       }
   }
   ```
   The fixture even plants `Work/acme/AGENTS.md` above a project at
   `Work/acme/api` — exactly the file the guide says Antigravity reads.

**Mutation M31** (give Antigravity `InheritedMemory { classes: [["AGENTS.md",
"GEMINI.md"]], stop_at_repository_root: true }`) fails **precisely those two
tests and nothing else** — proof that implementing the guide requires deleting
assertions, which is the definition of a test defending the wrong behaviour.

_Note on scope:_ Copilot's `None` in the same match arm is **correct** — Copilot
scopes instructions to the repository `.github` "but not intermediate
directories" and advertises nested `AGENTS.md` below cwd, never above. Only the
Antigravity arm is wrong.

---

### 3.2 IMPLEMENTED-BEYOND-SPEC (1)

---

#### RESOLVED — BS-1 · Configr reports `.agents/commands/*.md` as an Antigravity command capability; the guide says the directory does not exist

**Fixed in `3f933432`, by the one-line gate proposed at the end of this
section.** `scanner/claude_dir.rs:166` now computes
`let scans_commands_dir = agent.is_none_or(|agent| agent.commands_dir() == "commands");`
and skips the `("commands", "command")` entry when it is false (lines 179-181),
mirroring the existing `hooks` gate. Only Claude and OpenCode answer `"commands"`
(`coding_agent.rs:235-242`), so the entry disappears from Antigravity's project
root, its plugin bundles and both user roots. The row was **deleted rather than
softened** — no `LoadVerdict::Unknown` is emitted for it, because "the directory
does not exist" is stronger evidence than an unknown. Pinned by
`an_agents_commands_directory_is_not_an_antigravity_capability`
(`scanner/antigravity.rs:702`), which asserts `find(&components, "command",
"ship").is_none()` and guards the table with
`assert_eq!(CodingAgent::Antigravity.commands_dir(), "skills")`.

The finding as written is kept below, unchanged.

**Guide** (`google-antigravity.html#skills`):

> "Skills are also the CLI's slash-command mechanism. **There is no native
> `.agents/commands` directory and none is documented**; skills create the slash
> commands instead."

and `#installing`:

> "**Command** | Does not exist as a directory. Skills are the slash-command
> mechanism…"

`CodingAgent::commands_dir()` correctly answers `"skills"` for Antigravity
(`coding_agent.rs:261`). But `scan_antigravity_dir`
(`scanner/antigravity.rs:151`) delegates to the shared
`claude_dir::scan_capability_dirs`, whose directory list is **hard-coded and not
per-agent** (`scanner/claude_dir.rs:163-168`):

```rust
let component_dirs = [
    ("skills", "skill"),
    ("commands", "command"),
    ("hooks", "hook"),
    ("agents", "agent"),
];
```

`hooks` is correctly gated by `hooks_dir_is_registry()`; `commands` is gated by
nothing.

**Behavioural proof (probe P2, scratchpad).** Given
`.agents/commands/ship.md`, `scan_antigravity_project` returns:

```
[("command", "ship", Some("Ship it"))]
```

No note, no `LoadVerdict`, no caveat — a plain green capability card.

**Why this is the worst inversion in the report.** The _same module_ attaches
`LoadVerdict::Unknown` to `.agents/workflows/` (`scanner/antigravity.rs:296-302`)
because the capability is proven in the binary and only the _path_ is
unpublished. `.agents/commands/` has strictly weaker evidence — the guide says
the directory does not exist at all — and gets a **stronger** claim. A user
migrating from Claude Code who copies `.claude/commands/` to `.agents/commands/`
is told it works.

The fix is one line: gate `("commands", "command")` on
`agent.is_none_or(|a| a.commands_dir() == "commands")`, mirroring the existing
`scans_hooks_dir` gate. No test currently covers this in either direction.

---

### 3.3 IMPLEMENTED-UNTESTED, ranked (14)

| #     | Claim                                                                                                                                            | Where                                                     | Why unpinned                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UT-1  | Copilot `prompts/*.prompt.md` carries `LoadVerdict::NotLoaded` (a **proven negative** at binary strength)                                        | `scanner/copilot.rs:104-110`                              | **M10 survived**: flipping to `LoadVerdict::Loaded` leaves 742 green. Only the description note is asserted.                                                                                                                                                                                                                                                                      |
| UT-2  | Antigravity workspace `.agents/mcp_config.json` carries `LoadVerdict::Unknown` ("documented-only, not package-confirmed")                        | `scanner/antigravity_mcp.rs:133-141`                      | **M22 survived**: deleting the whole `Unknown` branch leaves 742 green.                                                                                                                                                                                                                                                                                                           |
| UT-3  | Copilot ancestor tier contributes **agents** as well as skills                                                                                   | `coding_agent.rs:383-387`                                 | **M03 survived**: `types: &["skill"]` leaves 742 green.                                                                                                                                                                                                                                                                                                                           |
| UT-4  | Copilot's ancestor walk stops at the **repository** root                                                                                         | `coding_agent.rs:385`                                     | **M04 survived**: widening to `HomeOrWidenedRepository` leaves 742 green.                                                                                                                                                                                                                                                                                                         |
| UT-5  | Antigravity's category order is `Project → User → Plugin`                                                                                        | `precedence_tables.rs:151-154`                            | **M20 survived**: reversing to `Plugin → User → Project` leaves 742 green.                                                                                                                                                                                                                                                                                                        |
| UT-6  | Antigravity `mcp` unknown cites its own guide's register                                                                                         | `coding_agent.rs:574`                                     | **M21 survived**: deleting the arm leaves 742 green (falls back to a generic message).                                                                                                                                                                                                                                                                                            |
| UT-7  | The 14 documented Copilot repository settings keys                                                                                               | `scanner/copilot_settings.rs:43-58`                       | **M11 survived**: any key not set by a fixture can be deleted invisibly. Only `firewall`/`extensions` (the two the fixture sets) are behaviourally pinned.                                                                                                                                                                                                                        |
| UT-8  | `collect_inherited_components` for Copilot at all                                                                                                | `scanner/inherited.rs:176-208`                            | Called with `CodingAgent::Copilot` **zero times** in the suite (19 call sites: 17 Claude, 1 OpenCode, 1 Claude).                                                                                                                                                                                                                                                                  |
| UT-9  | Copilot reads `.claude/settings.local.json` **project-relative** (vs Claude's main-checkout canonicalization) — an explicit cross-read asymmetry | `scanner/claude_dir.rs:791-805`                           | No worktree test exercises the divergence for Copilot.                                                                                                                                                                                                                                                                                                                            |
| UT-10 | Copilot MCP git-root resolution handles **linked worktrees**                                                                                     | `mcp_copilot.rs:139-152` via `ancestors::repository_root` | `repository_root` accepts a `.git` _file_, so it works; no Copilot-scoped worktree test exists.                                                                                                                                                                                                                                                                                   |
| UT-11 | Antigravity global (`~/.gemini/config`) **workflows** scope                                                                                      | `scanner/antigravity.rs:153` (runs for both scopes)       | Only the project-scope workflow card is asserted.                                                                                                                                                                                                                                                                                                                                 |
| UT-12 | Antigravity `plugin.json` `name` defaults to the directory name (shipped manual wins over the stricter CLI page)                                 | `scanner/antigravity.rs:421-486`                          | Fixtures always supply `name`.                                                                                                                                                                                                                                                                                                                                                    |
| UT-13 | A plugin found in the private `~/.gemini/antigravity-cli/plugins` tree is "present, effect unknown"                                              | `scanner/antigravity_user.rs:120-129`                     | ~~Carries a surface **label** but no `LoadVerdict::Unknown`~~ → since `3f933432` it does carry one, because `scan_plugin_bundle` (`antigravity.rs:500-510`) stamps every bundle — but the `why` cites plugin _enablement_, not the private-tree uncertainty this row is about, and `antigravity_user.rs` still contains no `effective` assertion. **Still IMPLEMENTED-UNTESTED.** |
| UT-14 | Copilot `$COPILOT_HOME` relocation is honoured by the **scan**, not just `user_config_dir()`                                                     | `scanner/copilot.rs:374`, `mcp/config_paths.rs:87-90`     | The resolver is pinned; the scan path under a relocated home is not (the scanner's own test comment concedes this).                                                                                                                                                                                                                                                               |

---

### 3.4 NOT-IMPLEMENTED — documented deferrals (5 → 7)

These have a stated reason in a code comment. They are the good kind of gap.

> **Since `3f933432`, two more joined them**, and both go further than a comment
> — the caveat reaches the card:
>
> | Claim                                            | Deferral reason, verbatim location                                                                                                                                                                                                                                               |
> | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Antigravity **plugin enablement** (`A74`)        | `scanner/antigravity.rs:60-68` — the key shape inside `~/.gemini/config/config.json` is unpublished, so the switch cannot be read. `PLUGIN_ENABLEMENT_NOTE` is stamped as `LoadVerdict::Unknown` on the bundle **and everything it contributes** (`:500-510`), cited `#plugins`. |
> | Copilot **folder trust** on the MCP walk (`C75`) | `mcp_copilot.rs:38-49` — trust is a dialog answer with no first-party file, so a reached ancestor cannot be told from an unreached one. `FOLDER_TRUST_NOTE` is appended to the description of every server declared above the working directory (`:186-200`).                    |

| Claim                                                                               | Deferral reason, verbatim location                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copilot's **remote organization / enterprise agent tier** (7th in the ordered list) | `precedence_tables.rs:108-118`: _"it has no local path to scan, so it is absent here rather than invented"_. Partially short of the guide, which says _"do not report the capability as absent"_ — Configr's UI never mentions the tier at all. |
| Copilot **ODR** (Windows registry MCP registry) is not modelled as a file source    | Guide's own instruction (`U-15`: _"Do not model ODR servers as a file source"_). Honoured by omission.                                                                                                                                          |
| Copilot **hosted Memory** / `session-state` records are not scanned or parsed       | `U-15`. Honoured by omission; `mcp_copilot.rs:1-20` and the scope tables note the boundary.                                                                                                                                                     |
| Antigravity `~/.gemini/skills` (predecessor Gemini CLI) is not scanned              | `scanner/antigravity_user.rs:35-39`, citing `#global-root` _"The legacy Gemini path is not a live candidate"_.                                                                                                                                  |
| Antigravity `~/.gemini/settings.json` is not touched                                | `scanner/antigravity_user.rs:35`: _"belongs to the Gemini CLI"_. Correct — but see SG-A11 for the CLI's **own** settings file, which is a different silent gap.                                                                                 |

---

### 3.5 NOT-IMPLEMENTED — silent gaps (58 → 56)

Nothing in the codebase records why these are missing.

> **Since `3f933432`:** Copilot's **Trust** row and Antigravity's **Plugin
> enablement** row are no longer silent — see §3.4. Both are still unimplemented;
> both now carry a written reason and a user-visible caveat. Copilot's **Hooks**
> row is also partly overtaken: the `http` handler shape no longer "falls into
> the synthetic `inline:<n>` group" — `handler_key` (`copilot_hooks.rs:52-58`)
> keys it `http:<url>` and the card is named after the endpoint host
> (`:98-113`). `headers`, `allowedEnvVars` and `timeoutSec` are still unread and
> still silent.

**Copilot (29).** Grouped by surface, with the guide section each comes from:

| Group            | Missing                                                                                                                                                                                                                                                                                                                                                                                                 | Section             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Managed / policy | `/etc/github-copilot/policy.d/*.json` hook tier (loaded **first**, ownership-gated, immune to `disableAllHooks`); MDM policy layer                                                                                                                                                                                                                                                                      | `#hooks`, `#scopes` |
| Trust            | the `folderTrustIsTrusted` gate that **stops the MCP walk early**, and `COPILOT_ALLOW_ALL`; the `trustedFolders` setting behind it — since `3f933432` the walk is unchanged but ancestor servers carry the caveat; **moved to §3.4**                                                                                                                                                                    | `#mcp`, `#settings` |
| LSP              | `.github/lsp.json`, `~/.copilot/lsp-config.json`, and their ranking (`project > plugin > user`)                                                                                                                                                                                                                                                                                                         | `#plugins`          |
| Extensions       | `.github/extensions/<name>/`, `~/.copilot/extensions/<name>/`, `extension.mjs/.cjs/.js`, `extensions.mode`                                                                                                                                                                                                                                                                                              | `#plugins`          |
| Marketplaces     | the four marketplace catalog paths; the two default marketplaces; `extraKnownMarketplaces` opt-in                                                                                                                                                                                                                                                                                                       | `#plugins`          |
| Plugin contents  | a plugin bundling `agents/`, `skills/`, `commands/`, `hooks/` is carded as a bare plugin; only its `mcpServers` are enumerated                                                                                                                                                                                                                                                                          | `#plugins`          |
| Skills           | `COPILOT_SKILLS_DIRS` + `skillDirectories` (custom tier 8); built-in skills (`builtin-skills/`, tier `builtin`); `SKILL_CHAR_BUDGET`                                                                                                                                                                                                                                                                    | `#skills`           |
| Instructions     | `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`; nested `AGENTS.md` **below** cwd advertised in a table; `@path` imports; malformed-`applyTo` warning; the `InstructionSource` descriptor taxonomy; `--no-custom-instructions` / `/instructions` toggles                                                                                                                                                             | `#instructions`     |
| Agents           | frontmatter beyond `name`/`description` (`tools`, `model`, `disable-model-invocation`, `user-invocable`, `reasoning-effort`, `deferred-tool-loading`, `strict-tools-list`); `hooks` in agent frontmatter; `subagents.agents.<name>` settings; built-in agents (`/review`, `/rubber-duck`)                                                                                                               | `#agents`           |
| Hooks            | the `{"type":"http", url, headers, allowedEnvVars, timeoutSec}` handler shape (~~falls into the synthetic `inline:<n>` group, unlabelled~~ → since `3f933432` keyed `http:<url>` and named by endpoint host; `headers`/`allowedEnvVars`/`timeoutSec` still unread); PascalCase Claude-format matchers and the VS Code shape (`{matcher, hooks:[…]}` nesting is not descended); `cwd`/`env`/`timeoutSec` | `#hooks`            |
| Settings         | per-key Union / Tighten-only / Replaced semantics for the 14 repository keys; the `sandbox` subsystem; `allowedUrls`/`deniedUrls`; `statusLine` (user-tier only)                                                                                                                                                                                                                                        | `#settings`         |
| Skills↔commands  | the documented relation _"skills override commands"_ for `.claude/commands`                                                                                                                                                                                                                                                                                                                             | `#negatives`        |

**Antigravity (29).**

| Group                | Missing                                                                                                                                                                                                                                                                                 | Section                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Settings             | `~/.gemini/antigravity-cli/settings.json` (the CLI settings file) and `keybindings.json`; the 15 documented settings keys + `statusLine` + `copyOnSelect`; the three `AGY_*` env overrides                                                                                              | `#settings`                              |
| Plugin enablement    | the shared `~/.gemini/config/config.json` `userSettings` object, **which is where plugin enablement lives** — ~~a disabled plugin is shown as if enabled~~ → since `3f933432` the file is still unread, but the bundle and its contents carry `LoadVerdict::Unknown`; **moved to §3.4** | `#plugins`, `#settings`                  |
| Sidecars             | `<config dir>/sidecars/<id>/sidecar.json`, plugin `sidecars/`, the `command`/`builtin` oneof, `restart_policy`, cron payloads                                                                                                                                                           | `#sidecars`                              |
| Built-ins            | `~/.gemini/antigravity-cli/builtin/skills/` — the three bundled skills that occupy tier 4 of the category order                                                                                                                                                                         | `#roots`                                 |
| Declared-source tier | declared sources are their own **tier** (2nd at workspace, **last** at global); Configr gives them only a description note, so a declared workspace skill ranks identically to a discovered one                                                                                         | `#declared-sources`, `#precedence-table` |
| Category order       | the five-tier order is collapsed to three (`Project, User, Plugin`): the **workspace-declared** and **built-in** tiers have no `CapabilitySource`                                                                                                                                       | `#precedence-table`                      |
| Agents               | frontmatter beyond `name`/`description` (`tools`, `mainAgent`, `subagent`, `model`, `commandExecutionPolicy`, `mcpServers`, `skills`, `plugins`, `hidden`, `inheritMcp`); built-in subagents (`research`/`browser`/`self`) and the `/teamwork-preview` roster                           | `#agents`                                |
| Hooks                | handler `timeout` (default 30s); the `CORTEX_STEP_TYPE_` tool-name derivation the matcher must match; `sh -c`/`cmd /c` invocation; the 4/5-value decision enum, `injectSteps`, `terminationBehavior`, `overwrite`                                                                       | `#hooks`                                 |
| MCP                  | accepted keys `cwd`, `headers`, `oauth`, `authProviderType`, `timeoutSeconds`, the per-tool `tools` map (`background`/`eager`)                                                                                                                                                          | `#mcp`                                   |
| Ignore               | `.antigravityignore` (the guide permits surfacing it as an unpublished-contract name)                                                                                                                                                                                                   | `#cross-tool`                            |

---

## 4. The claim matrix

Evidence classes are the guides' own (`D`, `S`, `O`, `I`, `U`, `D≠S`).

### 4.1 GitHub Copilot (79 claims)

#### `#negatives` / `#products` — proven negatives

| #   | Claim                                                                                                        | Anchor                      | Ev  | Impl?          | Where (`file:line`)               | Pinned? | Test                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------- | --- | -------------- | --------------------------------- | ------- | ------------------------------------------------------------------------ |
| C01 | `.github/prompts/*.prompt.md` is not a CLI root; label it, never assert a CLI capability                     | `#negatives`                | S   | yes            | `scanner/copilot.rs:29,64-113`    | yes     | `copilot_fixture_census_counts_names_and_triggers` — **CONFORMS**        |
| C02 | …and the card must carry `LoadVerdict::NotLoaded`                                                            | `#negatives`                | S   | yes            | `scanner/copilot.rs:104-110`      | **no**  | M10 survived — **IMPLEMENTED-UNTESTED**                                  |
| C03 | `.vscode/mcp.json` support **removed**; surface as a migration hint, never silence, never a supported source | `#negatives`, `#mcp`        | S   | yes            | `mcp_copilot.rs:69-70,353-362`    | yes     | census (verbatim description) + M07 — **CONFORMS**                       |
| C04 | `.agents/agents`, `.agents/commands`, `.agents/rules` are not Copilot roots                                  | `#negatives`                | S   | yes            | `coding_agent.rs:849-852,886-891` | yes     | `project_agents_skills_carry_all_four_consumers` — **CONFORMS**          |
| C05 | `.claude/commands/*.md` is a documented CLI slash-command tier                                               | `#negatives`, `#cross-read` | D   | yes            | `coding_agent.rs:863-869,903-905` | yes     | M09 → 3 tests incl. acme census — **CONFORMS**                           |
| C06 | …and skills **override** commands                                                                            | `#negatives`                | D   | no             | —                                 | —       | **NOT-IMPLEMENTED (silent)**                                             |
| C07 | `.claude/CLAUDE.md` is a documented CLI read location                                                        | `#cross-read`               | D   | yes            | `instruction_sources.rs:240-243`  | yes     | `copilot_cross_reads_both_documented_claude_md_locations` — **CONFORMS** |
| C08 | `.github/commands` / `.agents/commands` are not slash-command roots                                          | `#negatives`                | D   | yes (omission) | —                                 | yes     | census exact totals — **CONFORMS**                                       |
| C09 | An unread path is unsupported, not deleted                                                                   | `#negatives`                | —   | —              | —                                 | —       | **N/A** (design principle)                                               |

#### `#scopes`

| #   | Claim                                                                                                                                                                                                                             | Anchor                   | Ev  | Impl?          | Where                                                                                     | Pinned? | Test                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --- | -------------- | ----------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| C10 | `$COPILOT_HOME` replaces `~/.copilot` entirely; an empty value is ignored                                                                                                                                                         | `#scopes`                | S   | yes            | `coding_agent.rs:769-779`                                                                 | yes     | `copilot_user_config_dir_honors_copilot_home_and_defaults_to_dot_copilot` — **CONFORMS**               |
| C11 | `~/.config/github-copilot` is auth state, never configuration                                                                                                                                                                     | `#scopes`                | D   | yes            | `scanner/utils.rs:16`, `coding_agent.rs:821`                                              | yes     | same test (`assert!(!ends_with(".config/github-copilot"))`) — **CONFORMS**                             |
| C12 | User-authored set: `settings.json`, `copilot-instructions.md`, `instructions/`, `agents/`, `skills/`, `hooks/`, `mcp-config.json`                                                                                                 | `#scopes`                | D/S | yes            | `scanner/copilot.rs:374-388`                                                              | yes     | `user_scan_covers_copilot_home_surfaces_with_user_source` — **CONFORMS**                               |
| C13 | …plus `lsp-config.json` and `extensions/`                                                                                                                                                                                         | `#scopes`                | D/S | no             | —                                                                                         | —       | **NOT-IMPLEMENTED (silent)**                                                                           |
| C14 | Legacy `$COPILOT_HOME/config.json` is a **settings layer**, not generated state                                                                                                                                                   | `#scopes`, `#settings`   | D≠S | yes            | `scanner/copilot_settings.rs:87-101`                                                      | yes     | `legacy_config_json_is_user_settings_and_shadows_settings_json` — **CONFORMS**                         |
| C15 | …and its values **shadow the entire matching subtree** of `settings.json`                                                                                                                                                         | `#settings`              | S   | yes            | `copilot_settings.rs:104-105,143-162` (`ConditionallyLoaded`)                             | yes     | same test (asserts the note appears **and disappears**) — **CONFORMS**                                 |
| C16 | Generated `$COPILOT_HOME` state is opaque (`permissions-config.json`, `session-state/`, `session-store.db`, `logs/`, …)                                                                                                           | `#scopes`                | D   | yes (omission) | `scanner/copilot.rs:374-388` scans a closed list                                          | yes     | `user_scan…` asserts the exact type set — **CONFORMS**                                                 |
| C17 | `installed-plugins/<marketplace>/<plugin>` is the install store                                                                                                                                                                   | `#plugins`               | S   | yes            | `scanner/copilot.rs:432-483`                                                              | yes     | `user_scan…` (`security-review@awesome-market`) — **CONFORMS**                                         |
| C18 | Repository scope: `.github/{copilot-instructions.md,instructions/,agents/,skills/,hooks/,mcp.json,copilot/settings.json}` + root `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` + `.agents/skills` + `.claude/{skills,agents,settings.json}` | `#scopes`                | D/S | yes            | `scanner/copilot.rs:331-349`, `instruction_sources.rs:227-252`, `coding_agent.rs:886-906` | yes     | `copilot_fixture_census_counts_names_and_triggers` (25 components, exact) — **CONFORMS**               |
| C19 | …plus `.github/extensions/` and `.github/lsp.json`                                                                                                                                                                                | `#scopes`                | D/S | no             | —                                                                                         | —       | **NOT-IMPLEMENTED (silent)**                                                                           |
| C20 | `.github/copilot/settings.local.json` is the local tier, gitignored                                                                                                                                                               | `#scopes`                | S   | yes            | `copilot_settings.rs:72-77`                                                               | yes     | `project_settings_cover_both_the_repo_and_the_local_tier` — **CONFORMS**                               |
| C21 | Copilot reads `.claude/settings.local.json` **project-relative** (Claude canonicalizes to the main checkout)                                                                                                                      | `#scopes`, `#cross-read` | D/S | yes            | `scanner/claude_dir.rs:791-805`                                                           | **no**  | — **IMPLEMENTED-UNTESTED**                                                                             |
| C22 | Managed scope: MDM/policy + `/etc/github-copilot/policy.d/*.json`                                                                                                                                                                 | `#scopes`                | D/S | no             | —                                                                                         | —       | **NOT-IMPLEMENTED (silent)**                                                                           |
| C23 | Session scope (flags, `/agent`, `/skills`, `--additional-mcp-config`, modes)                                                                                                                                                      | `#scopes`                | D/S | no             | —                                                                                         | —       | **N/A** (no process to observe)                                                                        |
| C24 | Version must come from `copilot --version`, never the package manager                                                                                                                                                             | `#scopes`                | S   | n/a            | `tool_detection.rs:73-79` probes presence only, never displays a version                  | —       | **N/A** (Configr claims no version)                                                                    |
| C25 | Repository settings rank map `{user:0, repo:1, local:2}`, higher wins                                                                                                                                                             | `#scopes`                | S   | yes            | `precedence_tables.rs:136-139`, `copilot_settings.rs:65-78,114-122`                       | yes     | census (verbatim "ranked user < repo < local") — **CONFORMS**                                          |
| C26 | Repository scope honours **only** the 14 documented keys; others silently ignored                                                                                                                                                 | `#scopes`                | D   | yes            | `copilot_settings.rs:43-58,214-236`                                                       | partly  | census pins the _behaviour_ for 2 keys; **M11 survived** on the list itself — **IMPLEMENTED-UNTESTED** |
| C27 | Per-key Union / Tighten-only / Replaced semantics                                                                                                                                                                                 | `#scopes`                | D   | no             | —                                                                                         | —       | **NOT-IMPLEMENTED (silent)**                                                                           |

#### `#precedence`

| #   | Claim                                                                                         | Anchor                     | Ev  | Impl? | Where                                                 | Pinned? | Test                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------- | -------------------------- | --- | ----- | ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C28 | Skills: **first loaded wins**, dedup by name                                                  | `#precedence`              | D/S | yes   | `coding_agent.rs:524`                                 | yes     | `copilot_precedence_runs_in_three_directions_at_once`; M23 — **CONFORMS**                                                                  |
| C29 | Agents: **first loaded wins** dedup by ID, **user tier first** → opposite outcome from skills | `#precedence`              | D/S | yes   | `precedence_tables.rs:119-122`                        | yes     | `copilot_orders_skills_project_first_and_agents_user_first` + `copilot_keeps_the_project_skill_but_the_personal_agent`; M01 — **CONFORMS** |
| C30 | MCP: **last loaded wins**                                                                     | `#precedence`              | S   | yes   | `coding_agent.rs:525`                                 | yes     | M02 → 2 tests — **CONFORMS**                                                                                                               |
| C31 | Hooks: **all run**, no winner                                                                 | `#precedence`              | D/S | yes   | `coding_agent.rs:526`                                 | yes     | `copilot_precedence_runs_in_three_directions_at_once`; census lists 8 hooks from 5 sources — **CONFORMS**                                  |
| C32 | Settings: ranked by scope                                                                     | `#precedence`              | S   | yes   | `coding_agent.rs:527`                                 | yes     | same — **CONFORMS**                                                                                                                        |
| C33 | Instructions: **no precedence order exists**; enumerate, never compute a winner (U-05)        | `#precedence`, `#unknowns` | D/U | yes   | `coding_agent.rs:526,572`; `effective.rs:292-296,446` | yes     | `copilot_instructions_all_apply`; M25 → 3 tests — **CONFORMS**                                                                             |
| C34 | LSP: ranked, project first                                                                    | `#precedence`              | D/S | no    | —                                                     | —       | **NOT-IMPLEMENTED (silent)**                                                                                                               |

#### `#instructions`

| #   | Claim                                                                                                                                    | Anchor          | Ev  | Impl?          | Where                                                          | Pinned? | Test                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --- | -------------- | -------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| C35 | The six instruction inputs (user file + user `instructions/**`, repo file + repo `instructions/**`, `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`) | `#instructions` | D/S | yes            | `instruction_sources.rs:227-263`                               | yes     | census: exact name set `["AGENTS","api","copilot-instructions","docs","react","rust"]` — **CONFORMS**    |
| C36 | `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` adds directories                                                                                      | `#instructions` | S   | no             | —                                                              | —       | **NOT-IMPLEMENTED (silent)**                                                                             |
| C37 | `.github/instructions/**` is recursive but covers **the repository `.github` only, "not intermediate directories"**                      | `#instructions` | D   | yes            | `instruction_sources.rs:248-251` (`rules_dir`, project root)   | yes     | census: `react` at `instructions/frontend/`, `api` at `instructions/backend/` — **CONFORMS**             |
| C38 | `applyTo` files are **advertised, not concatenated** — never "always-loaded context"                                                     | `#instructions` | S   | yes            | `scanner/instructions.rs` → `LoadVerdict::ConditionallyLoaded` | yes     | census asserts `ConditionallyLoaded` for `rust`, `.is_empty()` for `copilot-instructions` — **CONFORMS** |
| C39 | A comma-separated / YAML-list `applyTo` yields one trigger per glob                                                                      | `#instructions` | D   | yes            | `scanner/instructions.rs:149-159`                              | yes     | census (`react` → 2 triggers, `api` → 2) — **CONFORMS**                                                  |
| C40 | Malformed `applyTo` globs are skipped with a warning                                                                                     | `#instructions` | S   | no             | —                                                              | —       | **NOT-IMPLEMENTED (silent)**                                                                             |
| C41 | Nested `AGENTS.md` **below** cwd are advertised in a Directory table                                                                     | `#instructions` | S   | no             | —                                                              | —       | **NOT-IMPLEMENTED (silent)**                                                                             |
| C42 | Two disable mechanisms (`--no-custom-instructions`, `/instructions` toggle by descriptor `id`)                                           | `#instructions` | D/S | no             | —                                                              | —       | **NOT-IMPLEMENTED (silent)**                                                                             |
| C43 | `@path` imports work in Copilot instructions, `AGENTS.md`, `CLAUDE.md`; repository-confined                                              | `#instructions` | D   | no             | —                                                              | —       | **NOT-IMPLEMENTED (silent)**                                                                             |
| C44 | The `InstructionSource` descriptor taxonomy (`type`/`location`/`applyTo`/`defaultDisabled`/`id`)                                         | `#instructions` | S   | no             | —                                                              | —       | **NOT-IMPLEMENTED (silent)**                                                                             |
| C45 | A priority-ordered _discovery_ list is **not** a precedence order                                                                        | `#instructions` | S   | yes (omission) | `effective.rs:292-296` returns `Loaded` for all                | yes     | `copilot_instructions_all_apply` — **CONFORMS**                                                          |

#### `#skills`

| #   | Claim                                                                             | Anchor    | Ev  | Impl?  | Where                                                     | Pinned?          | Test                                                                                        |
| --- | --------------------------------------------------------------------------------- | --------- | --- | ------ | --------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| C46 | Ordered roots: project `.github/skills` → `.agents/skills` → `.claude/skills`     | `#skills` | D/S | yes    | `precedence_tables.rs:104-107`; `coding_agent.rs:886-902` | yes              | census + `shared_surface_consumer_table` — **CONFORMS**                                     |
| C47 | …then **the same three at ancestor directories** (the `inherited` tier)           | `#skills` | D/S | yes    | `coding_agent.rs:383-387`; `scanner/inherited.rs:50-72`   | **no**           | M03/M04 survived; 0 Copilot call sites — **IMPLEMENTED-UNTESTED**                           |
| C48 | …then `~/.copilot/skills` → `~/.agents/skills`                                    | `#skills` | S   | yes    | `scanner/copilot.rs:402-429`                              | yes              | `personal_agents_skills_are_scanned_after_the_copilot_root_and_deduped`; M28 — **CONFORMS** |
| C49 | …first-loaded-wins dedup drops the `~/.agents` copy of a contested name           | `#skills` | D/S | yes    | `scanner/copilot.rs:410-423`                              | yes              | same test (`audit` keeps "from copilot root", count == 1) — **CONFORMS**                    |
| C50 | …then plugin `skills/`, then `COPILOT_SKILLS_DIRS` + `skillDirectories`           | `#skills` | D/S | no     | —                                                         | —                | **NOT-IMPLEMENTED (silent)**                                                                |
| C51 | **A skill is a directory containing `SKILL.md`**; `name` + `description` required | `#skills` | D/S | **no** | `coding_agent.rs:344`; `scanner/copilot.rs:263-270`       | yes, **wrongly** | `antigravity_skills_must_be_folders_with_a_skill_md:1086` — **TESTED-WRONG (TW-1)**         |
| C52 | Built-in skills ship inside the payload; enumerable, not removable                | `#skills` | S   | no     | —                                                         | —                | **NOT-IMPLEMENTED (silent)**                                                                |
| C53 | Copilot publishes **no skill discovery depth** either way                         | `#skills` | —   | yes    | `coding_agent.rs:461` (`SkillDepth::Unverified`)          | yes              | `shared_fixture_nested_skill_answers_each_agent_differently` — **CONFORMS**                 |

#### `#agents`

| #   | Claim                                                                                                                                                     | Anchor                 | Ev  | Impl? | Where                                                        | Pinned? | Test                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --- | ----- | ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------- |
| C54 | Two file shapes coexist: `.agent.md` under `.github/agents`/`~/.copilot/agents`, plain `.md` under `.claude/agents`                                       | `#agents`              | D/S | yes   | `scanner/copilot.rs:136-141`                                 | yes     | `accepts_both_agent_md_and_plain_md_agent_files` + census (4 agents, 2 of each) — **CONFORMS** |
| C55 | Ordered list: user → project `.github` → ancestor `.github` → project `.claude` → ancestor `.claude` → plugin                                             | `#agents`              | D/S | yes   | `precedence_tables.rs:119-122`; `coding_agent.rs:903-905`    | partly  | source order pinned; the two ancestor tiers are not (M03) — **CONFORMS** (order)               |
| C56 | …then remote organization / enterprise (no local path)                                                                                                    | `#agents`, `#unknowns` | D/U | no    | —                                                            | —       | **NOT-IMPLEMENTED (documented deferral)**, `precedence_tables.rs:108-118`                      |
| C57 | Agent frontmatter keys (`tools`, `model`, `disable-model-invocation`, `user-invocable`, `reasoning-effort`, `deferred-tool-loading`, `strict-tools-list`) | `#agents`              | S   | no    | only `name`/`description` read, `scanner/copilot.rs:146-157` | —       | **NOT-IMPLEMENTED (silent)**                                                                   |
| C58 | Agent frontmatter may carry `hooks`                                                                                                                       | `#agents`, `#hooks`    | D/S | no    | —                                                            | —       | **NOT-IMPLEMENTED (silent)**                                                                   |
| C59 | `subagents.agents.<name>` per-subagent settings                                                                                                           | `#agents`              | S   | no    | —                                                            | —       | **NOT-IMPLEMENTED (silent)**                                                                   |
| C60 | Built-in agents (`/review`, `/rubber-duck`) exist with no authored root                                                                                   | `#agents`              | S   | no    | —                                                            | —       | **NOT-IMPLEMENTED (silent)**                                                                   |
| C61 | U-04 is downgraded: use the CLI order (user tier first and winning)                                                                                       | `#unknowns`            | D   | yes   | `precedence_tables.rs:119-122`                               | yes     | `copilot_orders_skills_project_first_and_agents_user_first` — **CONFORMS**                     |

#### `#hooks`

| #   | Claim                                                                                                          | Anchor        | Ev      | Impl?                                                                                                                                 | Where                                                                                                      | Pinned? | Test                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C62 | User tier `~/.copilot/hooks/**/*.json` is globbed **recursively**; nested `<name>/hooks.json` layouts load     | `#hooks`      | D/S/O   | yes                                                                                                                                   | `scanner/copilot_hooks.rs:156-183`                                                                         | yes     | M12 → **6 tests**, incl. census 25→24 — **CONFORMS**                                                                                                                        |
| C63 | Project tier `.github/hooks/*.json`                                                                            | `#hooks`      | D/S     | yes                                                                                                                                   | `copilot_hooks.rs:187-200`; `coding_agent.rs:279,312`                                                      | yes     | `parses_event_keyed_copilot_hooks_grouped_by_command` — **CONFORMS**                                                                                                        |
| C64 | Inline `hooks` key inside settings at **any** settings scope                                                   | `#hooks`      | D/S     | yes                                                                                                                                   | `copilot_settings.rs:189-191`                                                                              | yes     | `settings_file_surfaces_inline_hooks_as_children` + census (`guard.sh`, `local-banner.sh`) — **CONFORMS**                                                                   |
| C65 | `.claude/settings{,.local}.json` `hooks` is one of exactly five keys Copilot consumes, through **two** loaders | `#cross-read` | S       | yes                                                                                                                                   | `coding_agent.rs:916-932`; `claude_dir.rs:791-805`                                                         | yes     | `copilot_reads_five_keys_of_claude_settings_and_no_more`; M08 — **CONFORMS**                                                                                                |
| C66 | File shape `{"version":1,"hooks":{<camelCase event>:[…]}}`                                                     | `#hooks`      | D/S     | yes                                                                                                                                   | `copilot_hooks.rs:23-36`                                                                                   | yes     | census + unit tests — **CONFORMS**                                                                                                                                          |
| C67 | 15 events exist in the build (incl. `preMcpToolCall`); the reference documents 14                              | `#hooks`      | S / D≠S | yes (permissive: any event key is read)                                                                                               | `copilot_hooks.rs:51-53`                                                                                   | yes     | `example_fixture_covers_the_nested_hook_directory_layout` asserts `preMcpToolCall` verbatim — **CONFORMS**                                                                  |
| C68 | Policy tier `/etc/github-copilot/policy.d/*.json`, loaded first, ownership-gated, immune to `disableAllHooks`  | `#hooks`      | D/S     | no                                                                                                                                    | —                                                                                                          | —       | **NOT-IMPLEMENTED (silent)**                                                                                                                                                |
| C69 | `{"type":"http", url, headers, allowedEnvVars, timeoutSec}` handler shape                                      | `#hooks`      | D/S     | ~~no~~ → **partly** (`3f933432`): `url` keys and names the card; `headers`/`allowedEnvVars`/`timeoutSec` still unread, `type` ignored | ~~`inline:<n>` group~~ → `copilot_hooks.rs:52-58` (`handler_key`), `:98-113` (`hook_card_name`, host only) | partly  | `an_http_handler_is_carded_by_its_endpoint_not_as_a_commandless_entry` pins the naming; nothing asserts the three unread keys — **still NOT-IMPLEMENTED (silent)** for them |
| C70 | PascalCase Claude-format matchers and a VS Code shape are accepted alongside camelCase                         | `#hooks`      | D/S     | no                                                                                                                                    | the nested `hooks:[…]` array is never descended                                                            | —       | **NOT-IMPLEMENTED (silent)**                                                                                                                                                |
| C71 | Plugin `hooks.json` / `hooks/hooks.json` in the plugin root                                                    | `#hooks`      | D/S     | no                                                                                                                                    | plugin bundles are carded but not opened for hooks                                                         | —       | **NOT-IMPLEMENTED (silent)**                                                                                                                                                |

#### `#mcp`

| #   | Claim                                                                                                                     | Anchor        | Ev  | Impl?                                                                               | Where                                                                                         | Pinned?             | Test                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------- | --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C72 | Per directory, `.mcp.json` then `.github/mcp.json`, **first existing only** — each directory contributes at most one file | `#mcp`        | S   | yes                                                                                 | `mcp_copilot.rs:35,112-134`                                                                   | yes                 | M05 + M06 → `one_directory_contributes_only_its_first_mcp_file` — **CONFORMS**                                                                                                                                                |
| C73 | The walk runs cwd→resolved Git root; results sort root-most first and merge forward, so **nearest wins**                  | `#mcp`        | S   | yes                                                                                 | `mcp_copilot.rs:139-152`; `precedence_tables.rs:130-133`                                      | yes                 | `collector_walks_up_to_the_repository_root` + `ancestor_precedence_runs_in_opposite_directions` (`Copilot::mcp == NearerWins`) — **CONFORMS**                                                                                 |
| C74 | …with linked-worktree resolution                                                                                          | `#mcp`        | S   | yes                                                                                 | `ancestors.rs:40-44` accepts a `.git` file                                                    | **no**              | — **IMPLEMENTED-UNTESTED**                                                                                                                                                                                                    |
| C75 | …stopping early at the first directory failing folder trust, unless `COPILOT_ALLOW_ALL=true`                              | `#mcp`        | S   | no — the walk still does not stop (`project_config_dirs`, `mcp_copilot.rs:151-164`) | `mcp_copilot.rs:38-49` (`FOLDER_TRUST_NOTE`), `:186-200` (appended to every server above cwd) | yes, for the caveat | `collector_walks_up_to_the_repository_root` asserts the ancestor server carries "folder trust" and the cwd's own does not — ~~**NOT-IMPLEMENTED (silent)**~~ → **NOT-IMPLEMENTED (documented deferral)**, fixed in `3f933432` |
| C76 | Whole-session order user → workspace → installed plugins, last wins                                                       | `#mcp`        | S   | yes                                                                                 | `precedence_tables.rs:130-133`; `mcp_copilot.rs:278-326`                                      | yes                 | `project_definition_shadows_the_user_one`, `plugin_and_built_in_servers_take_their_documented_precedence` — **CONFORMS**                                                                                                      |
| C77 | …then `--plugin-dir`, ODR, `--additional-mcp-config`                                                                      | `#mcp`        | S/U | no                                                                                  | —                                                                                             | —                   | **NOT-IMPLEMENTED (documented deferral for ODR; silent for the two flags)**                                                                                                                                                   |
| C78 | Both the `mcpServers` wrapper and the bare top-level form are accepted                                                    | `#mcp`        | S   | yes                                                                                 | `mcp_copilot.rs:95-106`                                                                       | yes                 | `a_non_server_object_is_not_read_as_the_bare_format` + census (`.github/mcp.json` bare) — **CONFORMS**                                                                                                                        |
| C79 | Plugin `mcpServers` may be inline **or a path**; the plugin definition takes precedence                                   | `#mcp`        | D/S | yes                                                                                 | `mcp_copilot.rs:233-266,286`                                                                  | yes                 | `plugin_mcp_servers_can_be_a_path_to_a_config_file` — **CONFORMS**                                                                                                                                                            |
| C80 | The built-in `github-mcp-server` is **its own tier**; its rank in the merge "is not evidenced"                            | `#mcp`        | D/S | yes                                                                                 | `mcp_copilot.rs:195-205,316-319` (appended, never deduped; description says so)               | yes                 | M29 → 4 tests — **CONFORMS**                                                                                                                                                                                                  |
| C81 | Per-server `tools` allowlist (`"*"`, comma list, `""`)                                                                    | `#installing` | S/O | yes                                                                                 | `mcp_copilot.rs:461-479`                                                                      | yes                 | census: `"uvx — tools: search_code, search_issues"` verbatim — **CONFORMS**                                                                                                                                                   |
| C82 | `--allow-all-mcp-server-instructions` gating                                                                              | `#mcp`        | D/S | no                                                                                  | —                                                                                             | —                   | **N/A** (session flag)                                                                                                                                                                                                        |

#### `#plugins`

| #   | Claim                                                                                                        | Anchor      | Ev  | Impl?               | Where                                        | Pinned? | Test                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------- | --- | ------------------- | -------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| C83 | Four manifest paths, in order, Claude layout **fourth and last**                                             | `#plugins`  | S   | yes                 | `mcp_copilot.rs:44-58`                       | yes     | `plugin_manifests_are_found_at_all_four_accepted_paths` + `the_first_accepted_manifest_path_wins` — **CONFORMS** |
| C84 | Four marketplace catalog paths                                                                               | `#plugins`  | S   | no                  | —                                            | —       | **NOT-IMPLEMENTED (silent)**                                                                                     |
| C85 | Two default marketplaces ship enabled; custom needs `extraKnownMarketplaces`                                 | `#plugins`  | D/S | no                  | —                                            | —       | **NOT-IMPLEMENTED (silent)**                                                                                     |
| C86 | A plugin can bundle `agents/`, `skills/`, `commands/`, `hooks/`, `extensions/`, `mcpServers/`, `lspServers/` | `#plugins`  | D/S | partly              | only `mcpServers` (`mcp_copilot.rs:233-266`) | partly  | — **NOT-IMPLEMENTED (silent)** for the other six                                                                 |
| C87 | Executable CLI extensions (`extension.mjs/.cjs/.js`, `extensions.mode`)                                      | `#plugins`  | D/S | no                  | —                                            | —       | **NOT-IMPLEMENTED (silent)**                                                                                     |
| C88 | U-06: an accepted Claude manifest is not a proven-working Copilot plugin                                     | `#unknowns` | U   | yes (no claim made) | —                                            | —       | **CONFORMS**                                                                                                     |

#### `#settings` extras, `#runtime`, `#cross-read`

| #    | Claim                                                                                                           | Anchor        | Ev  | Impl?                                                                              | Where                                                  | Pinned?       | Test                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------------- | --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------- |
| C89  | Every Copilot settings file is **JSONC**                                                                        | `#settings`   | S/O | yes                                                                                | `copilot_settings.rs:186` (`parse_jsonc`)              | yes           | `example_fixture_settings_are_parsed_as_jsonc` (fixture asserted to start with `//`) — **CONFORMS**        |
| C90  | The `sandbox` subsystem key                                                                                     | `#settings`   | D/S | no                                                                                 | —                                                      | —             | **NOT-IMPLEMENTED (silent)**                                                                               |
| C91  | `allowedUrls`/`deniedUrls`/`trustedFolders`                                                                     | `#settings`   | S   | no                                                                                 | —                                                      | —             | **NOT-IMPLEMENTED (silent)**                                                                               |
| C92  | `statusLine` is user-tier only                                                                                  | `#settings`   | S   | no                                                                                 | —                                                      | —             | **NOT-IMPLEMENTED (silent)**                                                                               |
| C93  | Hosted Copilot Memory has no local contract — never present it as scannable (U-15)                              | `#runtime`    | D/U | yes (omission)                                                                     | —                                                      | yes           | census exact totals — **CONFORMS**                                                                         |
| C94  | Session records are opaque — do not parse, do not offer to edit (U-15)                                          | `#runtime`    | D/U | yes (omission)                                                                     | —                                                      | yes           | `user_scan…` exact type set — **CONFORMS**                                                                 |
| C95  | Root `CLAUDE.md` is a live compatibility instruction source                                                     | `#cross-read` | D/S | yes                                                                                | `instruction_sources.rs:236-239`                       | yes           | `copilot_cross_reads_both_documented_claude_md_locations` — **CONFORMS**                                   |
| C96  | `AGENTS.md` is a live compatibility instruction source                                                          | `#cross-read` | D/S | yes                                                                                | `coding_agent.rs:892-897`                              | yes           | `copilot_fixture_project_presence_and_shared_agents_md` (emitted exactly once, 4 consumers) — **CONFORMS** |
| C97  | `GEMINI.md` is a live compatibility instruction source                                                          | `#cross-read` | D   | yes                                                                                | `instruction_sources.rs` `COPILOT_PROJECT`             | yes           | `pair_ao_fixture_…` (Copilot presence via `GEMINI.md`) — **CONFORMS**                                      |
| C98  | `.claude/skills` is Copilot's third project skill root, with its own ancestor tier                              | `#cross-read` | D/S | yes                                                                                | `coding_agent.rs:898-902`                              | yes (project) | `project_claude_skills_carry_three_consumers`, acme census — **CONFORMS**                                  |
| C99  | `.claude/agents` is 4th/5th in the agent list, with its own ancestor tier                                       | `#cross-read` | D/S | yes                                                                                | `coding_agent.rs:903-905`                              | yes (project) | acme census (`agent` consumers `["claude","copilot"]`); M09 — **CONFORMS**                                 |
| C100 | `.agents` reaches Copilot **only** through skills                                                               | `#cross-read` | D/S | yes                                                                                | `coding_agent.rs:849-852`                              | yes           | `project_agents_skills_carry_all_four_consumers` (all non-skill types owner-only) — **CONFORMS**           |
| C101 | U-16: whether Copilot honours `$CLAUDE_CONFIG_DIR` is unknown                                                   | `#unknowns`   | U   | yes (structurally unreachable — Copilot's `.claude` read is project-relative only) | `claude_dir.rs:792-793` (`if !is_project { return; }`) | yes           | `copilot_reads_five_keys_of_claude_settings_and_no_more` — **CONFORMS**                                    |
| C102 | U (§5): report the org/enterprise agent tier with its remote source; **do not report the capability as absent** | `#unknowns`   | U   | no                                                                                 | —                                                      | —             | **NOT-IMPLEMENTED (documented deferral, partially short of the instruction)**                              |

_(Copilot total after merging sub-rows: 79 distinct claims.)_

### 4.2 Google Antigravity (73 claims)

#### `#roots`, `#spellings`, `#global-root`

| #   | Claim                                                                                                                          | Anchor                | Ev    | Impl?          | Where                                                                               | Pinned?             | Test                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ----- | -------------- | ----------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| A01 | Project root `.agents/`; user root `~/.gemini/` — two names sharing no prefix                                                  | `#roots`              | D/S/O | yes            | `coding_agent.rs:199,820`                                                           | yes                 | `antigravity_project_scope_paths`, `antigravity_user_scope_paths` — **CONFORMS**                        |
| A02 | `~/.gemini/config/` is the global customization root                                                                           | `#roots`              | D/S/O | yes            | `coding_agent.rs:820`; `antigravity_user.rs:57-62`                                  | yes                 | `user_scan_aggregates_config_gemini_md_and_secondary_roots` — **CONFORMS**                              |
| A03 | `~/.gemini/GEMINI.md` is global instructions; **no** global `AGENTS.md`                                                        | `#roots`              | D     | yes            | `instruction_sources.rs:284-287` (`in_home`)                                        | yes                 | same test — **CONFORMS**                                                                                |
| A04 | `~/.gemini/antigravity-cli/` is private app data: `settings.json`, `keybindings.json`, `builtin/`, `conversations/`, caches    | `#roots`              | D/S/O | partly         | `antigravity_user.rs:113-129` scans only `skills`/`agents`/`plugins` as a **probe** | yes (for the probe) | `user_scan_aggregates…` — **CONFORMS** (probe); settings/builtin → SG                                   |
| A05 | `<workspace>/.gemini/antigravity-cli/` is generated, not authored                                                              | `#roots`              | S     | yes (omission) | —                                                                                   | yes                 | census exact totals — **CONFORMS**                                                                      |
| A06 | `~/.gemini/config/projects/<id>.json` is opaque — do not parse, do not offer to edit                                           | `#roots`, `#settings` | S/O/U | yes (omission) | —                                                                                   | yes                 | census — **CONFORMS**                                                                                   |
| A07 | There is **no** local/private override scope; synthesizing one produces a dead file                                            | `#roots`              | D     | yes            | no `Local` source for Antigravity anywhere                                          | yes                 | census (`source` is only `project`/`user`/`plugin`) — **CONFORMS**                                      |
| A08 | Three `.gemini` product trees; a scanner needs all three names                                                                 | `#roots`              | S/O   | yes            | `antigravity_user.rs:95-132` (labels name the product)                              | yes                 | `user_scan_aggregates…` — **CONFORMS**                                                                  |
| A09 | `~/.gemini/antigravity-cli/builtin/skills/` is a real capability root (tier 4)                                                 | `#roots`              | S     | no             | —                                                                                   | —                   | **NOT-IMPLEMENTED (silent)**                                                                            |
| A10 | One root, **four spellings**: `.agents/`, `.agent/`, `_agents/`, `_agent/` — every capability hangs off whichever exists       | `#spellings`          | S     | yes            | `coding_agent.rs:487`; `antigravity.rs:71-78`                                       | yes                 | M13 → 4 tests, M27 → 4 tests, `all_four_workspace_root_spellings_are_read_and_none_wins` — **CONFORMS** |
| A11 | Precedence among the four is **unknown**: enumerate every spelling, never pick a winner, never fold one into another           | `#spellings`          | U     | yes            | `antigravity.rs:85-88,115-130` (alternates namespaced + labelled)                   | yes                 | `antigravity_fixture_reads_every_spelling_of_the_workspace_root` (exact ids) — **CONFORMS**             |
| A12 | U-01: read `~/.gemini/config/skills/` **first**, may probe `~/.gemini/antigravity-cli/skills/`, present **neither** as certain | `#global-root`        | I/U   | yes            | `antigravity_user.rs:51-64,86-129` (label: _"private CLI app-data probe"_)          | yes                 | `user_scan_aggregates…` — **CONFORMS**                                                                  |
| A13 | `~/.gemini/skills` (predecessor Gemini CLI) is **not** a live candidate                                                        | `#global-root`        | D     | yes            | `antigravity_user.rs:35-39` (explicit)                                              | yes (omission)      | census — **CONFORMS (documented)**                                                                      |

#### `#instructions`

| #   | Claim                                                                                                                         | Anchor                               | Ev   | Impl?                                                                                                   | Where                                                                              | Pinned? | Test                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A14 | Three authored-context places: global `GEMINI.md`, `.agents/rules/*.md`, directory-scoped `AGENTS.md`/`GEMINI.md`             | `#instructions`                      | D/S  | yes                                                                                                     | `instruction_sources.rs:276-287`; `antigravity_rules.rs:31-45`                     | yes     | census — **CONFORMS**                                                                                                                                                                                                                             |
| A15 | **Assembly: accumulate cwd→repository root, stop there; deduplicate by resolved path**                                        | `#instructions`, `#precedence-table` | S    | ~~**no**~~ → **yes** for the walk; the dedupe-by-resolved-path clause is prose only (no `canonicalize`) | `instruction_sources.rs:474-479` (`ANTIGRAVITY_ANCESTORS`)                         | yes     | ~~**TESTED-WRONG (TW-3)**~~ → **CONFORMS** — fixed in `3f933432`. `antigravity_accumulates_both_filenames_up_to_the_repository_root`; `the_ancestor_walk_matrix_matches_the_five_guides`; `only_copilot_reads_nothing_from_an_ancestor_directory` |
| A16 | Only `always_on` loads unconditionally; `model_decision` behaves like a skill                                                 | `#instructions`                      | S    | yes                                                                                                     | `antigravity_rules.rs:59-83`                                                       | yes     | M32 → `each_published_trigger_value_says_what_it_does` — **CONFORMS**                                                                                                                                                                             |
| A17 | The keys `trigger:` and `glob:` are settled; the **value spellings** for glob/manual are unpublished — do not name them       | `#instructions`                      | S/U  | yes                                                                                                     | `antigravity_rules.rs:70-78` (unrecognised trigger → "not unconditional", unnamed) | yes     | `a_glob_scopes_the_rule_without_naming_an_unpublished_mode` — **CONFORMS**                                                                                                                                                                        |
| A18 | `GEMINI.md`/`AGENTS.md` support no frontmatter and are always active for their directory                                      | `#instructions`                      | S    | yes                                                                                                     | `instruction_sources.rs:277-282` (class 0)                                         | yes     | `shared_files_carry_exactly_the_agents_whose_table_names_them` — **CONFORMS**                                                                                                                                                                     |
| A19 | Rule files carry a 12,000-character cap                                                                                       | `#instructions`                      | D    | yes (as a note)                                                                                         | `antigravity_rules.rs:25`                                                          | yes     | census + `scans_full_project_scope_agents_directory` — **CONFORMS**                                                                                                                                                                               |
| A20 | Rules support `@file` includes (relative from the rule file; absolute tried, then workspace-relative)                         | `#instructions`                      | D/S  | yes                                                                                                     | `antigravity_rules.rs:115-144`                                                     | yes     | `at_references_are_named_and_prose_handles_are_not` — **CONFORMS**                                                                                                                                                                                |
| A21 | `~/.gemini/config/rules/` and `config/agents` are **I-class** — composed, not stated (`config/rules` is 0 hits in the binary) | `#installing`                        | I    | yes                                                                                                     | `antigravity.rs:28-42`; `antigravity_user.rs:70-84`                                | yes     | `only_the_inferred_global_subpaths_carry_the_inferred_note` — **CONFORMS**                                                                                                                                                                        |
| A22 | Same-name **rule** conflict behaviour is unpublished — enumerate                                                              | `#instructions`                      | U    | partly                                                                                                  | `coding_agent.rs:531` answers `FirstLoadedWins` for `"rule"`                       | yes     | `antigravity_precedence_stops_where_the_evidence_stops` — **CONFORMS with caveat** (see §6)                                                                                                                                                       |
| A23 | `rules.json` is a literal with no documented path or schema — **do not scan, do not parse**                                   | `#instructions`, `#unknowns`         | U-02 | yes                                                                                                     | pinned by exclusion                                                                | yes     | `opaque_literals_and_runtime_coordination_files_are_not_capabilities` — **CONFORMS**                                                                                                                                                              |

#### `#skills`, `#declared-sources`, `#workflows`

| #   | Claim                                                                                                                                   | Anchor                                   | Ev       | Impl?                                   | Where                                                                                                 | Pinned?          | Test                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A24 | A skill is a **directory + `SKILL.md`** at both scopes; the flat `<name>.md` form is documentation-only                                 | `#skills`                                | S / D≠S  | yes                                     | `coding_agent.rs:343`; `claude_dir.rs:252,588`                                                        | yes              | M15 → 2 tests, `a_loose_markdown_file_under_skills_is_not_a_skill` — **CONFORMS**                                                            |
| A25 | **Both** `name` and `description` are required (the "optional name" reading is the general product page, not the CLI's)                 | `#skills`                                | S        | yes                                     | `antigravity.rs:180-208`                                                                              | yes              | M16 → `a_skill_missing_a_required_frontmatter_field_says_so` — **CONFORMS**                                                                  |
| A26 | `disable-slash-command` is code-observed in 1.1.12, not manual-documented                                                               | `#skills`                                | D/S      | yes                                     | `antigravity.rs:218-226`                                                                              | yes              | `a_skill_that_disables_its_slash_command_says_so` — **CONFORMS**                                                                             |
| A27 | Skills **are** the slash-command mechanism; there is no `.agents/commands` directory                                                    | `#skills`, `#installing`                 | D/S      | ~~**inverted**~~ → **yes** (`3f933432`) | `claude_dir.rs:166,179-181` gates `commands/` on `commands_dir() == "commands"`                       | yes              | ~~**IMPLEMENTED-BEYOND-SPEC (BS-1)**~~ → **CONFORMS** — fixed in `3f933432`. `an_agents_commands_directory_is_not_an_antigravity_capability` |
| A28 | Skill discovery is exactly one level (`{root}/skills/{name}/SKILL.md`)                                                                  | `#skills`                                | S        | yes                                     | `coding_agent.rs:459`                                                                                 | yes              | `shared_fixture_nested_skill_answers_each_agent_differently` — **CONFORMS**                                                                  |
| A29 | **Antigravity does not read `~/.agents/skills`**                                                                                        | `#skills`, `#cross-tool`                 | D        | **no**                                  | `scanner/copilot.rs:426` tags it with the 4-consumer set                                              | yes, **wrongly** | `personal_agents_skills_are_scanned_after_the_copilot_root_and_deduped:875-879` — **TESTED-WRONG (TW-2)**                                    |
| A30 | `skills.json`/`plugins.json` share one schema and sit in a customization root                                                           | `#declared-sources`                      | S        | yes                                     | `antigravity_sources.rs:1-23`; `antigravity.rs:236-261`                                               | yes              | `antigravity_fixture_declared_sources_add_filtered_capabilities` — **CONFORMS**                                                              |
| A31 | `entries[].path` points at a customization **directory**                                                                                | `#declared-sources`                      | S        | yes                                     | `antigravity_sources.rs:101-119,181-200`                                                              | yes              | same — **CONFORMS**                                                                                                                          |
| A32 | `inherits[]` merges another config's entries **in listed order** — composition, not replacement                                         | `#declared-sources`                      | S        | yes                                     | `antigravity_sources.rs:126-174` (inherited first, cycle-safe)                                        | yes              | `inherited_configs_merge_first_narrow_filters_and_survive_cycles` — **CONFORMS**                                                             |
| A33 | `include_only`/`exclude` are **regexes over directory names**, not globs over paths                                                     | `#declared-sources`                      | S        | yes                                     | `antigravity_sources.rs:38-52,86-98,193-197` (`regex::Regex` on `file_name`)                          | yes              | M19 → 5 tests — **CONFORMS**                                                                                                                 |
| A34 | Three-way path resolution; a bare relative path resolves against the **repository root**, or the workspace root when there is no `.git` | `#declared-sources`                      | S        | yes                                     | `antigravity_sources.rs:71-83`; `antigravity.rs:107`                                                  | yes              | M18 → 5 tests + `a_relative_declared_path_resolves_without_a_git_directory` — **CONFORMS**                                                   |
| A35 | Declared sources are **their own tier** — 2nd at workspace, **last** at global                                                          | `#declared-sources`, `#precedence-table` | S        | no                                      | only a description note (`antigravity.rs:26,246-249`); no `CapabilitySource` variant                  | —                | **NOT-IMPLEMENTED (silent)**                                                                                                                 |
| A36 | `agents.json`, `skills.txt`, `agents.txt`, `agent.json` are opaque — do not scan, parse or edit                                         | `#declared-sources`, `#unknowns`         | U-02     | yes                                     | pinned by exclusion                                                                                   | yes              | `opaque_literals_and_runtime_coordination_files_are_not_capabilities` — **CONFORMS**                                                         |
| A37 | Workflows **exist** as a first-class kind — reporting Antigravity as having none states something false                                 | `#workflows`                             | S        | yes                                     | `antigravity.rs:44-60,287-305`                                                                        | yes              | `workflows_are_listed_as_slash_commands_with_an_unsettled_location` — **CONFORMS**                                                           |
| A38 | The **directory is unpublished** (U-03); a tool may scan the codelab candidate but must not present it as certain                       | `#workflows`                             | U-03 / I | yes                                     | `antigravity.rs:58-60,294-303` (`WORKFLOW_PATH_NOTE` + `LoadVerdict::Unknown`)                        | yes              | M17 **and** M26 both caught — **CONFORMS**                                                                                                   |
| A39 | Workflows surface as **slash commands** with a path and a description                                                                   | `#workflows`                             | S        | yes                                     | `antigravity.rs:287-293` (`component_type == "command"`)                                              | yes              | same test — **CONFORMS**                                                                                                                     |
| A40 | Both scopes (workspace and global)                                                                                                      | `#workflows`                             | S        | yes                                     | `antigravity.rs:153` runs for both roots                                                              | **no**           | only project scope asserted — **IMPLEMENTED-UNTESTED**                                                                                       |
| A41 | Offer **no** create-a-workflow action that has to guess a directory                                                                     | `#workflows`                             | U-03     | yes                                     | no workflow install path anywhere; `install_matrix.rs:144-152` refuses Antigravity for seedr outright | yes              | `antigravity_is_rejected`, `skills_sh_antigravity_user_scope_is_refused` — **CONFORMS**                                                      |

#### `#agents`, `#hooks`

| #   | Claim                                                                                                                                                               | Anchor                   | Ev      | Impl?                                     | Where                                                                                   | Pinned? | Test                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------- | ----------------------------------------- | --------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| A42 | `.agents/agents/<name>.md` **or** `<name>/agent.md`                                                                                                                 | `#agents`                | D/S     | yes                                       | `claude_dir.rs` folder+flat discovery                                                   | yes     | `scans_full_project_scope_agents_directory` (both shapes) — **CONFORMS**                                                |
| A43 | The enclosing `agents/` directory is the discovery signal, not the filename suffix                                                                                  | `#agents`                | S       | yes                                       | same                                                                                    | yes     | census — **CONFORMS**                                                                                                   |
| A44 | Global `~/.gemini/config/agents` (I-class)                                                                                                                          | `#agents`, `#installing` | I       | yes                                       | `antigravity_user.rs:70-84` (inferred note)                                             | yes     | `only_the_inferred_global_subpaths_carry_the_inferred_note` — **CONFORMS**                                              |
| A45 | `.agents/agents/` is **Antigravity-only** — no Copilot literal, no OpenCode loader, undocumented for Claude/Codex                                                   | `#agents`, `#cross-tool` | S       | yes                                       | `coding_agent.rs:849-852`; `crud/components.rs:109-117`                                 | yes     | `shared_agent_lists_only_antigravity`, `project_agents_skills_carry_all_four_consumers` — **CONFORMS**                  |
| A46 | Agent frontmatter (`tools`, `mainAgent`, `subagent`, `model`, `commandExecutionPolicy`, `mcpServers`, `skills`, `plugins`, `hidden`, `inheritMcp`)                  | `#agents`                | D/S     | no                                        | only `name`/`description`                                                               | —       | **NOT-IMPLEMENTED (silent)**                                                                                            |
| A47 | Built-in subagents (`research`, `browser`, `self`) + the `/teamwork-preview` roster                                                                                 | `#agents`                | D/S     | no                                        | —                                                                                       | —       | **NOT-IMPLEMENTED (silent)**                                                                                            |
| A48 | Three hook locations: global `~/.gemini/config/hooks.json`, workspace `.agents/hooks.json`, plugin `<plugin>/hooks.json`                                            | `#hooks`                 | D/S     | yes                                       | `antigravity.rs:154`, `antigravity_user.rs:59`, `antigravity.rs:421-486`                | yes     | census + `scans_user_scope_config_directory` + `plugin_bundles_expose_their_contents_with_plugin_source` — **CONFORMS** |
| A49 | Top-level keys are **hook names**, not event names; each maps to `enabled` + event arrays                                                                           | `#hooks`                 | S       | yes                                       | `antigravity_hooks.rs:60-75,221-243`                                                    | yes     | `a_hooks_directory_is_not_a_hook_source` (`hooks == ["real"]`) — **CONFORMS**                                           |
| A50 | Exactly five events: `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop`                                                                         | `#hooks`                 | D/S     | yes                                       | `antigravity_hooks.rs:24,30`                                                            | yes     | M14 → 2 tests — **CONFORMS**                                                                                            |
| A51 | `SessionStart` ships in the 1.1.12 proto but is undocumented — reachability **unresolved**                                                                          | `#hooks`                 | S/U     | yes                                       | `antigravity_hooks.rs:39-43,230-241` (`LoadVerdict::Unknown` when it is the only event) | yes     | `a_hook_wired_only_to_session_start_is_unknown_not_loaded` — **CONFORMS**                                               |
| A52 | The two tool events take the grouped `{matcher, hooks:[…]}` form; the other three take a flat list and **ignore `matcher` entirely**                                | `#hooks`                 | S       | yes                                       | `antigravity_hooks.rs:127-164`                                                          | yes     | M14; `only_the_two_tool_events_render_a_matcher`, `a_matcher_on_a_flat_event_is_reported_as_ignored` — **CONFORMS**     |
| A53 | Matcher semantics (`"*"`/`""` all, bare name exact, `\|` alternates, regexes like `browser_.*`)                                                                     | `#hooks`                 | S       | yes (default `"*"`, verbatim passthrough) | `antigravity_hooks.rs:130-136`                                                          | yes     | `only_the_two_tool_events_render_a_matcher` (`browser_.*`) — **CONFORMS**                                               |
| A54 | **The working directory is the `hooks.json` directory** — copying a hook between scopes silently repoints every relative path                                       | `#hooks`                 | S       | yes                                       | `antigravity_hooks.rs:52-53,97-124,211-213`                                             | yes     | `a_relative_command_says_where_it_resolves_from` (and the `$PATH` case gets no claim) — **CONFORMS**                    |
| A55 | Handler `{type:"command", command, timeout(30s)}`; `type` defaults to `command` and is the only value                                                               | `#hooks`                 | S       | partly                                    | `command` read; `timeout` never surfaced                                                | —       | **NOT-IMPLEMENTED (silent)** for `timeout`                                                                              |
| A56 | Tool names are **derived** by lowercasing the step type and stripping `CORTEX_STEP_TYPE_`                                                                           | `#hooks`                 | S       | no                                        | —                                                                                       | —       | **NOT-IMPLEMENTED (silent)**                                                                                            |
| A57 | Runs via `sh -c` / `cmd /c`; `~` expands                                                                                                                            | `#hooks`                 | S       | no                                        | —                                                                                       | —       | **NOT-IMPLEMENTED (silent)**                                                                                            |
| A58 | The decision enum (4 manual / 5 schema values), `injectSteps`, `terminationBehavior`, `overwrite`, `{}`                                                             | `#hooks`                 | S / D≠S | no                                        | —                                                                                       | —       | **NOT-IMPLEMENTED (silent)**                                                                                            |
| A59 | Named hooks **merge across files** and run sequentially; cross-source collision order is **unpublished** — show every contributing file, never one "effective" hook | `#hooks`, `#unknowns`    | S/U     | yes                                       | `coding_agent.rs:532,573`; `effective.rs:319-323,406-437`                               | yes     | M24 → `antigravity_precedence_stops_where_the_evidence_stops` — **CONFORMS**                                            |
| A60 | …and the unknown cites the guide's own register                                                                                                                     | `#unknowns`              | U       | yes                                       | `coding_agent.rs:573-574`                                                               | **no**  | M21 survived — **IMPLEMENTED-UNTESTED**                                                                                 |
| A61 | `.agents/hooks/` is **not** a hook source — an ordinary folder `agy` never enumerates                                                                               | `#hooks`                 | S       | yes                                       | `coding_agent.rs:278,311`; `claude_dir.rs:158,161-163`                                  | yes     | `a_hooks_directory_is_not_a_hook_source` — **CONFORMS**                                                                 |

#### `#mcp`, `#plugins`, `#sidecars`, `#settings`, `#generated`, `#cross-tool`

| #   | Claim                                                                                                                                                                      | Anchor                           | Ev      | Impl?                         | Where                                                                                                                                                                            | Pinned?                  | Test                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A62 | `mcp_config.json` with a top-level `mcpServers` object                                                                                                                     | `#mcp`                           | D/S     | yes                           | `antigravity_mcp.rs:43-64`                                                                                                                                                       | yes                      | `mcp_config_yields_per_server_components_including_disabled` — **CONFORMS**                                                                                                                                                                                                                                         |
| A63 | Global `~/.gemini/config/mcp_config.json` — one of exactly two manual Location entries                                                                                     | `#mcp`                           | D/S     | yes                           | `antigravity_user.rs:59`; `mcp/config_paths.rs:71-79`                                                                                                                            | yes                      | `config_path_antigravity_user` — **CONFORMS**                                                                                                                                                                                                                                                                       |
| A64 | Plugin `<plugin>/mcp_config.json`, ingested when the plugin is enabled                                                                                                     | `#mcp`                           | D/S     | yes                           | `antigravity.rs:607` (bundle)                                                                                                                                                    | yes                      | `plugin_bundles_expose_their_contents_with_plugin_source` — **CONFORMS**                                                                                                                                                                                                                                            |
| A65 | `.agents/mcp_config.json` is **documented-only** — a tool may scan it but must not present it as verified                                                                  | `#mcp`                           | D       | yes                           | `antigravity_mcp.rs:26-27,133-141` (note **and** `LoadVerdict::Unknown`)                                                                                                         | note yes, **verdict no** | `mcp_config_yields_per_server_components_including_disabled` pins the note; **M22 survived** — **IMPLEMENTED-UNTESTED** (verdict half)                                                                                                                                                                              |
| A66 | `disabled` and the tool filters are load-bearing: a server can be present-but-disabled with tools filtered                                                                 | `#mcp`                           | D/S     | yes                           | `antigravity_mcp.rs:67-72,95-110,121-152`                                                                                                                                        | yes                      | `a_disabled_server_is_listed_as_off`, `tool_filters_narrow_the_verdict_instead_of_being_dropped` — **CONFORMS**                                                                                                                                                                                                     |
| A67 | Remote entries take `serverUrl`, and `url` is an accepted alternate                                                                                                        | `#mcp`                           | D/S     | yes                           | `antigravity_mcp.rs:38,75-84`                                                                                                                                                    | yes                      | `both_remote_endpoint_keys_reach_the_card` — **CONFORMS**                                                                                                                                                                                                                                                           |
| A68 | The wider accepted key surface (`cwd`, `headers`, `oauth`, `authProviderType`, `timeoutSeconds`, per-tool `tools` map)                                                     | `#mcp`                           | D/S     | no                            | —                                                                                                                                                                                | —                        | **NOT-IMPLEMENTED (silent)**                                                                                                                                                                                                                                                                                        |
| A69 | Duplicate server-ID behaviour is **unpublished**                                                                                                                           | `#mcp`, `#unknowns`              | U       | yes                           | `coding_agent.rs:532,574`                                                                                                                                                        | yes                      | `antigravity_precedence_stops_where_the_evidence_stops`; M24 — **CONFORMS**                                                                                                                                                                                                                                         |
| A70 | Root `.mcp.json` has **no** Antigravity reader; a single pooled literal must not be read as one                                                                            | `#mcp`, `#cross-tool`            | D/S     | yes                           | `coding_agent.rs:906` (`ProjectMcpJson` → Claude + Copilot only)                                                                                                                 | yes                      | `project_mcp_servers_come_from_mcp_json` — **CONFORMS**                                                                                                                                                                                                                                                             |
| A71 | A plugin is a directory marked by `plugin.json`, at `.agents/plugins/<p>/` (all four spellings) and `~/.gemini/config/plugins/<p>/`                                        | `#plugins`                       | D/S     | yes                           | `antigravity.rs:396-486`; `antigravity_user.rs:120-125`                                                                                                                          | yes                      | M27; `underscore_agents_plugins_are_scanned_as_that_roots_own_plugins`, `antigravity_fixture_plugin_bundles_attribute_their_contents` — **CONFORMS**                                                                                                                                                                |
| A72 | Bundle layout `plugin.json` + optional `mcp_config.json`, `hooks.json`, `rules/`, `skills/<n>/SKILL.md`, ingested automatically                                            | `#plugins`                       | S       | yes                           | `antigravity.rs:421-486`                                                                                                                                                         | yes                      | `plugin_bundles_expose_their_contents_with_plugin_source` (source `plugin`, `plugin_name` set) — **CONFORMS**                                                                                                                                                                                                       |
| A73 | Accept a `plugin.json` without `name` (the shipped build defaults it from the directory)                                                                                   | `#plugins`                       | S / D≠S | yes                           | `antigravity.rs:421-486`                                                                                                                                                         | **no**                   | fixtures always supply `name` — **IMPLEMENTED-UNTESTED**                                                                                                                                                                                                                                                            |
| A74 | **Plugin enablement lives in the shared `config.json`** (seeded once from the manifest since 1.1.11)                                                                       | `#plugins`, `#settings`          | S       | no — the file is still unread | `antigravity.rs:60-68` (`PLUGIN_ENABLEMENT_NOTE`), `:500-510` (stamped on the bundle **and everything it contributes**)                                                          | yes, for the refusal     | ~~**NOT-IMPLEMENTED (silent)** — a disabled plugin is shown as enabled~~ → **NOT-IMPLEMENTED (documented deferral)** — fixed in `3f933432`; bundles now carry `LoadVerdict::Unknown`, pinned by `antigravity_fixture_verdicts_state_what_is_known_and_withhold_the_rest` over 8 exact pairs plus a negative control |
| A75 | Read the **shared** global plugin root; a plugin left in the private tree is "present, effect unknown"                                                                     | `#plugins`, `#unknowns`          | D≠S / U | partly                        | ~~`antigravity_user.rs:120-129` (label only, no `LoadVerdict::Unknown`)~~ → a verdict now arrives via `scan_plugin_bundle`, but its `why` cites enablement, not the private tree | **no**                   | — **IMPLEMENTED-UNTESTED** (unchanged; `antigravity_user.rs` still asserts no `effective`)                                                                                                                                                                                                                          |
| A76 | Import is migration, not live reading; `import_manifest.json` is a record                                                                                                  | `#plugins`, `#cross-tool`        | D/S     | yes (omission)                | —                                                                                                                                                                                | yes                      | census — **CONFORMS**                                                                                                                                                                                                                                                                                               |
| A77 | Sidecars at `<config dir>/sidecars/<id>/sidecar.json` and plugin `sidecars/`                                                                                               | `#sidecars`                      | D/S     | no                            | —                                                                                                                                                                                | —                        | **NOT-IMPLEMENTED (silent)**                                                                                                                                                                                                                                                                                        |
| A78 | No workspace `.agents/sidecars` path is documented                                                                                                                         | `#sidecars`                      | D       | yes (omission)                | —                                                                                                                                                                                | yes                      | census — **CONFORMS**                                                                                                                                                                                                                                                                                               |
| A79 | The session `schedule` tool is ephemeral (U-12)                                                                                                                            | `#sidecars`                      | U-12    | —                             | —                                                                                                                                                                                | —                        | **N/A**                                                                                                                                                                                                                                                                                                             |
| A80 | CLI settings live in `~/.gemini/antigravity-cli/settings.json` with `keybindings.json` beside it                                                                           | `#settings`                      | D/S/O   | no                            | —                                                                                                                                                                                | —                        | **NOT-IMPLEMENTED (silent)**                                                                                                                                                                                                                                                                                        |
| A81 | The shared `~/.gemini/config/config.json` carries a single `userSettings` object                                                                                           | `#settings`                      | S/O     | no                            | —                                                                                                                                                                                | —                        | **NOT-IMPLEMENTED (silent)**                                                                                                                                                                                                                                                                                        |
| A82 | The 15 documented settings keys + `statusLine` + `copyOnSelect` + three `AGY_*` env overrides                                                                              | `#settings`                      | D/S     | no                            | —                                                                                                                                                                                | —                        | **NOT-IMPLEMENTED (silent)**                                                                                                                                                                                                                                                                                        |
| A83 | `--output-format` is invocation formatting; there is **no** output-style capability                                                                                        | `#settings`, `#installing`       | D       | yes (omission)                | —                                                                                                                                                                                | yes                      | census — **CONFORMS**                                                                                                                                                                                                                                                                                               |
| A84 | `conversations/`, `brain/`, `implicit/`, `knowledge/`, `jetski_state.pbtxt` are **not** authored capability roots                                                          | `#generated`                     | U / D/S | yes                           | `antigravity_user.rs:113-125` probes only `skills`/`agents`/`plugins`                                                                                                            | yes                      | `user_scan_aggregates…` exact set — **CONFORMS**                                                                                                                                                                                                                                                                    |
| A85 | Teamwork/battle coordination files inside `.agents/` (`ORIGINAL_REQUEST.md`, partition JSON, `segment_*/handoff_*.md`, `DISPATCH.md`) are runtime output, not capabilities | `#generated`                     | S       | yes                           | pinned by exclusion                                                                                                                                                              | yes                      | `opaque_literals_and_runtime_coordination_files_are_not_capabilities` (exact name list `["review-diff"]`) — **CONFORMS**                                                                                                                                                                                            |
| A86 | `cache/projects.json` is D-class generated state — enumerate, never parse                                                                                                  | `#generated`                     | D       | yes (omission)                | —                                                                                                                                                                                | yes                      | census — **CONFORMS**                                                                                                                                                                                                                                                                                               |
| A87 | Credentials are opaque; the file-store path is unpublished — never display it                                                                                              | `#generated`                     | D/S     | yes (omission)                | —                                                                                                                                                                                | yes                      | census — **CONFORMS**                                                                                                                                                                                                                                                                                               |
| A88 | There is **no** confirmed CLI semantic-memory contract                                                                                                                     | `#generated`                     | D       | yes                           | `instruction_sources.rs:370-372` (`reads_auto_memory` false)                                                                                                                     | yes                      | census — **CONFORMS**                                                                                                                                                                                                                                                                                               |
| A89 | `AGENTS.md` is shared with Codex, Copilot and OpenCode — **never** Claude Code                                                                                             | `#cross-tool`                    | D/S     | yes                           | `coding_agent.rs:892-897`                                                                                                                                                        | yes                      | `shared_surface_consumer_table`, `claude_never_consumes_agents_surfaces` — **CONFORMS**                                                                                                                                                                                                                             |
| A90 | `GEMINI.md` is read by Antigravity and Copilot only                                                                                                                        | `#cross-tool`                    | D/S     | yes                           | `instruction_sources.rs:277-282,227-252`                                                                                                                                         | yes                      | `shared_files_carry_exactly_the_agents_whose_table_names_them` — **CONFORMS**                                                                                                                                                                                                                                       |
| A91 | `.agents/skills/<n>/SKILL.md` is the **only** shared child of `.agents/`                                                                                                   | `#cross-tool`                    | D/S     | yes                           | `coding_agent.rs:849-852,886-891`; `claude_dir.rs:99-103`                                                                                                                        | yes                      | `project_agents_skills_carry_all_four_consumers` — **CONFORMS**                                                                                                                                                                                                                                                     |
| A92 | No automatic reader for `CLAUDE.md`, `.claude`, `.codex`, `.github`, `.opencode`, `opencode.json`                                                                          | `#cross-tool`                    | D/S/U   | yes                           | Antigravity appears in no `.claude`/`.codex` consumer set                                                                                                                        | yes                      | `claude_md_gives_presence_to_its_three_readers_not_to_codex_or_antigravity` — **CONFORMS**                                                                                                                                                                                                                          |
| A93 | `.antigravityignore` may be surfaced but must never be promised as honoured                                                                                                | `#cross-tool`, `#unknowns`       | S/U     | no (not surfaced)             | —                                                                                                                                                                                | —                        | **NOT-IMPLEMENTED (optional, silent)**                                                                                                                                                                                                                                                                              |
| A94 | The five-tier category order (workspace-discovered → workspace-declared → global-discovered → built-ins → global-declared)                                                 | `#precedence-table`              | S       | partly                        | `precedence_tables.rs:151-154` collapses it to `Project, User, Plugin`                                                                                                           | **no**                   | M20 survived — **IMPLEMENTED-UNTESTED** + missing tiers → SG                                                                                                                                                                                                                                                        |
| A95 | On a name conflict the higher-priority customization overrides the lower                                                                                                   | `#precedence-table`              | S       | yes                           | `coding_agent.rs:531`; `effective.rs:319-357`                                                                                                                                    | yes                      | `antigravity_precedence_stops_where_the_evidence_stops`; M24 — **CONFORMS**                                                                                                                                                                                                                                         |
| A96 | The per-capability **identity key** is unpublished — label the order as name-scoped only                                                                                   | `#precedence-table`, `#unknowns` | U       | partly                        | Configr keys on `component.name` (frontmatter, falling back to filename)                                                                                                         | yes                      | `antigravity_precedence_stops_where_the_evidence_stops` — **CONFORMS with caveat** (see §6)                                                                                                                                                                                                                         |
| A97 | The word "rule" is not portable across coding agents                                                                                                                       | `#cross-tool`                    | D       | —                             | —                                                                                                                                                                                | —                        | **N/A** (vocabulary)                                                                                                                                                                                                                                                                                                |
| A98 | `agy` has no `skill`, `mcp`, `hooks` or `schedule` subcommand                                                                                                              | `#plugins`                       | O/S     | —                             | —                                                                                                                                                                                | —                        | **N/A** (CLI surface Configr does not drive)                                                                                                                                                                                                                                                                        |

_(Antigravity total after merging sub-rows: 73 distinct claims.)_

---

## 5. Mutation-proof results

31 mutations, applied one at a time to a scratchpad copy, each followed by a full
`cargo test --workspace --no-fail-fast` and then reverted. **24 caught, 7
survived.** Plus 2 behavioural probes.

### Caught (24)

| ID  | Mutation                                                                      | Failing tests                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | Copilot skill order `[Project,Inherited,User,Plugin]` → `[User,Project,…]`    | `copilot_orders_skills_project_first_and_agents_user_first`, `copilot_keeps_the_project_skill_but_the_personal_agent`                                                  |
| M02 | Copilot `mcp` precedence `LastLoadedWins` → `FirstLoadedWins`                 | `copilot_precedence_runs_in_three_directions_at_once`, `ancestor_precedence_runs_in_opposite_directions`                                                               |
| M05 | `PROJECT_MCP_FILES` order reversed                                            | `one_directory_contributes_only_its_first_mcp_file`, `project_cards_cover_the_cli_files_and_label_the_editor_one`                                                      |
| M06 | Remove the `break` so a directory contributes **both** MCP files              | same 2                                                                                                                                                                 |
| M07 | Drop the `.vscode/mcp.json` migration note                                    | +`copilot_fixture_census_counts_names_and_triggers`, `project_scan_reads_the_vscode_servers_key` (3)                                                                   |
| M08 | Remove `extraKnownMarketplaces` from the 5-key `.claude` settings subset      | `copilot_reads_five_keys_of_claude_settings_and_no_more`                                                                                                               |
| M09 | Remove Copilot from `SharedSurface::ClaudeCommands`                           | `project_claude_skills_carry_three_consumers`, `inherit_fixture_inherited_capabilities_census`, `acme_fixture_payments_api_inherited_shadow_chain`                     |
| M12 | Copilot hook enumerator: recursive `**/*.json` → flat                         | **6 tests** incl. both census files                                                                                                                                    |
| M13 | Drop `_agent` from Antigravity's four spellings                               | **4 tests** incl. 2 census                                                                                                                                             |
| M14 | Move `Stop` into Antigravity's grouped `TOOL_EVENTS`                          | `only_the_two_tool_events_render_a_matcher`, `antigravity_fixture_disabled_hook_and_server_stay_surfaced`                                                              |
| M15 | Antigravity `skills_require_skill_md` → false                                 | `antigravity_skills_must_be_folders_with_a_skill_md`, `a_loose_markdown_file_under_skills_is_not_a_skill`                                                              |
| M16 | Antigravity required frontmatter `["name","description"]` → `["description"]` | `a_skill_missing_a_required_frontmatter_field_says_so`                                                                                                                 |
| M17 | Delete the workflow `LoadVerdict::Unknown`                                    | `workflows_are_listed_as_slash_commands_with_an_unsettled_location`                                                                                                    |
| M18 | Declared relative paths resolve from `home` instead of the repository root    | **5 tests** incl. 3 census                                                                                                                                             |
| M19 | Ignore the `exclude` regex filter                                             | **5 tests** incl. 3 census                                                                                                                                             |
| M23 | Copilot `skills_require_skill_md` → true (**the guide's answer**)             | `antigravity_skills_must_be_folders_with_a_skill_md` — _only the wrong assertion_                                                                                      |
| M24 | Antigravity `hook`/`mcp` precedence `Unknown` → `FirstLoadedWins`             | `antigravity_precedence_stops_where_the_evidence_stops`                                                                                                                |
| M25 | Copilot `instruction` precedence `AllApply` → `RankedByScope`                 | 3 tests incl. `copilot_instructions_all_apply`                                                                                                                         |
| M26 | Drop the workflow path note from the description                              | `workflows_are_listed_as_slash_commands_with_an_unsettled_location`                                                                                                    |
| M27 | Collapse Antigravity's alternate-root namespacing                             | **4 tests** incl. 2 census                                                                                                                                             |
| M28 | Drop the `~/.agents/skills` personal tier from the Copilot user scan          | `personal_agents_skills_are_scanned_after_the_copilot_root_and_deduped`                                                                                                |
| M29 | Drop the built-in `github-mcp-server` tier                                    | **4 tests** in `mcp_copilot`                                                                                                                                           |
| M31 | Give Antigravity **the guide's** ancestor instruction walk                    | `only_claude_and_opencode_read_ancestors`, `agents_that_never_look_upwards_inherit_nothing` — _both defend the gap_. **Landed in `3f933432`**; both tests were deleted |
| M32 | Break the `model_decision` rule-activation arm                                | `each_published_trigger_value_says_what_it_does`                                                                                                                       |

### Survived (7) — these are the IMPLEMENTED-UNTESTED rows

| ID      | Mutation                                                                     | Consequence if it shipped                                                                                   |
| ------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **M03** | Copilot ancestor `types: &["skill","agent"]` → `&["skill"]`                  | An ancestor `.github/agents` / `.claude/agents` silently disappears from every monorepo project.            |
| **M04** | Copilot ancestor ceiling `Repository` → `HomeOrWidenedRepository`            | Copilot's walk climbs past the repository root to `$HOME`, inventing inherited capabilities.                |
| **M10** | Copilot prompt `LoadVerdict::NotLoaded` → `Loaded`                           | A **proven negative at binary strength** is rendered as a live CLI capability.                              |
| **M11** | Delete a key from `REPOSITORY_SUPPORTED_KEYS`                                | A valid repository key is reported as "silently ignored".                                                   |
| **M20** | Antigravity category order `[Project,User,Plugin]` → `[Plugin,User,Project]` | A global skill silently beats the workspace one — the exact inversion the category order exists to prevent. |
| **M21** | Delete the Antigravity `mcp` unknown citation                                | The card falls back to a generic "no primary evidence" string, losing the guide reference.                  |
| **M22** | Delete the workspace `mcp_config.json` `LoadVerdict::Unknown` branch         | A **documented-only** location is presented as verified.                                                    |

### Behavioural probes (2)

| ID     | Probe                                                                                                                       | Result                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **P1** | Copilot `.github/skills/no-skill-md/notes.md` (no `SKILL.md`) and `.github/skills/no-frontmatter/SKILL.md` (no frontmatter) | Both emitted as skills, no note, no verdict → **TW-1**                    |
| **P2** | Antigravity `.agents/commands/ship.md`                                                                                      | Emitted as `("command","ship","Ship it")`, no note, no verdict → **BS-1** |

---

## 6. Two borderline rows I decided **not** to call defects

Stated so the owner can overrule me.

1. **A22 / A96 — Antigravity resolves `rule`, `skill`, `agent` and `plugin`
   name collisions as `FirstLoadedWins`, while the guide keeps the _identity key_
   at `U`.** The guide does settle same-**name** conflicts through the category
   order ("the higher-priority customization overrides the lower-priority one"),
   and it says explicitly that "duplicate names, once identity is known, resolve
   by this order". Configr keys on `component.name` (frontmatter, falling back to
   filename) — a choice the guide calls unpublished, but one a browser cannot
   avoid making. The mitigating fact is that Configr's Antigravity model has no
   ancestor walk, so the _same-level_ collision the guide's U really covers
   ("two `.agents/rules/lint.md` files at different levels") can never be
   produced. If the walk in TW-3 is ever implemented, this row must be
   re-examined: it would start resolving a collision the guide forbids resolving.

   > **Re-examined at `eecc1fe8`, and the row stands.** TW-3 landed in
   > `3f933432`, but the new walk carries `rules_dir: None`
   > (`instruction_sources.rs:476`) — `.agents/rules/` are progressive-disclosure
   > capabilities with their own cards, not ancestor instruction files — and
   > Antigravity is still absent from `ancestor_capabilities`
   > (`only_three_agents_walk_upwards_for_capabilities` asserts
   > `["claude", "copilot", "opencode"]`). No rule, skill or agent of one name
   > can be produced at two levels, so `A22`/`A96` are unaffected.

2. **C55 — Copilot's agent dedup is "by ID" while skills dedup "by name", and
   Configr uses one identity (`component.name`) for both.** The guide draws the
   distinction but never defines the agent ID. Treating the frontmatter `name`
   as the ID is the only defensible reading available; flagging it would be
   inventing a defect.

---

## 7. What would it take to close the gaps

Ordered by value per unit of work.

### Tier 1 — correctness defects (small, high value)

> **Items 1 and 4 landed in `3f933432`.** BS-1 was fixed with exactly the gate
> proposed in item 1. TW-3 was fixed as part of a five-agent redesign rather
> than a single `InheritedMemory` literal, so the stop and the class rule became
> two typed fields (`InstructionCeiling`, `ClassRange`) shared by all five
> coding agents. **Items 2 and 3 (TW-2 and TW-1) have not landed.**

1. **Fix BS-1** — gate the `commands` entry in
   `scanner/claude_dir.rs:163-168` the way `hooks` is already gated:
   `component_type != "command" || agent.is_none_or(|a| a.commands_dir() == "commands")`.
   Add one test mirroring `a_hooks_directory_is_not_a_hook_source`. **~10 lines.**
2. **Fix TW-2** — give the user-scope `.agents/skills` its own consumer set
   (`["codex","copilot","opencode"]`) rather than reusing the project-scope
   `SharedSurface::AgentsSkills`. Either add a `UserAgentsSkills` variant or
   filter Antigravity out at `scanner/copilot.rs:426`. Update the assertion at
   `scanner/copilot.rs:875-879`. **~15 lines.**
3. **Fix TW-1** — set `skills_require_skill_md()` to `true` for Copilot, make
   `scanner/copilot.rs:268` require `SKILL.md`, and port
   `note_skill_frontmatter` (Antigravity's `name`/`description` check) to
   Copilot. Update `coding_agent.rs:1086`. Expect the `only-copilot` census to
   need no change (all three fixture skills have `SKILL.md`). **~30 lines.**
4. **Fix TW-3** — give Antigravity
   `InheritedMemory { classes: &[&["AGENTS.md", "GEMINI.md"]], rules_dir: None, stop_at_repository_root: true }`,
   replace the stale website-derived doc comment with the manual citation, and
   change the two assertions to `["antigravity","claude","opencode"]` /
   drop Antigravity from the never-look-upwards loop. Then re-check row A22.
   **~25 lines + fixture work.**

### Tier 2 — pin what is already right (7 mutations to kill)

5. Assert the **verdicts**, not just the notes: add
   `assert!(matches!(prompt.effective[0].verdict, LoadVerdict::NotLoaded{..}))`
   to the Copilot census (kills M10) and the equivalent `Unknown` assertion to
   `mcp_config_yields_per_server_components_including_disabled` (kills M22).
   This is the single highest-leverage change in the report — **~6 lines** and it
   closes the systematic blind spot.
6. Add one Copilot ancestor-walk test: `collect_inherited_components(&project,
CodingAgent::Copilot, Some(&home))` over a fixture with
   `<parent>/.github/agents` and `<grandparent-above-repo>/.github/skills`,
   asserting the agent is picked up and the above-repo one is not. Kills M03 and
   M04. **~30 lines.**
7. Assert the Antigravity source order explicitly in
   `antigravity_precedence_stops_where_the_evidence_stops` (kills M20) and the
   `unresolved_precedence` citations (kills M21). **~8 lines.**
8. Assert `REPOSITORY_SUPPORTED_KEYS.len() == 14` and the exact array (kills
   M11). **~3 lines.**

### Tier 3 — the silent gaps, prioritised

The 58 silent gaps are not equal. In rough order of how likely each is to make
the browser say something false:

> **Since `3f933432`, three rows of this table have changed.** They are struck
> in place below; the priority ordering of the rest is unchanged.

| Priority          | Gap                                                                 | Why                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~High~~ → Medium | Antigravity **plugin enablement** in `~/.gemini/config/config.json` | ~~A disabled plugin is shown as enabled today — a wrong effective answer, not a missing one.~~ → the app now says "unknown" instead of "enabled", so this is a missing answer, not a wrong one.                                                                    |
| High              | Antigravity **declared-source tier** ranking                        | Declared skills currently rank equal to discovered ones; the category order says they rank below. Needs a `CapabilitySource::Declared`.                                                                                                                            |
| High              | Copilot **policy hooks** `/etc/github-copilot/policy.d`             | Hooks that cannot be disabled are invisible; the security-relevant tier is the one missing.                                                                                                                                                                        |
| ~~High~~ → Medium | Copilot **folder-trust gate** on the MCP walk                       | ~~Configr reports ancestor MCP servers the CLI would refuse to load.~~ → it still reports them, but every one declared above the working directory now says the ascent may not have reached it.                                                                    |
| ~~Medium~~ → Low  | Copilot **HTTP hook handler** shape                                 | ~~Surfaces as `inline:<n>` with no URL — a hook that exfiltrates env vars is shown as a nameless blob.~~ → the card is now named after the endpoint host. What remains is the unread `allowedEnvVars` list, so the card names the destination but not the payload. |
| Medium            | Copilot **PascalCase/VS Code hook shapes**                          | The guide's own warning: mixing spellings is what a migrating team produces.                                                                                                                                                                                       |
| Medium            | Copilot plugin **bundle contents** (agents/skills/commands/hooks)   | Plugins are carded but empty.                                                                                                                                                                                                                                      |
| Medium            | Antigravity **built-in skills** tier                                | Tier 4 of the published category order is absent.                                                                                                                                                                                                                  |
| Medium            | Antigravity **CLI settings file** + shared `config.json`            | Whole settings surface missing for one of five coding agents.                                                                                                                                                                                                      |
| Low               | Copilot LSP, extensions, marketplaces, sandbox, `statusLine`        | Whole unbuilt features. Fine to defer — but **write the deferral down**, which is the difference between the 5 documented deferrals and the 58 silent ones.                                                                                                        |
| Low               | Antigravity sidecars, agent/hook/MCP frontmatter breadth            | Same.                                                                                                                                                                                                                                                              |

### Tier 4 — process

9. **Adopt a deferral convention.** The 5 documented deferrals in this scope
   (Copilot's remote agent tier, ODR, hosted memory, `~/.gemini/skills`,
   `~/.gemini/settings.json`) each carry a code comment naming the reason. The
   other 58 do not. A one-line `// NOT SCANNED: <guide anchor> — <reason>`
   convention at the relevant scanner would turn 58 unknowns into 58 decisions,
   and would have made this audit take a fraction of the time.
10. **Add a `LoadVerdict` lint to the census tests.** Every card that carries an
    `EffectiveState` should have that state asserted somewhere. Three of the
    seven surviving mutations were the same omission; a mechanical check would
    catch the fourth before it happens.
