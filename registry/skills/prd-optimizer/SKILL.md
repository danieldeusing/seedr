---
name: prd-optimizer
description: Iteratively evaluate and improve PRDs and requirements documents through autonomous test-score-refine loops. Reads the PRD, builds a scoring harness with anchored rubrics across PRD-specific quality dimensions (completeness, consistency, actionability, gap detection), then autonomously loops — score, identify weakest area, make one targeted improvement, re-score, keep if better or revert if not. Use this skill whenever the user says "evaluate PRD", "improve PRD", "review requirements", "prd-optimizer", "run prd-optimizer on [doc]", "check my requirements doc", or wants to systematically improve a PRD or requirements specification. Also trigger when users want to find contradictions, missing cross-references, or unresolved questions in a PRD. Do NOT use for architecture docs (use architecture-optimizer), technical docs or API docs (use doc-optimizer), or general planning documents that aren't requirements specifications.
---

# PRD Optimizer

Iteratively evaluate and improve a PRD, requirements document, or plan through autonomous test-score-refine loops.

Each round: score against a frozen harness, identify the weakest area, make one targeted improvement, re-score, keep if improved, revert if not.

## How This Works (Mental Model)

Think of this like a code linter for documents. A linter reads code, checks rules, reports violations, and can auto-fix some of them. This skill does the same thing for requirements documents — it checks structural rules (cross-references match, open questions are resolved, status markers agree) and iteratively fixes violations one at a time.

The harness (like Karpathy's `prepare.py`) is the fixed evaluation function. It defines exactly what "good" means with anchored rubrics so scoring is consistent across rounds. The document is the mutable artifact. This skill is the program that drives the loop.

Key principle: one change per round, measure impact, keep or revert. This prevents cascading mistakes and gives a clear changelog of what helped.

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

## Phase 2: Build or Validate Harness

The harness is the frozen evaluation function for the run. It lives in `harness.md` inside the working directory.

### If a harness already exists from a previous run:

1. Read the existing `harness.md`
2. Compare it against the current document state:
   - Have entities been added, removed, or renamed?
   - Have sections been restructured?
   - Have new cross-references or workflows appeared?
   - Has the document's scope changed (e.g., new components, removed features)?
3. **If the document hasn't changed meaningfully** — reuse the existing harness. Report: `Harness validated — reusing existing harness from previous run. Scores are comparable.`
4. **If the document HAS changed** — alert the user before rebuilding:
   ```
   ⚠ Document has changed since the last harness was built:
   - 2 new entities added (DeployAgent, MonitorAgent)
   - Section "Infrastructure" restructured
   - 4 new cross-references

   The harness needs to be rebuilt to cover these changes.
   Scores from this run will NOT be comparable to previous runs.
   Rebuilding harness now.
   ```
   Then rebuild the harness following the steps below.

### Building a new harness:

Generate `harness.md` with the following structure:

```markdown
# Evaluation Harness
# Frozen at: {ISO timestamp}
# Document: {document name}
# DO NOT MODIFY DURING A RUN

## Scoring Dimensions

### 1. Internal Consistency
{2-3 checks with anchored rubrics}

### 2. Completeness
{2-3 checks with anchored rubrics}

### 3. Actionability
{2-3 checks with anchored rubrics}

### 4. Gap Detection
{2-3 checks with anchored rubrics}

### 5. Self-Consistency
{1-2 checks with anchored rubrics}

## Special Rules
{Edge-case handling rules}

## Output Format
{Exact scoring table structure}
```

### Anchored Rubrics

Each check uses a 1-5 scale with concrete anchors. Do NOT use vague labels like "clear" or "good". Every anchor must describe an observable condition.

Example check — Cross-reference symmetry:
```
When entity A says "I interact with B", does B mention A?

5 — All cross-references are bidirectional. Every "I send to X" has a matching "I receive from X".
4 — 1-2 asymmetric references exist but they're minor (e.g., logging mentions).
3 — 3-5 asymmetric references. An implementer could infer the missing ones.
2 — Multiple missing back-references. An implementer would need to ask which interactions are real.
1 — Cross-references are largely one-directional. The interaction model is unreliable.
```

Example check — Technology specificity:
```
Do decisions name specific technologies, not categories?

5 — Every technology choice names a specific tool/library/service with version or rationale.
4 — Most choices are specific. 1-2 say "a message queue" without naming one.
3 — Mixed. About half are specific, half are categories.
2 — Most technology references are categorical ("a database", "some CI tool").
1 — No specific technology choices. Everything is abstract.
```

**Rules for writing anchors:**
- Each level must be distinguishable from adjacent levels by an observable condition
- Use counts where possible ("1-2 issues" vs "3-5 issues") to reduce scoring ambiguity
- The 3-anchor (midpoint) should describe what "acceptable but not great" looks like
- Frame anchors from the implementer's perspective: "an engineer reading this would..."

### Dimension Coverage

Generate 10-14 total checks across dimensions. Draw 2-3 per dimension. Don't cluster all checks on one type of issue.

**Internal Consistency** — Do statements agree across sections?
- Cross-reference symmetry (A→B implies B→A)
- Terminology consistency (same concept, same name everywhere)
- Status marker agreement (not BUILT in one place and TODO in another)
- Data flow consistency (A produces X for B ↔ B receives X from A)
- Numeric/quantitative consistency (RAM totals, counts match)

**Completeness** — Is every entity fully specified?
- Required fields populated (no TBD, empty, or placeholder values)
- Workflows have triggers, steps, and outcomes
- Interfaces have defined protocols/formats
- Open questions answered or explicitly deferred

**Actionability** — Can an implementer build from this without guessing?
- Specific technologies named, not categories
- Sequences have clear ordering and ownership
- Data formats specified at exchange points
- Implementation priority defined

**Gap Detection** — Are there missing pieces?
- Referenced entities that are never defined
- Workflows with no error/failure path
- Integration points with no protocol
- Entities in examples but absent from definitions

**Self-Consistency** — Does the document follow its own rules?
- Examples comply with stated rules/constraints
- Phase 1/fallback modes have matching data formats
- Resource calculations add up

### Special Rules

Add edge-case rules to bound LLM scoring variance. These handle situations where the general rubric is ambiguous:

- **Infrastructure tasks** (VMs, networking, storage): Score actionability based on whether config values are specified (IP ranges, resource limits, port numbers), not whether business logic is clear.
- **Cross-epic dependencies**: When entity A in Epic 1 depends on entity B in Epic 2, score completeness based on whether the dependency is explicitly declared with a clear interface contract, not whether both sides are fully specified in the same section.
- **Intentionally deferred items**: Items explicitly marked as "deferred to Phase 2" or "out of scope" should NOT count as gaps. Only unacknowledged gaps count.
- **Aggregate metrics**: When scoring numeric consistency, allow ±5% rounding tolerance for resource calculations.

### Output Format

Every scoring round must produce this exact table:

```
| Dimension          | Check                        | Score | Evidence (one line)                    |
|--------------------|------------------------------|-------|----------------------------------------|
| Consistency        | Cross-ref symmetry           | 4     | 1 asymmetric ref: CEO→CTO missing      |
| Consistency        | Terminology                  | 5     | All terms consistent                   |
| ...                | ...                          | ...   | ...                                    |
|--------------------|------------------------------|-------|----------------------------------------|
| OVERALL            |                              | 3.8   |                                        |
```

Log the harness summary (dimension count, check count) to the user as a status update. Proceed immediately to baseline scoring. The harness CAN be adjusted before the baseline if the user passes specific criteria or dimensions as parameters, but once the baseline is scored, it's frozen for the rest of the run.

**Parameters** (optional, passed by user or calling automation):
- `focus:<dimension>` — only include checks from specified dimension(s)
- `skip:<dimension>` — exclude specific dimensions
- `max-rounds:<N>` — override the default 15-round limit
- `mode:audit` — score only, don't modify

## Phase 3: Baseline Scoring

Score every harness check against the current document using the anchored rubrics.

**Scoring approach for large documents:** Don't re-read the entire document for each check. Use the structure map to read only the relevant sections. For cross-reference checks, read the two entities being compared. For status consistency checks, scan the sections that contain status markers.

For each check, record:
- The score (1-5) with the specific anchor level it matches
- One-line evidence citing the section(s) and what you observed

Calculate baseline: average of all check scores, normalized to percentage ((avg - 1) / 4 * 100).

**Score calibration note:** These checks measure *structural rule compliance* — whether cross-references match, open questions are tracked, examples align with definitions. A thorough document can still score low on structural compliance. Report the score with context.

Update `results.json` and `dashboard.html`. Report both the structural score AND a brief overall quality note:
```
Baseline: 68% structural compliance (avg 3.7/5 across 12 checks)
This measures cross-reference integrity and completeness tracking, not overall document quality.

Weakest dimensions:
  - Gap Detection: avg 2.5 — 3 referenced entities never defined, 2 workflows lack error paths
  - Completeness: avg 3.0 — several interfaces missing protocol specs
  - Consistency: avg 4.2 — minor cross-ref asymmetries
```

## Phase 4: Improvement Loop

Repeat autonomously until convergence or max rounds.

### Each Round

**1. Pick the target** — From the harness scores, find the single check with the lowest score. If tied, pick the most impactful (most fundamental gap). Start with easy structural fixes. Progress to harder content additions.

**2. Classify the fix:**

| Fix Type | What it does | Autonomy |
|----------|-------------|----------|
| Add cross-reference | A→B exists but B←A missing | Apply freely |
| Align terminology | Same concept, different names | Apply freely |
| Fix status contradiction | BUILT vs TODO mismatch | Apply freely |
| Add failure/error path | Happy path only, no error handling | Apply freely |
| Resolve open question | Infer answer from existing decisions | Apply freely if inferrable |
| Add missing content | New workflow, entity, or section | Apply if inferrable, otherwise skip and log as "needs human decision" |
| Add specificity | Vague → concrete detail | Apply if inferrable, otherwise skip and log as "needs human decision" |

The boundary: if the fix can be inferred from what's already in the document, apply it. If it requires new product/business decisions, skip it, log it in the gap report, and move to the next-weakest check.

**3. Apply** — Before editing, copy `document.md` to `document.md.bak` (this is your revert path). Then make ONE targeted change using the Edit tool. The change should be minimal and traceable to a specific harness check.

**4. Re-score** — Score ALL harness checks against the modified document. Use the structure map to read only affected sections — you don't need to re-read the entire document if the change was localized. Use the exact same anchored rubrics from the frozen harness.

**5. Keep or revert:**
- Overall average improved (or equal, AND the targeted check improved) → Keep. Delete `.bak`.
- Overall average worse, or targeted check didn't improve → Revert by copying `.bak` back to `document.md`.

**6. Record** — Append to `results.json`:
```json
{
  "round": 1,
  "score": 0.72,
  "previousScore": 0.68,
  "checks": {"Cross-ref symmetry": 5, "Terminology": 5},
  "targetedCheck": "Cross-ref symmetry",
  "targetedCheckBefore": 4,
  "targetedCheckAfter": 5,
  "fixType": "Add cross-reference",
  "change": "Added 'receives delegation from CEO' to CTO inputs",
  "location": "Persona Requirements > CTO > Inputs I need",
  "kept": true
}
```

**7. Update dashboard** and report one line:
```
Round 1: 72% (was 68%) [KEPT] — cross-reference: added CEO→CTO delegation to CTO inputs
```

### Progress Reporting

For documents over 500 lines, the full loop can take many minutes. Keep the user informed:
- After baseline: report score + top 3 weakest dimensions
- Each round: one-line status (`Round N: XX% [KEPT/REVERTED] — change`)
- Every 3 rounds: brief status summary ("3 rounds done, score moved from X% to Y%, Z rounds remaining before max")

### Stopping Rules

- **Convergence**: Overall score reaches 90%+ on 3 consecutive rounds → stop, success.
- **Max rounds**: 15 rounds without convergence → stop, report blockers.
- **Plateau**: 3 consecutive rounds with no improvement → switch strategy:
  - If you've been fixing cross-references, try resolving an open question
  - If harness checks seem unmeetable, log them in the gap report and skip
  - If remaining failures need business decisions, log them and move to the next-weakest dimension
- **One change per round.** Never batch.
- **Dimension rotation**: After 2 rounds targeting the same dimension with no improvement, move to the next-weakest dimension.

## Phase 5: Completion

1. Copy final `document.md` to `<original-name>.improved.md` next to the original
2. Generate a **gap report** listing:
   - Checks that still score below 4 (with evidence and recommended fixes)
   - Items that need user/stakeholder decisions
   - Structural improvements that would require broader restructuring
3. Print final summary:
   - Baseline → final score
   - Rounds run, kept vs reverted
   - Per-dimension score trajectory (baseline → final)
   - Top 3 remaining gaps needing human attention
4. Clean up: remove `.bak` file

## Working Directory

```
prd-optimizer-{doc-name}/
  original.md          # backup (never modified)
  document.md          # working copy
  document.md.bak      # previous version (for revert)
  structure-map.json   # entity/reference index
  harness.md           # frozen evaluation harness
  results.json         # score history
  dashboard.html       # live results dashboard
```

Copy the document to `original.md` and `document.md`. Initialize `results.json`:

```json
{
  "document": "doc-name",
  "startedAt": "ISO timestamp",
  "harness": "harness.md",
  "harnessBuiltAt": "ISO timestamp",
  "baseline": null,
  "currentScore": null,
  "bestScore": null,
  "consecutiveHighPasses": 0,
  "rounds": []
}
```

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
    .check.high::before { content: "●"; color: #3fb950; }
    .check.mid::before { content: "●"; color: #d29922; }
    .check.low::before { content: "●"; color: #f85149; }
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
    .dim-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 8px; }
    .dim-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #30363d; color: #8b949e; }
    .dim-table td { padding: 6px 8px; border-bottom: 1px solid #21262d; }
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
    <div class="card"><h2>Checks (latest)</h2><div id="checks"></div></div>
  </div>
  <div class="card" style="margin-bottom: 16px;"><h2>Dimension Averages</h2><table class="dim-table"><thead><tr><th>Dimension</th><th>Baseline</th><th>Current</th><th>Delta</th></tr></thead><tbody id="dims"></tbody></table></div>
  <div class="card changelog"><h2>Changelog</h2><table><thead><tr><th>Round</th><th>Score</th><th>Target</th><th>Change</th><th>Result</th></tr></thead><tbody id="log"></tbody></table></div>
  <script>
    const DATA = __OPTIMIZER_DATA__;
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
      tr.innerHTML = '<td>' + r.round + '</td><td>' + fmt(r.score) + '</td><td>' + (r.targetedCheck || '—') + '</td><td>' + (r.change || '') + '</td><td class="' + (r.kept ? 'kept' : 'reverted') + '">' + (r.kept ? 'KEPT' : 'REVERTED') + '</td>';
      log.appendChild(tr);
    });
  </script>
</body>
</html>
```

Each round, replace `__OPTIMIZER_DATA__` with the current `results.json` content and rewrite the file.

## Modes

**Full (default)** — Setup → harness → baseline → improvement loop → completion.

**Audit only** — "just evaluate" or "audit only": run Phase 1-3 only. Score, report gaps, don't modify.

**Focused** — "focus on consistency": only include checks from specified dimension(s) in the harness.

**Watch** — "re-score": re-read document, re-score all harness checks, update dashboard. No modifications.
