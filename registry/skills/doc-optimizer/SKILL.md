---
name: doc-optimizer
description: Iteratively evaluate and improve technical documentation through autonomous test-score-refine loops with deterministic codebase verification. Reads target docs (API docs, guides, READMEs, tutorials, reference docs), builds a frozen evaluation harness combining deterministic verifiers (code examples compile, import paths exist, API references match, links resolve, symbols exist) with LLM-judged criteria (accuracy, completeness, sequencing, example quality, audience appropriateness), then autonomously loops — score, identify weakest area, make one targeted improvement, re-score, keep if better or revert if not. Use this skill whenever the user says "optimize docs", "improve documentation", "review these docs", "doc-optimizer", "run doc-optimizer on [file]", "check my API docs", "verify documentation", or wants to systematically improve technical documentation through automated iteration. Also trigger when users want to find stale code references, broken examples, missing API docs, or inaccurate documentation. Do NOT use for PRDs or requirements documents (use prd-optimizer), architecture docs (use architecture-optimizer), or code (use code-optimizer).
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
  "baseline": null, "currentScore": null, "bestScore": null,
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

Run all deterministic verifiers and record results. Score all LLM criteria with anchored rubrics — record score + one-line evidence per criterion. Calculate composite baseline. Report deterministic results, LLM scores, and weakest area. Update `results.json` and `dashboard.html`.

## Phase 4: Improvement Loop

Repeat autonomously until convergence or max rounds.

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

**5. Score LLM criteria** — Re-read modified docs. Score all criteria with frozen rubrics.

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

Self-contained HTML file. Each round, replace `__OPTIMIZER_DATA__` with current `results.json` content.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta http-equiv="refresh" content="10">
<title>Doc Optimizer — {doc-name}</title>
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
.changelog{width:100%}.changelog table{width:100%;border-collapse:collapse;font-size:.85rem}
.changelog th{text-align:left;padding:8px;border-bottom:1px solid #30363d;color:#8b949e}
.changelog td{padding:8px;border-bottom:1px solid #21262d}
.kept{color:#3fb950}.reverted{color:#f85149}
.chart{height:200px;display:flex;align-items:flex-end;gap:4px;padding:8px 0}
.bar{background:#58a6ff;border-radius:3px 3px 0 0;min-width:24px;position:relative;transition:height .3s}
.bar-label{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:.7rem;color:#8b949e}
.stats{display:flex;gap:24px}
.stat{text-align:center}.stat-value{font-size:1.5rem;font-weight:600;color:#f0f3f6}
.stat-label{font-size:.75rem;color:#8b949e}
</style>
</head>
<body>
<div class="header">
  <h1>Doc Optimizer — <span id="docName"></span></h1>
  <div style="text-align:right"><div class="score-big" id="currentScore">—</div><div class="score-label">composite score</div></div>
</div>
<div class="stats" style="margin-bottom:24px">
  <div class="stat"><div class="stat-value" id="baseline">—</div><div class="stat-label">baseline</div></div>
  <div class="stat"><div class="stat-value" id="rounds">0</div><div class="stat-label">rounds</div></div>
  <div class="stat"><div class="stat-value" id="kept">0</div><div class="stat-label">kept</div></div>
  <div class="stat"><div class="stat-value" id="reverted">0</div><div class="stat-label">reverted</div></div>
</div>
<div class="grid">
  <div class="card"><h2>Score History</h2><div class="chart" id="chart"></div></div>
  <div class="card"><h2>Deterministic Verifiers</h2>
    <table class="det-table"><thead><tr><th>Verifier</th><th>Baseline</th><th>Current</th><th>Status</th></tr></thead><tbody id="detVerifiers"></tbody></table>
  </div>
</div>
<div class="grid">
  <div class="card"><h2>LLM Criteria (latest)</h2><div id="checks"></div></div>
  <div class="card"><h2>Criteria Trajectory</h2>
    <table class="det-table"><thead><tr><th>Criterion</th><th>Baseline</th><th>Current</th><th>Delta</th></tr></thead><tbody id="crits"></tbody></table>
  </div>
</div>
<div class="card changelog"><h2>Changelog</h2>
  <table><thead><tr><th>Round</th><th>Score</th><th>Target</th><th>Change</th><th>Result</th></tr></thead><tbody id="log"></tbody></table>
</div>
<script>
const D=__OPTIMIZER_DATA__,fmt=v=>v!=null?Math.round(v*100)+'%':'—';
document.getElementById('docName').textContent=D.document||'';
document.getElementById('currentScore').textContent=fmt(D.currentScore);
document.getElementById('baseline').textContent=fmt(D.baseline);
const R=D.rounds||[];
document.getElementById('rounds').textContent=R.length;
document.getElementById('kept').textContent=R.filter(r=>r.kept).length;
document.getElementById('reverted').textContent=R.filter(r=>!r.kept).length;
const ch=document.getElementById('chart'),sc=[D.baseline,...R.map(r=>r.score)].filter(s=>s!=null);
sc.forEach(s=>{const b=document.createElement('div');b.className='bar';b.style.height=(s*180)+'px';b.style.flex='1';b.innerHTML='<span class="bar-label">'+fmt(s)+'</span>';ch.appendChild(b)});
const det=R.length>0?R[R.length-1].deterministic:{},bDet=R.length>0&&R[0].deterministic?R[0].deterministic:det;
Object.entries(det).forEach(([k,v])=>{const tr=document.createElement('tr'),c=v.valid||v.runnable||v.matched||v.found||v.resolved||0,t=v.total||0,bs=bDet[k]||v,bc=bs.valid||bs.runnable||bs.matched||bs.found||bs.resolved||0,d=c-bc,cl=d>0?'improved':d<0?'degraded':'unchanged';tr.innerHTML='<td>'+k+'</td><td>'+bc+'/'+(bs.total||t)+'</td><td>'+c+'/'+t+'</td><td class="'+cl+'">'+(d>0?'+'+d:d===0?'OK':d)+'</td>';document.getElementById('detVerifiers').appendChild(tr)});
const lR=R[R.length-1],ck=lR?lR.llmChecks:{};
Object.entries(ck).forEach(([q,s])=>{const d=document.createElement('div');d.className='check '+(s>=4?'high':s>=3?'mid':'low');d.textContent=q+' — '+s+'/5';document.getElementById('checks').appendChild(d)});
R.forEach(r=>{const tr=document.createElement('tr'),res=r.hardConstraintViolation?'REVERTED (hard: '+r.hardConstraintViolation+')':(r.kept?'KEPT':'REVERTED'),cl=r.kept?'kept':'reverted';tr.innerHTML='<td>'+r.round+'</td><td>'+fmt(r.score)+'</td><td>'+(r.targetedArea||'—')+'</td><td>'+(r.change||'')+'</td><td class="'+cl+'">'+res+'</td>';document.getElementById('log').appendChild(tr)});
</script>
</body>
</html>
```

## Modes

**Full (default)** — Setup, harness, baseline, improvement loop, completion.

**Audit only** — Phase 1-3 only. Score, report findings, don't modify.

**Deterministic only** — Run verifiers only. Skip LLM criteria. Quick staleness check.

**Focused** — Only specified LLM criteria. Deterministic hard constraints still apply.

**Watch** — Re-run all verifiers and re-score. Update dashboard. No modifications.
