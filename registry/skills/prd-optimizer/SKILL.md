---
name: prd-optimizer
description: Iteratively evaluate and improve PRDs, requirements documents, and plans through autonomous test-score-refine loops. Reads the document, builds a scoring checklist across quality dimensions (completeness, consistency, actionability, gap detection), then autonomously loops — score, identify weakest area, make one targeted improvement, re-score, keep if better or revert if not. Use this skill whenever the user says "evaluate PRD", "improve PRD", "review requirements", "audit plan", "prd-optimizer", "run prd-optimizer on [doc]", "check my requirements doc", "find gaps in my plan", or wants to systematically improve any requirements/planning document through automated iteration. Also trigger when users want to find contradictions, missing cross-references, or unresolved questions in any planning document, even if they don't use the word "PRD".
---

# PRD Optimizer

Iteratively evaluate and improve a PRD, requirements document, or plan through autonomous test-score-refine loops.

Each round: score against a quality checklist, identify the weakest area, make one targeted improvement, re-score, keep if improved, revert if not.

## How This Works (Mental Model)

Think of this like a code linter for documents. A linter reads code, checks rules, reports violations, and can auto-fix some of them. This skill does the same thing for requirements documents — it checks structural rules (cross-references match, open questions are resolved, status markers agree) and iteratively fixes violations one at a time.

The key insight from autoresearch: one change per round, measure impact, keep or revert. This prevents cascading mistakes and gives a clear changelog of what helped.

## Phase 1: Setup

### 1. Locate and Scan the Document

Read the target document. It can be a PRD, plan, architecture doc, requirements spec, or any structured planning artifact.

**For large documents (>500 lines):** Don't try to hold the entire document in working memory. Instead, scan it in chunks and build a structure index — section headings, entity names, and their line ranges. This index is your map for targeted reads during scoring.

### 2. Summarize the Document

Before any technical analysis, produce a 2-3 sentence summary of what the document IS — its purpose, scope, and key entities. This grounds the user and frames the scoring that follows.

Example: "This document specifies a 16-persona automated software company with AI agents handling ideation, planning, development, review, testing, and deployment across multiple projects. It defines chat channels, pipeline stages, inter-agent protocols, and VM infrastructure."

### 3. Build Structure Map

Map the document's anatomy:
- **Sections**: Top-level headings and their line ranges
- **Entities**: Named things (personas, components, services, APIs, workflows) and where they're defined
- **Cross-references**: Where entity A mentions entity B (build an adjacency list)
- **Decisions**: Resolved vs open (count each)
- **Status markers**: What's marked as built/running, planned, or TODO

Save the structure map to `structure-map.json` in the working directory.

Report to the user: "This document defines N entities across M sections, with X cross-references, Y resolved decisions, and Z open questions."

### 4. Generate Scoring Checklist

Generate 10-14 binary (yes/no) scoring questions automatically based on what the document contains. Each question must be specific to THIS document, not generic.

**Important: score calibration.** These checks measure *structural rule compliance* — whether cross-references match, open questions are tracked, examples align with definitions. A thorough document can still score low on structural compliance. Report the score with context: "X% structural compliance (N/M checks). This measures internal consistency and completeness of cross-references, not overall document quality."

**Dimension coverage** — draw 2-3 questions per dimension. Aim for diversity — don't cluster all checks on one type of issue.

**Internal Consistency** — Do statements agree across sections?
- Cross-reference symmetry: when A says "I interact with B", does B mention A?
- Terminology consistency: same concept uses same name everywhere
- Status markers don't contradict (not BUILT in one place and TODO in another)
- Data flows match: if A says "I produce X for B", B should say "I receive X from A"
- Numeric/quantitative claims are consistent (RAM totals add up, counts match)

**Completeness** — Is every entity fully specified?
- Required fields are populated (no TBD, empty, or placeholder values)
- Workflows have defined triggers, steps, and outcomes
- Interfaces between entities have defined protocols/formats
- Open questions are either answered in a Resolved section or explicitly deferred

**Actionability** — Can an implementer build from this without guessing?
- Decisions name specific technologies, not categories ("PostgreSQL" not "a database")
- Sequences have clear ordering and ownership (who does what, when)
- Data formats are specified where entities exchange information
- Implementation priority/ordering is defined (what to build first)

**Gap Detection** — Are there missing pieces?
- Referenced entities that are never defined
- Workflows with no error/failure path
- Integration points with no protocol defined
- Entities mentioned in examples but absent from the definitions

**Self-Consistency** — Does the document follow its own rules?
- Examples and walkthroughs comply with rules/constraints defined elsewhere in the document
- Phase 1/fallback modes have matching data formats (not just Phase 2/final-state formats)
- Resource calculations (RAM, disk, VM count) add up correctly

Present the checklist to the user: "Here are the 10 checks I'll use. Want to adjust any?" Then proceed unless they object. Don't block on multiple rounds of checklist refinement — the checklist can be adjusted mid-loop if a question turns out to be bad.

### 5. Create Working Directory

```
prd-optimizer-{doc-name}/
  original.md          # backup (never modified)
  document.md          # working copy
  document.md.bak      # previous version (for revert)
  structure-map.json   # entity/reference index
  results.json         # score history
  dashboard.html       # live results dashboard
```

Copy the document to `original.md` and `document.md`. Initialize `results.json`:

```json
{
  "document": "doc-name",
  "startedAt": "ISO timestamp",
  "checklist": ["question1", "question2"],
  "baseline": null,
  "currentScore": null,
  "bestScore": null,
  "consecutiveHighPasses": 0,
  "rounds": []
}
```

Create the dashboard HTML (see Dashboard section below).

## Phase 2: Baseline Scoring

Score every checklist question as pass (1) or fail (0).

**Scoring approach for large documents:** Don't re-read the entire document for each question. Use the structure map to read only the relevant sections for each check. For cross-reference checks, read the two entities being compared. For status consistency checks, scan the sections that contain status markers.

For each failing check, record:
- Which question failed
- The specific section(s) and entity/entities where the problem exists
- A one-line description of what's wrong

Calculate baseline: passing checks / total checks.

Update `results.json` and `dashboard.html`. Report both the structural score AND a brief overall quality note:
```
Baseline: 75% structural compliance (9/12 checks passing)
This measures cross-reference integrity and completeness tracking, not overall document quality.
The document is well-structured with strong actionability — the failing checks are specific
structural gaps that the improvement loop can address.

Failing:
  - D1: CTO says "receives from CEO" but CEO outputs don't mention CTO delegation
  - D2: Chat Coordinator has no defined failure/recovery path
  - D4: "infra-tasks" VM referenced in examples but not in infrastructure table
```

The overall quality note gives the user context so a low structural compliance score on a thorough document doesn't alarm them. Structural compliance and overall quality are different measures.

## Phase 3: Improvement Loop

Repeat autonomously until convergence or max rounds.

### Each Round

**1. Pick the target** — From the failing checks, choose the one that is:
- Most impactful (fixes the most fundamental gap)
- Most tractable (can be fixed with a single, contained change)

Start with easy structural fixes (cross-references, terminology). Progress to harder content additions.

**2. Classify the fix:**

| Fix Type | What it does | Autonomy |
|----------|-------------|----------|
| Add cross-reference | A→B exists but B←A missing | Apply freely |
| Align terminology | Same concept, different names | Apply freely |
| Fix status contradiction | BUILT vs TODO mismatch | Apply freely |
| Add failure/error path | Happy path only, no error handling | Apply freely |
| Resolve open question | Infer answer from existing decisions | Apply freely if inferrable |
| Add missing content | New workflow, entity, or section | Ask user first |
| Add specificity | Vague → concrete detail | Ask user if it's a product decision |

The boundary: if the fix can be inferred from what's already in the document, apply it. If it requires new product/business decisions, ask.

**3. Apply** — Before editing, copy `document.md` to `document.md.bak` (this is your revert path). Then make ONE targeted change using the Edit tool. The change should be minimal and traceable to a specific failing check.

**4. Re-score** — Score ALL checklist questions against the modified document. Use the structure map to read only affected sections — you don't need to re-read the entire document if the change was localized.

**5. Keep or revert:**
- Score improved or equal (and the targeted check now passes) → Keep. Delete `.bak`.
- Score worse or targeted check still fails → Revert by copying `.bak` back to `document.md`.

**6. Record** — Append to `results.json`:
```json
{
  "round": 1,
  "score": 0.83,
  "checks": {"question text": true, "other question": false},
  "fixType": "Add cross-reference",
  "change": "Added 'receives delegation from CEO' to CTO inputs",
  "location": "Persona Requirements > CTO > Inputs I need",
  "kept": true
}
```

**7. Update dashboard** and report one line:
```
Round 1: 83% (was 75%) [KEPT] — cross-reference: added CEO→CTO delegation to CTO inputs
```

### Progress Reporting

For documents over 500 lines, the full loop can take many minutes. Keep the user informed:
- After baseline: report score + top 3 failing checks (not all of them)
- Each round: one-line status (`Round N: XX% [KEPT/REVERTED] — change`)
- Every 3 rounds: brief status summary ("3 rounds done, score moved from X% to Y%, Z rounds remaining before max")

### Stopping Rules

- **Convergence**: Score reaches 90%+ on 3 consecutive rounds → stop, success.
- **Max rounds**: 15 rounds without convergence → stop, report blockers.
- **Plateau**: 3 consecutive rounds with no improvement → switch strategy:
  - If you've been fixing cross-references, try resolving an open question
  - If checklist questions seem unmeetable, flag them and ask the user
  - If remaining failures need business decisions, report and stop
- **One change per round.** Never batch.
- **Dimension rotation**: After 2 rounds targeting the same dimension with no improvement, move to the next-weakest dimension.

## Phase 4: Completion

1. Copy final `document.md` to `<original-name>.improved.md` next to the original
2. Generate a **gap report** listing:
   - Checks that still fail (with evidence and recommended fixes)
   - Items that need user/stakeholder decisions
   - Structural improvements that would require broader restructuring
3. Print final summary:
   - Baseline → final score
   - Rounds run, kept vs reverted
   - Top 3 remaining gaps needing human attention
4. Clean up: remove `.bak` file

## Dashboard

The dashboard is a self-contained HTML file. Create it with this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="10">
  <title>PRD Optimizer — {doc-name}</title>
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
    .check.pass::before { content: "●"; color: #3fb950; }
    .check.fail::before { content: "●"; color: #f85149; }
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
    <h1>PRD Optimizer — <span id="docName"></span></h1>
    <div style="text-align: right">
      <div class="score-big" id="currentScore">—</div>
      <div class="score-label">current score</div>
    </div>
  </div>
  <div class="stats" style="margin-bottom: 24px;">
    <div class="stat"><div class="stat-value" id="baseline">—</div><div class="stat-label">baseline</div></div>
    <div class="stat"><div class="stat-value" id="rounds">0</div><div class="stat-label">rounds</div></div>
    <div class="stat"><div class="stat-value" id="kept">0</div><div class="stat-label">kept</div></div>
    <div class="stat"><div class="stat-value" id="reverted">0</div><div class="stat-label">reverted</div></div>
  </div>
  <div class="grid">
    <div class="card"><h2>Score History</h2><div class="chart" id="chart"></div></div>
    <div class="card"><h2>Checklist (latest)</h2><div id="checks"></div></div>
  </div>
  <div class="card changelog"><h2>Changelog</h2><table><thead><tr><th>Round</th><th>Score</th><th>Type</th><th>Change</th><th>Result</th></tr></thead><tbody id="log"></tbody></table></div>
  <script>
    const DATA = __AUTORESEARCH_DATA__;
    document.getElementById('docName').textContent = DATA.document || '';
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
    scores.forEach((s, i) => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = (s * maxH) + 'px';
      bar.style.flex = '1';
      bar.innerHTML = '<span class="bar-label">' + fmt(s) + '</span>';
      chart.appendChild(bar);
    });
    const checksEl = document.getElementById('checks');
    const lastRound = rounds[rounds.length - 1];
    const checksData = lastRound ? lastRound.checks : {};
    Object.entries(checksData).forEach(([q, passed]) => {
      const div = document.createElement('div');
      div.className = 'check ' + (passed ? 'pass' : 'fail');
      div.textContent = q;
      checksEl.appendChild(div);
    });
    const log = document.getElementById('log');
    rounds.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + r.round + '</td><td>' + fmt(r.score) + '</td><td>' + (r.fixType || '—') + '</td><td>' + (r.change || '') + '</td><td class="' + (r.kept ? 'kept' : 'reverted') + '">' + (r.kept ? 'KEPT' : 'REVERTED') + '</td>';
      log.appendChild(tr);
    });
  </script>
</body>
</html>
```

Each round, replace `__AUTORESEARCH_DATA__` with the current `results.json` content and rewrite the file.

## Modes

**Full (default)** — Setup → baseline → improvement loop → completion.

**Audit only** — "just evaluate" or "audit only": run Phase 1 + 2 only. Score, report gaps, don't modify.

**Focused** — "focus on consistency": only include checks from specified dimension(s).

**Watch** — "re-score": re-read document, re-score all checks, update dashboard. No modifications.
