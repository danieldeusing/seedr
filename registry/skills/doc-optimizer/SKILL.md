---
name: doc-optimizer
description: 'Iteratively evaluate and improve technical documentation through autonomous test-score-refine loops with deterministic codebase verification. Reads target docs (API docs, guides, READMEs, tutorials, reference docs), builds a frozen evaluation harness combining deterministic verifiers (examples compile, import paths exist, API references match, links resolve) with LLM-judged criteria (accuracy, completeness, sequencing, example quality, audience fit), then loops - score, improve the weakest area, re-score, keep if better or revert. Use whenever the user says "optimize docs", "improve documentation", "review these docs", "doc-optimizer", "run doc-optimizer on [file]", "check my API docs", "verify documentation", or wants to improve technical documentation. Also trigger for stale code references, broken examples, missing API docs or inaccurate documentation. Do NOT use for PRDs or requirements documents (use prd-optimizer), architecture docs (use architecture-optimizer) or code (use code-optimizer).'
---

# Doc Optimizer

Iteratively evaluate and improve technical documentation through autonomous test-score-refine loops, combining deterministic codebase verification with LLM-judged quality criteria.

Each round: run deterministic verifiers against the live codebase, score LLM criteria against a frozen harness, identify the weakest area, make one targeted improvement, re-score, keep if improved, revert if not.

## How This Works (Mental Model)

**Deterministic verifiers** check documentation claims against the actual codebase. Code examples are extracted and run. Import paths are grepped. API endpoints are matched against route definitions. Function signatures in docs are compared to real signatures. These produce exact, reproducible results — the code either exists or it doesn't.

**LLM-judged criteria** cover what machines can't verify mechanically: sequencing, example minimality, audience match. These use anchored 1-5 rubrics to minimize scoring variance, the same approach as sibling optimizer skills.

Deterministic checks act as **hard constraints** — if a change breaks a working code example, it's auto-reverted regardless of LLM score improvement. You can't trade correctness for prose quality.

## Phase 1: Setup

### 1. Identify Target Documentation

Read all target files and understand: what the docs cover, the associated codebase location, doc format (Markdown, RST, AsciiDoc, JSDoc source), and line counts.

**Scope:** "optimize this file" = only that file is mutable. "optimize the docs folder" = all doc files are mutable. Source code is read-only context (except JSDoc/docstring source annotations — see Special Rules).

### 2. Locate the Codebase

Find the associated codebase: look for `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod` near the docs. Check if docs are in a `docs/` subfolder. If no codebase found, log a warning and use `skip-deterministic` mode automatically.

### 3. Create Working Directory

```
doc-optimizer-{doc-name}/
  original/    working/    backup/    harness.md    results.json    dashboard.html
```

Copy target files to `original/` and `working/`. Initialize `results.json`:

```json
{
  "document": "doc-name", "files": [], "codebasePath": "",
  "startedAt": "", "harness": "harness.md", "harnessBuiltAt": "",
  "baseline": null, "baselineLlmChecks": null, "currentScore": null, "bestScore": null,
  "consecutiveHighPasses": 0, "rounds": []
}
```

## Phase 2: Build or Validate Harness

The harness is the frozen evaluation function. It lives in `harness.md`.

### If a harness already exists:

Compare against current doc/codebase state. If unchanged — reuse it. If changed — alert user with specifics, then rebuild. Scores from rebuilt harness are NOT comparable to previous runs.

### Building a new harness:

Generate `harness.md` containing: Deterministic Verifiers section, LLM-Judged Criteria section, Composite Scoring rules, Special Rules, Output Format. Header must include frozen timestamp, document name, codebase path, and "DO NOT MODIFY DURING A RUN".

### Deterministic Verifiers

Scan docs for all instances of each type. Only include types with at least one instance.

**Code examples:** Extract fenced code blocks. Record location, language, runnable vs snippet, run command, baseline result.

**Import/module references:** Grep docs for import/require/use statements. Verify module paths exist in codebase.

**API endpoint references:** Find URL patterns (GET /api/users). Grep codebase for matching route definitions.

**Symbol references:** Find function/class/type names in docs. Grep codebase to verify existence and signatures.

**Internal links:** Find relative links between doc files. Verify targets exist.

**Version references:** Compare version numbers in docs against package.json/Cargo.toml/pyproject.toml.

**CLI commands:** Find shell commands. Verify with `--help` or `--dry-run` where safe.

Hard constraints: runnable examples must stay runnable, resolved links must stay resolved, existing symbol references must persist. If a verifier type has zero instances, omit it.

### LLM-Judged Criteria

**Accuracy against codebase:**
```
5 — Every code reference, endpoint, param name, return type matches actual codebase. No stale references.
4 — Mostly current. 1-2 slightly outdated references.
3 — 3-5 places where signatures/params don't match current code. Core concepts correct.
2 — Multiple sections reference significantly changed code.
1 — Describes a different version of the software. Most references stale.
```

**Completeness:**
```
5 — All public APIs documented. Every parameter, return type, error condition described.
4 — Most public APIs documented. 1-2 functions/endpoints missing.
3 — Major APIs documented. Some secondary functions/error conditions missing. ~70% coverage.
2 — Only common APIs documented. Many public symbols undocumented.
1 — Small fraction of public API covered. Engineers must read source for most things.
```

**Sequencing and prerequisites:**
```
5 — Logical flow. Prerequisites before dependents. No undefined terms. Quick-start before advanced.
4 — Mostly correct. 1-2 concepts used before defined.
3 — Some ordering issues. A few sections assume unintroduced knowledge.
2 — Significant ordering problems. Undefined concepts frequent.
1 — No logical flow. Random topic order.
```

**Example quality:**
```
5 — Every concept has a runnable example. Common case first, then edge cases. Minimal, copy-paste friendly.
4 — Most concepts have examples. 1-2 could be simpler.
3 — Some sections have examples, others don't. Existing ones sometimes overcomplicated.
2 — Few examples, sometimes overly complex.
1 — Virtually no examples.
```

**Audience appropriateness:**
```
5 — Language matches intended audience. Jargon appropriate or defined on first use.
4 — Mostly appropriate. 1-2 sections mismatch audience level.
3 — Mixed. Unexplained jargon in 3-5 places.
2 — Audience unclear. Technical depth varies wildly.
1 — No apparent target audience.
```

### Composite Scoring

1. **Deterministic gate**: ANY hard constraint violated = auto-revert. No LLM score overrides this.
2. **LLM score**: Average of criteria, normalized: `(avg - 1) / 4 * 100`.
3. **Deterministic bonus**: stale ref fixed +1, broken link fixed +1, code example made runnable +2, symbol ref corrected +0.5.
4. **Composite**: LLM percentage + deterministic bonus, capped at 100%.

### Special Rules

- **Always verify against the ACTUAL codebase** before scoring accuracy. Read source and check.
- **Auto-generated docs** (JSDoc output, Swagger, typedoc): Score source annotations. Improve the source.
- **Fixing stale references**: READ THE CURRENT CODE for the right signature. Don't guess.
- **READMEs**: Focus on quick-start accuracy. Don't score like an API reference.
- **Changelogs/release notes**: Skip. Historical records, not docs to optimize.
- **Deleted code references**: Remove the reference, don't speculate about replacements. Log for review.
- **Multi-file docs**: Changes spanning files must be atomic. Score as one unit.
- **Pure prose changes**: Deterministic checks must produce identical results. Any regression = auto-revert.

**Parameters:**
- `focus:<criterion>` — only include specified LLM criteria
- `skip-deterministic` — LLM criteria only (for docs without a nearby codebase)
- `max-rounds:<N>` — override default 15-round limit
- `mode:audit` — score only, don't modify
- `audience:<type>` — calibrate audience scoring (beginner, intermediate, expert, api-reference)

## Phase 3: Baseline Scoring

**Who scores.** Score the LLM-judged criteria in a fresh-context subagent, here and in every round of Phase 4. It receives only the target doc files as they now stand, the codebase path and the frozen `harness.md`. It never receives your change note or hypothesis, because an agent that knows what a change was meant to fix grades it kindly. Keep or revert on its scores. Deterministic verifiers run in your own context. Where the agent has no subagents, score in your own context and say so in the final report.

Run all deterministic verifiers and record results. The scoring subagent scores all LLM criteria with anchored rubrics — record score + one-line evidence per criterion.

**Prove each criterion can fail (new harness only).** Before the harness freezes, have the scoring subagent score one deliberately weakened copy of the docs, made in the working directory and never in the project files: the baseline with the section each criterion scored best on removed. Drop any criterion whose score does not fall, because it cannot tell better from worse, and remove it from `harness.md`.

Calculate composite baseline. Report deterministic results, LLM scores, and weakest area. Update `results.json` with `baseline` and `baselineLlmChecks`, the LLM scores in the shape of a round's `llmChecks`, e.g. `{"Accuracy against codebase": 3, "Completeness": 4}`. Then update `dashboard.html`.

## Phase 4: Improvement Loop

Repeat autonomously until convergence or max rounds.

Between rounds, do not stop to summarise, ask whether to continue, or offer options; the one-line round report goes out with the next round, not instead of it. The loop ends only at the convergence, max-rounds or plateau stop in *Stopping Rules*, or at a deterministic check you cannot restore. Then go to Phase 5.

**1. Pick target** — Weakest area. Priority: deterministic failures first (broken examples > stale refs > broken links), then lowest LLM criterion. Ties: pick most impactful.

**2. Classify fix:**

| Fix Type | Autonomy |
|----------|----------|
| Fix stale code reference | Apply freely (verify against actual code first) |
| Fix broken link | Apply freely |
| Add code example | Apply freely |
| Reorder for prerequisites | Apply freely |
| Update version number | Apply freely |
| Add docs for undocumented API | Apply freely (read source code first) |
| Remove reference to deleted code | Apply freely, log what was removed |
| Change target audience / restructure fundamentally | Skip, log as "needs human decision" |

**3. Apply** — Copy `working/` to `backup/`. Apply ONE change to the actual doc files (not working copies). Minimal, traceable to a specific harness check.

**4. Run deterministic verifiers** — Hard constraint violated? Auto-revert from `backup/`. Log as `REVERTED (hard constraint: {which})`. Skip LLM scoring.

**5. Score LLM criteria** — The scoring subagent (*Who scores*, Phase 3) re-reads the modified docs and scores all criteria with the frozen rubrics.

**6. Compare** — Improved: keep, update `working/`, delete `backup/`. Same or worse: revert from `backup/`.

**7. Record** — Append round to `results.json` with: round number, score, previousScore, deterministic results, llmChecks, targetedArea, targetedBefore/After, change description, location, kept boolean, hardConstraintViolation.

**8. Update dashboard** and report one line: `Round N: XX% (was YY%) [KEPT/REVERTED] — change description`

### Stopping Rules

- **Convergence**: 90%+ on 3 consecutive rounds.
- **Max rounds**: 15 (or `max-rounds` param).
- **Plateau**: 3 consecutive no-improvement rounds — switch strategy (references to examples, examples to reordering). If stuck at 3-4 on LLM criteria, log as local optimum and stop.
- **One change per round.** Never batch.
- **Dimension rotation**: 2 rounds targeting same criterion with no improvement — move to next-weakest.

## Phase 5: Completion

1. Ensure improved docs are in actual project files. Save final state to `working/`.
2. Print final report: target files, rounds (kept/reverted), deterministic before/after, LLM criteria before/after, composite before/after, list of kept changes, removed stale references log, remaining items needing human decision.
3. Clean up: remove `backup/` directory.

## Dashboard

`dashboard.html` in the working directory is a self-contained page that reloads every 10 seconds. It shows the composite score, the baseline, the counts of rounds, kept and reverted changes, a score-history bar chart, a Deterministic Verifiers table (first round against latest round), the latest LLM criterion scores, a Criteria Trajectory table (baseline against the last kept round) and the changelog, where a hard revert names its constraint.

It reads these `results.json` fields: `document`, `baseline`, `currentScore`, `baselineLlmChecks`, and per round `score`, `kept`, `deterministic`, `llmChecks`, `targetedArea`, `change` and `hardConstraintViolation`. Write `deterministic` as one object per verifier type, each with `total` and a count field named `valid`, `runnable`, `matched`, `found` or `resolved`, because the table reads the first of those it finds.

Copy this skill's `assets/dashboard.html` (next to this SKILL.md) into the working directory, unchanged. Each round, rewrite `dashboard.html` from that asset with `{doc-name}` in the `<title>` replaced by the document name and `__OPTIMIZER_DATA__` replaced by the current `results.json` content.

## Modes

**Full (default)** — Setup, harness, baseline, improvement loop, completion.

**Audit only** — Phase 1-3 only. Score, report findings, don't modify.

**Deterministic only** — Run verifiers only. Skip LLM criteria. Quick staleness check.

**Focused** — Only specified LLM criteria. Deterministic hard constraints still apply.

**Watch** — Re-run all verifiers and re-score. Update dashboard. No modifications.
