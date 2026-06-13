---
name: test-optimizer
description: Iteratively evaluate and improve test suites through autonomous test-score-refine loops. Reads target test files, detects project tooling (test runner, coverage tool, mutation tester), builds a frozen evaluation harness combining deterministic verifiers (coverage %, mutation score, test pass rate, execution time) with LLM-judged criteria (naming clarity, assertion quality, edge case coverage, isolation, DRY-ness), then autonomously loops — score, identify weakest area, make one targeted improvement, re-score, keep if better or revert if not. Pairs with code-optimizer: run test-optimizer first to strengthen the safety net, then code-optimizer to improve the code. Use this skill whenever the user says "optimize tests", "improve tests", "strengthen tests", "test-optimizer", "run test-optimizer on [file/module]", "improve test coverage", "improve test quality", "make these tests better", "harden the test suite", or wants to systematically improve test quality through automated iteration. Also trigger when users want to increase coverage, add edge case tests, improve assertion quality, reduce test duplication, or improve test naming, even if they don't use the word "optimize".
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
  "baseline": null, "currentScore": null, "bestScore": null,
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

1. Run all deterministic verifiers. Record baselines in `results.json`.
2. Read all target test files. Score each LLM criterion with anchored rubrics. Record score + one-line evidence.
3. Calculate composite baseline. Report baseline %, deterministic metrics, per-criterion scores, and weakest area.
4. Update `results.json` and `dashboard.html`.

## Phase 4: Improvement Loop

Repeat autonomously until convergence or max rounds.

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

**5. Score LLM criteria** — re-read modified tests, score all criteria against frozen harness.

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

Self-contained HTML file. Each round, replace `__OPTIMIZER_DATA__` with current `results.json` and rewrite.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="10">
  <title>Test Optimizer — {target-name}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0f1117;color:#e1e4e8;padding:24px}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
    h1{font-size:1.4rem;color:#f0f3f6}
    .score-big{font-size:3rem;font-weight:700;color:#58a6ff}
    .score-label{font-size:.85rem;color:#8b949e}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
    .card h2{font-size:.95rem;color:#8b949e;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
    .check{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:.9rem}
    .check.high::before{content:"●";color:#3fb950}
    .check.mid::before{content:"●";color:#d29922}
    .check.low::before{content:"●";color:#f85149}
    .det-table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:8px}
    .det-table th{text-align:left;padding:6px 8px;border-bottom:1px solid #30363d;color:#8b949e}
    .det-table td{padding:6px 8px;border-bottom:1px solid #21262d}
    .improved{color:#3fb950}.unchanged{color:#8b949e}.degraded{color:#f85149}
    .changelog{width:100%}
    .changelog table{width:100%;border-collapse:collapse;font-size:.85rem}
    .changelog th{text-align:left;padding:8px;border-bottom:1px solid #30363d;color:#8b949e}
    .changelog td{padding:8px;border-bottom:1px solid #21262d}
    .kept{color:#3fb950}.reverted{color:#f85149}
    .chart{height:200px;display:flex;align-items:flex-end;gap:4px;padding:8px 0}
    .bar{background:#58a6ff;border-radius:3px 3px 0 0;min-width:24px;position:relative;transition:height .3s}
    .bar-label{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:.7rem;color:#8b949e}
    .stats{display:flex;gap:24px}
    .stat{text-align:center}
    .stat-value{font-size:1.5rem;font-weight:600;color:#f0f3f6}
    .stat-label{font-size:.75rem;color:#8b949e}
  </style>
</head>
<body>
  <div class="header">
    <h1>Test Optimizer — <span id="targetName"></span></h1>
    <div style="text-align:right">
      <div class="score-big" id="currentScore">—</div>
      <div class="score-label">composite score</div>
    </div>
  </div>
  <div class="stats" style="margin-bottom:24px">
    <div class="stat"><div class="stat-value" id="baseline">—</div><div class="stat-label">baseline</div></div>
    <div class="stat"><div class="stat-value" id="rounds">0</div><div class="stat-label">rounds</div></div>
    <div class="stat"><div class="stat-value" id="kept">0</div><div class="stat-label">kept</div></div>
    <div class="stat"><div class="stat-value" id="reverted">0</div><div class="stat-label">reverted</div></div>
  </div>
  <div class="grid">
    <div class="card"><h2>Score History</h2><div class="chart" id="chart"></div></div>
    <div class="card">
      <h2>Deterministic Verifiers</h2>
      <table class="det-table">
        <thead><tr><th>Verifier</th><th>Baseline</th><th>Current</th><th>Status</th></tr></thead>
        <tbody id="detVerifiers"></tbody>
      </table>
    </div>
  </div>
  <div class="grid">
    <div class="card"><h2>LLM Criteria (latest)</h2><div id="checks"></div></div>
    <div class="card">
      <h2>Criteria Trajectory</h2>
      <table class="det-table">
        <thead><tr><th>Criterion</th><th>Baseline</th><th>Current</th><th>Delta</th></tr></thead>
        <tbody id="crits"></tbody>
      </table>
    </div>
  </div>
  <div class="card changelog">
    <h2>Changelog</h2>
    <table>
      <thead><tr><th>Round</th><th>Score</th><th>Target</th><th>Change</th><th>Result</th></tr></thead>
      <tbody id="log"></tbody>
    </table>
  </div>
  <script>
    const DATA = __OPTIMIZER_DATA__;
    const $ = id => document.getElementById(id);
    const fmt = v => v != null ? Math.round(v * 100) + '%' : '—';
    $('targetName').textContent = DATA.target || '';
    $('currentScore').textContent = fmt(DATA.currentScore);
    $('baseline').textContent = fmt(DATA.baseline);
    const rounds = DATA.rounds || [];
    $('rounds').textContent = rounds.length;
    $('kept').textContent = rounds.filter(r => r.kept).length;
    $('reverted').textContent = rounds.filter(r => !r.kept).length;
    const scores = [DATA.baseline, ...rounds.map(r => r.score)].filter(s => s != null);
    scores.forEach(s => {
      const bar = document.createElement('div');
      bar.className = 'bar'; bar.style.height = (s * 180) + 'px'; bar.style.flex = '1';
      bar.innerHTML = '<span class="bar-label">' + fmt(s) + '</span>';
      $('chart').appendChild(bar);
    });
    const det = rounds.length ? rounds[rounds.length - 1].deterministic : {};
    const detB = rounds.length ? rounds[0].deterministic : det;
    [['Tests', 'tests', d => d && d.pass != null ? d.pass + ' pass, ' + d.fail + ' fail' : '—'],
     ['Line coverage', 'lineCoverage', d => d != null ? d + '%' : '—'],
     ['Branch coverage', 'branchCoverage', d => d != null ? d + '%' : '—'],
     ['Mutation score', 'mutationScore', d => d != null ? d + '%' : '—'],
     ['Execution time', 'executionTime', d => d != null ? d + 's' : '—']
    ].forEach(([name, key, f]) => {
      const tr = document.createElement('tr');
      const cur = key === 'tests' ? f(det[key]) : f(det[key]);
      const base = key === 'tests' ? f(detB[key]) : f(detB[key]);
      tr.innerHTML = '<td>' + name + '</td><td>' + base + '</td><td>' + cur + '</td><td>' + (cur === base ? 'OK' : 'changed') + '</td>';
      $('detVerifiers').appendChild(tr);
    });
    const lastRound = rounds[rounds.length - 1];
    Object.entries(lastRound ? lastRound.llmChecks : {}).forEach(([q, score]) => {
      const div = document.createElement('div');
      div.className = 'check ' + (score >= 4 ? 'high' : score >= 3 ? 'mid' : 'low');
      div.textContent = q + ' — ' + score + '/5';
      $('checks').appendChild(div);
    });
    rounds.forEach(r => {
      const tr = document.createElement('tr');
      const result = r.hardConstraintViolation ? 'REVERTED (hard: ' + r.hardConstraintViolation + ')' : (r.kept ? 'KEPT' : 'REVERTED');
      tr.innerHTML = '<td>' + r.round + '</td><td>' + fmt(r.score) + '</td><td>' + (r.targetedArea || '—') + '</td><td>' + (r.change || '') + '</td><td class="' + (r.kept ? 'kept' : 'reverted') + '">' + result + '</td>';
      $('log').appendChild(tr);
    });
  </script>
</body>
</html>
```

## Modes

**Full (default)** — Setup, harness, baseline, improvement loop, completion.

**Audit only** (`mode:audit`) — Score everything, report findings, don't modify tests.

**Focused** (`focus:<criterion>`) — Only include specified LLM criteria. Deterministic hard constraints still apply.
