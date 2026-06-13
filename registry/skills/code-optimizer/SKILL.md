---
name: code-optimizer
description: Iteratively evaluate and improve code through autonomous test-score-refine loops. Reads target code, detects project tooling (tests, linters, type-checkers), builds a frozen evaluation harness combining deterministic verifiers (test results, lint errors, type errors) with LLM-judged criteria (readability, naming, complexity), then autonomously loops — score, identify weakest area, make one targeted improvement, re-score, keep if better or revert if not. Use this skill whenever the user says "optimize code", "improve code quality", "refine this module", "code-optimizer", "run code-optimizer on [file/module]", "make this code better", "clean up this code", or wants to systematically improve code quality through automated iteration. Also trigger when users want to reduce complexity, improve test coverage, fix lint issues, or improve maintainability of a codebase, even if they don't use the word "optimize".
---

# Code Optimizer

Iteratively improve code through autonomous test-score-refine loops, combining deterministic verifiers with LLM-judged quality criteria.

Each round: run tests/linters/type-checkers, score LLM criteria against a frozen harness, identify the weakest area, make one targeted improvement, re-score, keep if improved, revert if not.

## How This Works (Mental Model)

This skill has two types of evaluation — deterministic and subjective — unified into a single harness.

**Deterministic verifiers** are the equivalent of Karpathy's `prepare.py`: they produce exact, reproducible numbers. Tests either pass or fail. Linters report a count of errors. Type-checkers report violations. These can't be gamed or misinterpreted.

**LLM-judged criteria** cover what machines can't count: Is this function named well? Is the control flow easy to follow? Would a new team member understand this without asking questions? These use anchored 1-5 rubrics to minimize scoring variance, the same approach as the sibling prd-optimizer and skill-optimizer skills.

The harness combines both into a single score, but deterministic checks act as **hard constraints** — if a change breaks tests that were passing, it's auto-reverted regardless of how much the LLM scores improved. You can't trade correctness for readability.

## Phase 1: Setup

### 1. Identify Target Code

The user points at a file, module, or set of files. Read all target files and understand:
- What the code does (purpose, inputs, outputs)
- Language and framework
- Module boundaries and dependencies
- Current size (line count per file)

**Scope boundaries:** If the user says "optimize this file", only that file is mutable. If they say "optimize this module", all files in the module are mutable. Files outside the scope are read-only context — never modify them.

### 2. Detect Project Tooling

Scan the project for available tooling. Run detection commands:

| Tool Type | Detection | Example |
|-----------|-----------|---------|
| Test runner | Look for test config, `package.json` scripts, `pytest.ini`, `Cargo.toml` | `npm test`, `pytest`, `cargo test` |
| Linter | Look for `.eslintrc`, `ruff.toml`, `.golangci.yml`, `clippy` | `eslint .`, `ruff check .`, `cargo clippy` |
| Type checker | Look for `tsconfig.json`, `mypy.ini`, `pyright` config | `tsc --noEmit`, `mypy .`, `pyright` |
| Formatter | Look for `.prettierrc`, `rustfmt.toml`, `black` config | `prettier --check`, `cargo fmt --check` |
| Build | Look for build config | `npm run build`, `cargo build`, `go build ./...` |

For each tool found, verify it runs successfully on the current code. Record:
- The exact command to run
- How to parse its output (exit code, error count, specific output format)
- Current baseline result

If no tooling exists, the skill still works — it just relies entirely on LLM-judged criteria. Log a note: "No tests or linters detected. Scoring on code quality criteria only, no automated correctness checks."

### 3. Create Working Directory

```
code-optimizer-{target-name}/
  original/              # backup of original files (never modified)
  working/               # working copies (modified each round)
  backup/                # previous version of working/ (for revert)
  harness.md             # frozen evaluation harness
  results.json           # score history
  dashboard.html         # live results dashboard
```

Copy all target files to both `original/` and `working/`, preserving directory structure. Initialize `results.json`:

```json
{
  "target": "target-name",
  "files": ["path/to/file1.ts", "path/to/file2.ts"],
  "startedAt": "ISO timestamp",
  "harness": "harness.md",
  "harnessBuiltAt": "ISO timestamp",
  "tooling": {
    "testRunner": "npm test",
    "linter": "eslint src/",
    "typeChecker": "tsc --noEmit"
  },
  "baseline": null,
  "currentScore": null,
  "bestScore": null,
  "consecutiveHighPasses": 0,
  "rounds": []
}
```

## Phase 2: Build or Validate Harness

The harness is the frozen evaluation function for the run. It lives in `harness.md`.

### If a harness already exists from a previous run:

1. Read the existing `harness.md`
2. Compare it against the current code state:
   - Have files been added, removed, or renamed?
   - Have functions/classes been significantly restructured?
   - Has the project's tooling changed (new linter, different test framework)?
   - Do the existing LLM criteria still apply to the code's current shape?
3. **If the code and tooling haven't changed meaningfully** — reuse the existing harness. Report: `Harness validated — reusing existing harness from previous run. Scores are comparable.`
4. **If the code or tooling HAVE changed** — alert the user before rebuilding:
   ```
   ⚠ Code has changed since the last harness was built:
   - 2 new functions added to auth.ts
   - Linter switched from ESLint to Biome
   - Test file restructured

   The harness needs to be rebuilt to cover these changes.
   Scores from this run will NOT be comparable to previous runs.
   Rebuilding harness now.
   ```
   Then rebuild the harness following the steps below.

### Building a new harness:

Generate `harness.md` with this structure:

```markdown
# Evaluation Harness
# Frozen at: {ISO timestamp}
# Target: {target name}
# DO NOT MODIFY DURING A RUN

## Deterministic Verifiers (Hard Constraints)

### Tests
Command: `{exact test command}`
Parse: {how to extract pass/fail/count}
Baseline: {N passing, M failing}
Hard constraint: no previously-passing test may fail after a change.

### Linter
Command: `{exact lint command}`
Parse: {how to extract error count}
Baseline: {N errors, M warnings}
Hard constraint: error count must not increase.

### Type Checker
Command: `{exact type-check command}`
Parse: {how to extract error count}
Baseline: {N errors}
Hard constraint: error count must not increase.

## LLM-Judged Criteria

### 1. {Criterion name}
{Anchored rubric}

### 2. {Criterion name}
{Anchored rubric}

...

## Composite Scoring
{How deterministic + LLM scores combine}

## Special Rules
{Edge-case handling}

## Output Format
{Exact scoring table structure}
```

### Deterministic Verifiers

For each tool detected in Phase 1, the harness records:
- **Exact command** to run (frozen — same command every round)
- **Parse method** — how to extract the metric from output
- **Baseline value** — the starting metric
- **Hard constraint rule** — what constitutes an automatic revert

Hard constraint rules:
- **Tests**: No previously-passing test may start failing. New tests may be added. Test count may decrease only if redundant tests are removed (flag to user).
- **Linter**: Error count must not increase. Warning count is tracked but not a hard constraint.
- **Type checker**: Error count must not increase.
- **Build**: Must succeed. Build failure = auto-revert.
- **Formatter**: Formatting violations must not increase.

If a tool wasn't found, omit its section — don't create placeholder checks for tools that don't exist.

### LLM-Judged Criteria

Generate 3-5 criteria with anchored 1-5 rubrics. Pick criteria based on what the code actually needs, not a generic checklist. Read the code first and identify its real weaknesses.

Common criteria (use the ones that apply):

**Naming clarity:**
```
Are function, variable, and parameter names self-explanatory?

5 — Every name conveys intent. A reader understands the purpose without reading the body. No abbreviations except universally understood ones (id, url, etc).
4 — 1-2 names are slightly ambiguous but understandable in context (e.g., "data" in a function where the type makes it clear).
3 — Several names require reading surrounding code to understand. Some abbreviations that aren't obvious (e.g., "ctx" for context, "mgr" for manager).
2 — Many names are opaque. Reader frequently needs to trace usage to understand purpose. Abbreviations dominate.
1 — Names are single letters, arbitrary abbreviations, or misleading. Code requires full mental simulation to follow.
```

**Function complexity:**
```
Are functions focused on a single responsibility with manageable control flow?

5 — Every function does one thing. No function exceeds ~20 lines of logic. Control flow is linear or has one level of branching.
4 — Functions are focused. 1-2 are slightly long but logically cohesive. Max one level of nested branching.
3 — Some functions handle multiple concerns. A few exceed 30 lines. 2-3 levels of nested control flow in places.
2 — Several functions are doing too much. Nested conditionals and loops are common. Reader loses track of what a function is responsible for.
1 — Functions are monolithic. Multiple responsibilities tangled together. Deep nesting. Extracting any single concern would require significant refactoring.
```

**Error handling:**
```
Are errors handled appropriately at system boundaries without over-handling internally?

5 — Errors are handled at boundaries (user input, external APIs, I/O). Internal code trusts framework guarantees. No silent swallowing. Error messages are actionable.
4 — Error handling is mostly correct. 1-2 places either over-handle (try/catch around safe code) or under-handle (raw throws from external calls).
3 — Mixed. Some boundaries lack error handling while some internal code has unnecessary try/catch blocks. A few generic catch-all handlers.
2 — Error handling is inconsistent. Multiple silent catches, generic error messages, or bare throws from system boundaries.
1 — No meaningful error handling. Errors either propagate unhandled or are silently swallowed everywhere.
```

**Duplication:**
```
Is there meaningful code duplication that should be consolidated?

5 — No meaningful duplication. Shared logic is extracted when there are 3+ near-identical uses. Simple repeated patterns (2 similar lines) are left inline.
4 — 1 instance of duplicated logic (3+ lines, 3+ occurrences) that could be extracted.
3 — 2-3 instances of duplicated logic. Some copy-paste patterns visible.
2 — Significant duplication. Same logic appears in 4+ places. Changes would need to be made in multiple locations.
1 — Pervasive duplication. The codebase is largely copy-paste with minor variations.
```

**Testability / structure:**
```
Is the code structured in a way that makes it easy to test and modify?

5 — Clear module boundaries. Dependencies are explicit (injected or imported, not global). Side effects are isolated. Adding a test for any function would be straightforward.
4 — Mostly well-structured. 1-2 hidden dependencies or side effects that would make testing slightly awkward.
3 — Some tight coupling. A few functions depend on global state or have embedded side effects. Testing would require mocking or setup.
2 — Significant coupling. Testing most functions would require complex setup or mocking of multiple dependencies.
1 — Untestable without major refactoring. Global state, hidden dependencies, and side effects are pervasive.
```

**Rules for writing anchors:**
- Each level must be distinguishable by an observable condition
- Use counts where possible ("1-2 names" vs "several names")
- The 3-anchor (midpoint) is "acceptable but has clear room for improvement"
- Frame from the next developer's perspective: "a new team member reading this would..."

### Special Rules

- **Pure refactoring**: If the change is purely structural (rename, extract function, reorder), deterministic checks must produce identical results. Any test failure means the refactoring changed behavior — auto-revert.
- **Test additions**: Adding new tests is always allowed and encouraged, but only if they pass. A new failing test is not an improvement — it's unfinished work.
- **Performance-sensitive code**: If the user flags code as performance-critical, add a timing-based deterministic check. But don't add performance criteria by default — premature optimization is not the goal.
- **Generated code / config files**: Skip LLM criteria for auto-generated files. Only apply deterministic checks (does it still work?).
- **Multi-file changes**: When a change spans multiple files (e.g., extracting a shared utility), all files must be updated atomically. Score the change as one unit, not per-file.

### Composite Scoring

The overall score combines deterministic and LLM components:

1. **Deterministic gate**: If ANY hard constraint is violated, the round is auto-reverted. No LLM score can override this.
2. **LLM score**: Average of all criteria, normalized to percentage: `(avg - 1) / 4 * 100`.
3. **Deterministic bonus**: Improvements in deterministic metrics (fewer lint errors, more tests passing) add a bonus:
   - Each lint error removed: +1 point to the raw score (before normalization)
   - Each type error removed: +1 point
   - Each new passing test: +0.5 points
4. **Composite**: LLM percentage + deterministic bonus, capped at 100%.

The deterministic bonus ensures that fixing a lint error or type error is always valued, even if LLM scores don't change. Conversely, LLM improvements that don't break deterministic checks are also kept.

### Output Format

Every scoring round must produce:

```
## Deterministic Results
| Verifier     | Result         | Baseline       | Status |
|--------------|----------------|----------------|--------|
| Tests        | 42 pass, 0 fail| 42 pass, 0 fail| OK     |
| Linter       | 3 errors       | 5 errors       | +2     |
| Type checker | 0 errors       | 0 errors       | OK     |

## LLM Criteria
| Criterion          | Score | Evidence (one line)                          |
|--------------------|-------|----------------------------------------------|
| Naming clarity     | 4     | 1 ambiguous name: "data" in processResults() |
| Function complexity| 3     | handleAuth() is 45 lines with 3-deep nesting |
| ...                | ...   | ...                                          |

## Composite: 74% (was 68%) — KEEP
```

Log the harness summary (verifier count, criterion count) as a status update. Proceed immediately to baseline scoring. The harness CAN be adjusted before the baseline if the user passes specific criteria or constraints as parameters, but once the baseline is scored, it's frozen for the rest of the run.

**Parameters** (optional, passed by user or calling automation):
- `focus:<criterion>` — only include specified LLM criteria
- `skip-llm` — deterministic checks only, skip all LLM criteria
- `max-rounds:<N>` — override the default 15-round limit
- `mode:audit` — score only, don't modify code
- `performance` — include timing-based deterministic checks

## Phase 3: Baseline Scoring

### 1. Run Deterministic Verifiers

For each verifier in the harness, run the exact command and parse the output:

```
Tests: 42 passing, 0 failing (command: npm test)
Linter: 5 errors, 12 warnings (command: eslint src/)
Type checker: 0 errors (command: tsc --noEmit)
```

These are the hard constraint baselines. Record them in `results.json`.

### 2. Score LLM Criteria

Read the target code files. Score each criterion using the anchored rubrics. For each, record:
- The score (1-5) with the specific anchor level it matches
- One-line evidence citing the function/section and what you observed

### 3. Calculate Composite Baseline

Combine deterministic results and LLM scores per the harness rules. Report:

```
Baseline: 62% composite

Deterministic:
  Tests: 42 pass, 0 fail
  Linter: 5 errors, 12 warnings
  Type checker: 0 errors

LLM criteria (avg 3.5/5):
  Naming clarity: 4 — mostly good, "data" param in 2 places
  Function complexity: 2 — handleAuth() is 68 lines with 4-deep nesting
  Error handling: 4 — boundaries covered, 1 silent catch in fetchUser()
  Duplication: 3 — validation logic repeated in 3 endpoints

Weakest area: Function complexity (2/5)
```

Update `results.json` and `dashboard.html`.

## Phase 4: Improvement Loop

Repeat autonomously until convergence or max rounds.

### Each Round

**1. Pick the target** — Find the single weakest area. Priority order:
   - Deterministic issues first (failing tests > lint errors > type errors)
   - Then lowest LLM criterion
   - If tied, pick the most impactful (the one that would cascade improvements)

**2. Hypothesize** — Decide on ONE targeted change. Types of changes:
   - **Extract function**: Pull a block of logic into a named function (reduces complexity, improves naming)
   - **Rename**: Change an opaque name to a self-explanatory one
   - **Consolidate duplication**: Extract shared logic when 3+ near-identical blocks exist
   - **Fix lint error**: Address a specific linter complaint
   - **Fix type error**: Add or correct type annotations
   - **Improve error handling**: Add boundary handling or remove over-handling
   - **Simplify control flow**: Flatten nesting, use early returns, simplify conditionals
   - **Add test**: Write a test for uncovered critical logic

**3. Apply** — Copy `working/` to `backup/`. Then apply the change to the actual project files (not the working directory copies). The change should be minimal, traceable to a specific harness check, and preserve behavior.

**Important: apply changes to the real project files**, not the working copies. The deterministic verifiers need to run against the actual project. After scoring, update `working/` to reflect the current state.

**4. Run deterministic verifiers** — Execute all verifier commands from the harness. Check hard constraints:
   - Any hard constraint violated? → Auto-revert immediately. Copy `backup/` back. Log as `REVERTED (hard constraint: {which one})`. Skip LLM scoring.
   - All hard constraints pass? → Continue to LLM scoring.

**5. Score LLM criteria** — Re-read the modified code. Score all criteria using the frozen harness rubrics.

**6. Calculate composite** — Compare to previous best:
   - Improved → Keep. Update `working/` from current project state. Delete `backup/`. Log as KEPT.
   - Same or worse → Revert. Restore files from `backup/`. Log as REVERTED.

**7. Record** — Append to `results.json`:
```json
{
  "round": 1,
  "score": 0.68,
  "previousScore": 0.62,
  "deterministic": {
    "tests": {"pass": 42, "fail": 0},
    "linter": {"errors": 4, "warnings": 12},
    "typeChecker": {"errors": 0}
  },
  "llmChecks": {"Naming clarity": 4, "Function complexity": 3},
  "targetedArea": "Function complexity",
  "targetedBefore": 2,
  "targetedAfter": 3,
  "change": "Extracted auth token validation from handleAuth() into validateToken()",
  "location": "src/auth.ts:45-62",
  "kept": true,
  "hardConstraintViolation": null
}
```

**8. Update dashboard** and report one line:
```
Round 1: 68% (was 62%) [KEPT] — extracted validateToken() from handleAuth() [lint: 5→4 errors]
```

### Loop Rules

- **One change per round.** Never batch multiple changes.
- **Run ALL verifiers every round.** Even if the change seems unrelated to tests — side effects happen.
- **Deterministic checks are non-negotiable.** A broken test is never an acceptable trade for better readability.
- **Plateau strategy**: After 3 consecutive rounds with no improvement:
  - If you've been doing structural changes, try fixing lint/type errors instead
  - If you've been fixing lint issues, try extracting functions or renaming
  - If the remaining LLM criteria are stuck at 3-4, the code may be at a local optimum — log it and stop
  - If deterministic metrics are stuck, check if remaining lint/type errors are false positives or intentional — log them in the completion report
- **Convergence**: Stop when composite score reaches 90%+ on 3 consecutive rounds.
- **Max rounds**: Stop after 15 rounds if not converged — report findings in completion summary.
- **Dimension rotation**: After 2 rounds targeting the same criterion with no improvement, move to the next-weakest.

## Phase 5: Completion

1. Ensure the improved code is in the actual project files (it should be, since changes are applied there)
2. Save a snapshot of the final state to `working/`
3. Print a final report:
   ```
   Code Optimizer — Final Report
   ═══════════════════════════════
   Target: src/auth.ts, src/middleware.ts
   Rounds: 8 (6 kept, 2 reverted)

   Deterministic:
     Tests:        42 pass → 45 pass (+3 new tests)
     Lint errors:  5 → 1 (-4)
     Type errors:  0 → 0 (unchanged)

   LLM Criteria:
     Naming clarity:      4 → 5 (+1)
     Function complexity:  2 → 4 (+2)
     Error handling:       4 → 4 (unchanged)
     Duplication:          3 → 4 (+1)

   Composite: 62% → 88%

   Kept changes:
     1. Extracted validateToken() from handleAuth()
     2. Renamed "data" → "authPayload" in 2 functions
     3. Consolidated validation logic into validateInput()
     4. Added try/catch at API boundary in fetchUser()
     5. Added 3 tests for validateToken()
     6. Fixed 4 lint errors (unused imports, missing return types)

   Remaining items (need human decision):
     - 1 lint error is a false positive (eslint rule conflict)
     - handleLegacyAuth() is complex but changing it would alter external API behavior
   ```
4. Clean up: remove `backup/` directory

## Dashboard

The dashboard is a self-contained HTML file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="10">
  <title>Code Optimizer — {target-name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f1117; color: #e1e4e8; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    h1 { font-size: 1.4rem; color: #f0f3f6; }
    .score-big { font-size: 3rem; font-weight: 700; color: #58a6ff; }
    .score-label { font-size: 0.85rem; color: #8b949e; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
    .card h2 { font-size: 0.95rem; color: #8b949e; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .check { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.9rem; }
    .check.high::before { content: "●"; color: #3fb950; }
    .check.mid::before { content: "●"; color: #d29922; }
    .check.low::before { content: "●"; color: #f85149; }
    .det-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 8px; }
    .det-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #30363d; color: #8b949e; }
    .det-table td { padding: 6px 8px; border-bottom: 1px solid #21262d; }
    .improved { color: #3fb950; }
    .unchanged { color: #8b949e; }
    .degraded { color: #f85149; }
    .changelog { width: 100%; }
    .changelog table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .changelog th { text-align: left; padding: 8px; border-bottom: 1px solid #30363d; color: #8b949e; }
    .changelog td { padding: 8px; border-bottom: 1px solid #21262d; }
    .kept { color: #3fb950; }
    .reverted { color: #f85149; }
    .chart { height: 200px; display: flex; align-items: flex-end; gap: 4px; padding: 8px 0; }
    .bar { background: #58a6ff; border-radius: 3px 3px 0 0; min-width: 24px; position: relative; transition: height 0.3s; }
    .bar-label { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 0.7rem; color: #8b949e; }
    .stats { display: flex; gap: 24px; }
    .stat { text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 600; color: #f0f3f6; }
    .stat-label { font-size: 0.75rem; color: #8b949e; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Code Optimizer — <span id="targetName"></span></h1>
    <div style="text-align: right">
      <div class="score-big" id="currentScore">—</div>
      <div class="score-label">composite score</div>
    </div>
  </div>
  <div class="stats" style="margin-bottom: 24px;">
    <div class="stat"><div class="stat-value" id="baseline">—</div><div class="stat-label">baseline</div></div>
    <div class="stat"><div class="stat-value" id="rounds">0</div><div class="stat-label">rounds</div></div>
    <div class="stat"><div class="stat-value" id="kept">0</div><div class="stat-label">kept</div></div>
    <div class="stat"><div class="stat-value" id="reverted">0</div><div class="stat-label">reverted</div></div>
  </div>
  <div class="grid">
    <div class="card">
      <h2>Score History</h2>
      <div class="chart" id="chart"></div>
    </div>
    <div class="card">
      <h2>Deterministic Verifiers</h2>
      <table class="det-table">
        <thead><tr><th>Verifier</th><th>Baseline</th><th>Current</th><th>Status</th></tr></thead>
        <tbody id="detVerifiers"></tbody>
      </table>
    </div>
  </div>
  <div class="grid">
    <div class="card">
      <h2>LLM Criteria (latest)</h2>
      <div id="checks"></div>
    </div>
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
    document.getElementById('targetName').textContent = DATA.target || '';
    const fmt = v => v != null ? Math.round(v * 100) + '%' : '—';
    document.getElementById('currentScore').textContent = fmt(DATA.currentScore);
    document.getElementById('baseline').textContent = fmt(DATA.baseline);
    const rounds = DATA.rounds || [];
    document.getElementById('rounds').textContent = rounds.length;
    document.getElementById('kept').textContent = rounds.filter(r => r.kept).length;
    document.getElementById('reverted').textContent = rounds.filter(r => !r.kept).length;
    const chart = document.getElementById('chart');
    const scores = [DATA.baseline, ...rounds.map(r => r.score)].filter(s => s != null);
    const maxH = 180;
    scores.forEach(s => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = (s * maxH) + 'px';
      bar.style.flex = '1';
      bar.innerHTML = '<span class="bar-label">' + fmt(s) + '</span>';
      chart.appendChild(bar);
    });
    const checksEl = document.getElementById('checks');
    const lastRound = rounds[rounds.length - 1];
    const checksData = lastRound ? lastRound.llmChecks : {};
    Object.entries(checksData).forEach(([q, score]) => {
      const div = document.createElement('div');
      const cls = score >= 4 ? 'high' : score >= 3 ? 'mid' : 'low';
      div.className = 'check ' + cls;
      div.textContent = q + ' — ' + score + '/5';
      checksEl.appendChild(div);
    });
    const log = document.getElementById('log');
    rounds.forEach(r => {
      const tr = document.createElement('tr');
      const result = r.hardConstraintViolation
        ? 'REVERTED (hard: ' + r.hardConstraintViolation + ')'
        : (r.kept ? 'KEPT' : 'REVERTED');
      const cls = r.kept ? 'kept' : 'reverted';
      tr.innerHTML = '<td>' + r.round + '</td><td>' + fmt(r.score) + '</td><td>' + (r.targetedArea || '—') + '</td><td>' + (r.change || '') + '</td><td class="' + cls + '">' + result + '</td>';
      log.appendChild(tr);
    });
  </script>
</body>
</html>
```

Each round, replace `__OPTIMIZER_DATA__` with the current `results.json` content and rewrite the file.

## Modes

**Full (default)** — Setup → harness → baseline → improvement loop → completion.

**Audit only** — "just evaluate" or "audit only": run Phase 1-3 only. Score everything, report findings, don't modify code.

**Deterministic only** — "just fix lint/type errors": only target deterministic verifier issues. Skip LLM criteria entirely. Useful for quick cleanup passes.

**Focused** — "focus on readability" or "focus on complexity": only include specified LLM criteria in the harness. Deterministic hard constraints still apply.

**Watch** — "re-score": re-run all verifiers and re-score all criteria against current code. Update dashboard. No modifications.
