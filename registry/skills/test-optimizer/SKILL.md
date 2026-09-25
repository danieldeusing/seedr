---
name: test-optimizer
description: 'Iteratively evaluate and improve test suites through autonomous test-score-refine loops. Reads target test files, detects project tooling (test runner, coverage tool, mutation tester), builds a frozen evaluation harness combining deterministic verifiers (coverage, mutation score, pass rate, execution time) with LLM-judged criteria (naming clarity, assertion quality, edge case coverage, isolation, DRY-ness), then loops - score, improve the weakest area, re-score, keep if better or revert. Pairs with code-optimizer - run test-optimizer first to strengthen the safety net, then code-optimizer. Use whenever the user says "optimize tests", "improve tests", "strengthen tests", "test-optimizer", "run test-optimizer on [file/module]", "improve test coverage", "improve test quality", "make these tests better", "harden the test suite", or wants to improve test quality. Also trigger to increase coverage, add edge case tests, improve assertions, reduce duplication or improve test naming.'
---

# Test Optimizer

Iteratively improve test suites through autonomous test-score-refine loops, combining deterministic verifiers with LLM-judged quality criteria.

Each round: run tests and coverage, score LLM criteria against a frozen harness, identify the weakest area, make one targeted improvement, re-score, keep if improved, revert if not.

## How This Works (Mental Model)

**Deterministic verifiers** produce exact, reproducible numbers. Tests pass or fail. Coverage reports a percentage. Mutation testing reports a kill rate.

**LLM-judged criteria** cover what machines can't count: Are test names descriptive? Do assertions check the right things? Are edge cases covered? These use anchored 1-5 rubrics to minimize scoring variance.

The harness combines both into a single score, but deterministic checks act as **hard constraints** — if a change causes previously-passing tests to fail or coverage to decrease, it's auto-reverted regardless of LLM score improvements.

**Pairs with code-optimizer:** Run test-optimizer first to build a strong safety net, then code-optimizer to improve the production code with confidence.

## Phase 1: Setup

### 1. Identify Target Tests

Read all target test files and the code they test. Understand what the tests cover, language/framework/test runner, current test count, and which production code they exercise.

**Scope boundaries:** Only test files are mutable. Production code is read-only context — never modify it.

### 2. Detect Project Tooling

| Tool Type | Detection | Example |
|-----------|-----------|---------|
| Test runner | test config, `package.json` scripts, `pytest.ini`, `Cargo.toml` | `npm test`, `pytest`, `cargo test` |
| Coverage | coverage config, nyc, c8, istanbul, coverage.py, `--coverage` flag | `npm test -- --coverage`, `pytest --cov` |
| Mutation tester | stryker, mutmut, cargo-mutants config | `npx stryker run`, `mutmut run` |
| Linter | `.eslintrc`, `ruff.toml`, test-specific lint rules | `eslint tests/`, `ruff check tests/` |

For each tool found, verify it runs, record the exact command, parse method, and baseline result. If no coverage tooling exists, attempt `--coverage` flag; if that fails, proceed with pass/fail only.

### 3. Create Working Directory

```
test-optimizer-{target-name}/
  original/     # backup of original test files (never modified)
  working/      # working copies (modified each round)
  backup/       # previous version of working/ (for revert)
  harness.md    # frozen evaluation harness
  results.json  # score history
  dashboard.html
```

Copy target test files to both `original/` and `working/`. Initialize `results.json`:

```json
{
  "target": "target-name",
  "files": ["tests/auth.test.ts"],
  "startedAt": "ISO timestamp",
  "harness": "harness.md",
  "harnessBuiltAt": "ISO timestamp",
  "tooling": {"testRunner": "npm test", "coverage": "npm test -- --coverage", "mutationTester": null},
  "baseline": null, "baselineLlmChecks": null, "currentScore": null, "bestScore": null,
  "consecutiveHighPasses": 0, "rounds": []
}
```

## Phase 2: Build or Validate Harness

The harness is the frozen evaluation function. It lives in `harness.md`.

### If a harness already exists:

Compare against current state (test files changed? production code changed? tooling changed? criteria still apply?). If unchanged, reuse: `Harness validated — reusing existing harness. Scores are comparable.` If changed, alert with specifics and rebuild.

### Building a new harness:

Generate `harness.md` containing: deterministic verifier sections (command, parse method, baseline, hard constraint) for each detected tool, LLM criteria with anchored rubrics, composite scoring rules, special rules, and output format.

### Deterministic Verifiers

Hard constraint rules:
- **Test pass rate**: All previously-passing tests must still pass. New tests must also pass.
- **Coverage**: Line and branch coverage must not decrease.
- **Mutation score**: If available, kill rate must not decrease.
- **Execution time**: Tracked but not a hard constraint by default. With `performance` parameter, must not increase >10%.

If a tool wasn't found, omit its section.

### LLM-Judged Criteria

Pick 3-5 based on what the test suite actually needs. Read tests first, identify real weaknesses.

**Test naming clarity:**
```
5 — Every test name describes the behavior being tested. Reading the name alone tells you what broke. Pattern: "should [behavior] when [condition]".
4 — Most names descriptive. 1-2 use generic names like "test1" or "works correctly".
3 — Mixed. Reader needs to read the test body for ~half of them.
2 — Most names are generic ("testAuth", "handleError"). Names don't help diagnose failures.
1 — Names are meaningless ("test1", "foo"). Test report useless without reading every body.
```

**Assertion quality:**
```
5 — Every assertion checks a specific expected value. No bare assertTrue/assertTruthy on complex objects. Error messages explain what was expected.
4 — Mostly specific. 1-2 use assertTrue where a specific value check would be clearer.
3 — Mix of specific and vague. Some tests just check "not null" or "is truthy" where a precise check is warranted.
2 — Many assertions weak (assertTrue(result), expect(output).toBeTruthy()). Tests can pass when behavior is wrong.
1 — Assertions mostly absent, trivial, or tautological. Tests prove almost nothing.
```

**Edge case coverage:**
```
5 — Boundary values, empty inputs, null/undefined, error paths, and concurrent scenarios all tested where applicable.
4 — Most obvious edge cases covered. 1-2 boundary conditions or error paths missing.
3 — Happy path well-tested. Some error paths tested. Boundary values partially covered.
2 — Mostly happy-path. Error paths largely untested. No boundary value tests.
1 — Only the simplest happy path. No edge cases, error paths, or boundary conditions.
```

**Test isolation:**
```
5 — Each test independent. No shared mutable state. Tests run in any order. Setup/teardown explicit and contained.
4 — Mostly independent. 1-2 share state through before/afterAll that could cause ordering issues.
3 — Some tests depend on execution order or shared mutable state.
2 — Multiple tests share state. Running a subset produces different results than running all.
1 — Tests deeply coupled. Commenting out one breaks others. Global state everywhere.
```

**Test DRY-ness / helper usage:**
```
5 — Common setup and assertions use well-named helpers. Test bodies focus on what's being tested. No copy-paste.
4 — Most common patterns extracted. 1-2 instances of duplicated setup.
3 — Some duplication. 3-5 tests have near-identical setup or assertion blocks.
2 — Significant copy-paste. Many tests repeat the same 5+ lines of setup.
1 — Every test is a standalone copy-paste blob. No helpers or shared setup.
```

### Special Rules

- **Adding new tests is the primary improvement strategy.**
- **A new test MUST pass.** A new failing test is unfinished work — auto-revert.
- **Removing a test is only valid if** coverage doesn't decrease AND the test was genuinely redundant.
- **Snapshot tests**: Don't count snapshot coverage as "real" coverage. Score based on non-snapshot assertion quality.
- **Integration vs unit**: Don't penalize for mixing levels. Score what exists.
- **Production code is read-only.** If a test can't be written without changing production code, log as "needs human decision".
- **Multi-file changes**: All files updated atomically when extracting shared helpers.

### Composite Scoring

1. **Deterministic gate**: ANY hard constraint violated = auto-revert.
2. **LLM score**: Average of all criteria, normalized: `(avg - 1) / 4 * 100`.
3. **Deterministic bonus**: +1 per 1% coverage increase, +1 per 1% mutation score increase, +0.5 per new passing test.
4. **Composite**: LLM percentage + deterministic bonus, capped at 100%.

### Output Format

Every scoring round produces a deterministic results table (verifier, result, baseline, status), an LLM criteria table (criterion, score, one-line evidence), and a composite line: `## Composite: 74% (was 68%) — KEEP`

**Parameters** (optional):
- `focus:<criterion>` — only include specified LLM criteria
- `max-rounds:<N>` — override default 15-round limit
- `mode:audit` — score only, don't modify tests
- `coverage-target:<N>` — override default coverage target
- `performance` — add execution time as a hard constraint

## Phase 3: Baseline Scoring

**Who scores.** Score the LLM-judged criteria in a fresh-context subagent, here and in every round of Phase 4. It receives only the target test files as they now stand, the production code they exercise and the frozen `harness.md`. It never receives your change note or hypothesis, because an agent that knows what a change was meant to fix grades it kindly. Keep or revert on its scores. Deterministic verifiers run in your own context. Where the agent has no subagents, score in your own context and say so in the final report.

1. Run all deterministic verifiers. Record baselines in `results.json`.
2. The scoring subagent reads all target test files and scores each LLM criterion with anchored rubrics. Record score + one-line evidence.
   - **Prove each criterion can fail (new harness only).** Before the harness freezes, have the scoring subagent score one deliberately weakened copy of the tests, made in the working directory and never in the project files: the baseline with the tests each criterion scored best on removed. Drop any criterion whose score does not fall, because it cannot tell better from worse, and remove it from `harness.md`.
3. Calculate composite baseline. Report baseline %, deterministic metrics, per-criterion scores, and weakest area.
4. Update `results.json` with `baseline` and `baselineLlmChecks`, the step 2 scores in the shape of a round's `llmChecks`, e.g. `{"Test naming clarity": 3, "Assertion quality": 2}`. Then update `dashboard.html`.

## Phase 4: Improvement Loop

Repeat autonomously until convergence or max rounds.

Between rounds, do not stop to summarise, ask whether to continue, or offer options; the one-line round report goes out with the next round, not instead of it. The loop ends only at the convergence, max-rounds or plateau stop in *Loop Rules*, or at a deterministic check you cannot restore. Then go to Phase 5.

### Each Round

**1. Pick the target** — weakest area. Priority: deterministic issues first, then lowest LLM criterion, then most impactful if tied.

**2. Hypothesize** — ONE targeted change:
- Add a test for an uncovered branch (guided by coverage report)
- Replace a weak assertion with a specific value check
- Rename a test to describe the behavior
- Split a multi-concern test into focused single-assertion tests
- Add a boundary-value or error-path test case
- Extract repeated setup into a shared helper
- Remove a redundant test (only if coverage doesn't decrease)

**3. Apply** — Copy `working/` to `backup/`. Apply change to actual project test files. Deterministic verifiers need to run against the actual project.

**4. Run deterministic verifiers** — hard constraint violated? Auto-revert from `backup/`, log `REVERTED (hard constraint: {which})`, skip LLM scoring. All pass? Continue.

**5. Score LLM criteria** — the scoring subagent (*Who scores*, Phase 3) re-reads the modified tests and scores all criteria against the frozen harness.

**6. Calculate composite** — improved? Keep, update `working/`, log KEPT. Same or worse? Revert from `backup/`, log REVERTED.

**7. Record** — append round to `results.json`:
```json
{
  "round": 1, "score": 0.68, "previousScore": 0.58,
  "deterministic": {"tests": {"pass": 26, "fail": 0}, "lineCoverage": 79, "branchCoverage": 68, "mutationScore": 67, "executionTime": 2.2},
  "llmChecks": {"Test naming clarity": 3, "Assertion quality": 3},
  "targetedArea": "Assertion quality", "targetedBefore": 2, "targetedAfter": 3,
  "change": "Replaced toBeTruthy() with toEqual({id: 1, role: 'admin'}) in auth.test.ts:45-52",
  "location": "tests/auth.test.ts:45-52", "kept": true, "hardConstraintViolation": null
}
```

**8. Update dashboard** and report: `Round 1: 68% (was 58%) [KEPT] — replaced weak assertions in auth.test.ts [coverage: 76%->79%]`

### Loop Rules

- **One change per round.** Never batch multiple changes.
- **Run ALL verifiers every round.** Side effects happen.
- **Deterministic checks are non-negotiable.** Coverage decrease never acceptable.
- **New tests must pass.** Failing new test = auto-revert. Don't fix it — that's a second change.
- **Plateau strategy**: After 3 consecutive no-improvement rounds, switch approach (adding tests <-> improving quality). If stuck, log and stop.
- **Convergence**: 90%+ on 3 consecutive rounds.
- **Max rounds**: 15 if not converged.
- **Dimension rotation**: After 2 rounds targeting same criterion with no improvement, move to next-weakest.

## Phase 5: Completion

1. Ensure improved test files are in the project. Save final state to `working/`.
2. Print final report: target files, rounds (kept/reverted), deterministic before/after (tests, coverage, mutation, time), LLM criteria before/after, composite before/after, list of kept changes, remaining items needing human decision.
3. Clean up: remove `backup/`.

## Dashboard

`dashboard.html` in the working directory is a self-contained page that reloads every 10 seconds. It shows the composite score, the baseline, the counts of rounds, kept and reverted changes, a score-history bar chart, a Deterministic Verifiers table (first round against latest round: tests, line coverage, branch coverage, mutation score, execution time), the latest LLM criterion scores, a Criteria Trajectory table (baseline against the last kept round) and the changelog, where a hard revert names its constraint.

It reads these `results.json` fields: `target`, `baseline`, `currentScore`, `baselineLlmChecks`, and per round `score`, `kept`, `deterministic` (`tests.pass`, `tests.fail`, `lineCoverage`, `branchCoverage`, `mutationScore`, `executionTime`), `llmChecks`, `targetedArea`, `change` and `hardConstraintViolation`.

Copy this skill's `assets/dashboard.html` (next to this SKILL.md) into the working directory, unchanged. Each round, rewrite `dashboard.html` from that asset with `{target-name}` in the `<title>` replaced by the target name and `__OPTIMIZER_DATA__` replaced by the current `results.json` content.

## Modes

**Full (default)** — Setup, harness, baseline, improvement loop, completion.

**Audit only** (`mode:audit`) — Score everything, report findings, don't modify tests.

**Focused** (`focus:<criterion>`) — Only include specified LLM criteria. Deterministic hard constraints still apply.
