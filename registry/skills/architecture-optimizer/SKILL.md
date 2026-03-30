---
name: architecture-optimizer
description: Iteratively evaluate and improve architecture documents, system design docs, and technical design specifications through autonomous test-score-refine loops. Reads the architecture doc, builds a component map (components, interfaces, data flows, dependencies, deployment topology), builds a scoring harness with anchored rubrics across architecture-specific quality dimensions (component responsibility clarity, interface contract completeness, failure mode analysis, data flow consistency, scalability/capacity planning, security boundary definition), then autonomously loops — score, identify weakest area, make one targeted improvement, re-score, keep if better or revert if not. Use this skill whenever the user says "evaluate architecture", "improve architecture doc", "review system design", "architecture-optimizer", "run architecture-optimizer on [doc]", "check my design doc", "review technical design", or wants to systematically improve an architecture document or system design specification. Also trigger when users want to find missing interface contracts, undocumented failure modes, or incomplete data flows in a technical design. Do NOT use for PRDs or requirements docs (use prd-optimizer), user-facing documentation (use doc-optimizer), or code (use code-optimizer).
---

# Architecture Optimizer

Iteratively evaluate and improve an architecture document, system design doc, or technical design specification through autonomous test-score-refine loops.

Each round: score against a frozen harness, identify the weakest area, make one targeted improvement, re-score, keep if improved, revert if not.

## How This Works (Mental Model)

Think of this like a structural integrity checker for technical designs. An architecture doc defines HOW to build a system — components, their responsibilities, how they communicate, what happens when things fail, and how the system scales. This skill checks whether those decisions are documented completely and consistently, then iteratively fills gaps.

The harness is the fixed evaluation function. It defines exactly what "good architecture documentation" means with anchored rubrics so scoring is consistent across rounds. The document is the mutable artifact. This skill drives the loop.

Key principle: one change per round, measure impact, keep or revert. This prevents cascading mistakes and gives a clear changelog of what helped.

## Phase 1: Setup

### 1. Locate and Scan the Document

Read the target architecture document. It can be a system design doc, technical design specification, ADR collection, or any structured technical architecture artifact.

**For large documents (>500 lines):** Don't try to hold the entire document in working memory. Instead, scan it in chunks and build a component index — component names, interface boundaries, and their line ranges. This index is your map for targeted reads during scoring.

### 2. Summarize the Document

Before any technical analysis, produce a 2-3 sentence summary of what the document IS — its purpose, scope, and the system it describes. This grounds the user and frames the scoring that follows.

Example: "This document specifies the architecture for a real-time event processing pipeline. It defines 6 services (ingestion, validation, routing, processing, storage, notification), their communication protocols, a PostgreSQL + Redis data layer, and AWS deployment topology targeting 10K events/sec."

### 3. Build Component Map

Map the architecture's anatomy:
- **Components**: Named services, modules, or subsystems and their stated responsibilities
- **Interfaces**: How components communicate (protocols, data formats, sync/async)
- **Data flows**: End-to-end paths data takes through the system
- **Data stores**: Databases, caches, queues, file systems
- **External dependencies**: Third-party APIs, services, infrastructure
- **Deployment topology**: Where components run (servers, containers, regions, zones)
- **Decisions**: ADRs or stated technology choices (resolved vs open)

Save the component map to `component-map.json` in the working directory.

Report to the user: "This architecture defines N components with M interfaces, X data stores, Y external dependencies, and Z deployment targets."

## Phase 2: Build or Validate Harness

The harness is the frozen evaluation function for the run. It lives in `harness.md` inside the working directory.

### If a harness already exists from a previous run:

1. Read the existing `harness.md`
2. Compare it against the current document state:
   - Have components been added, removed, or renamed?
   - Have interfaces or data flows changed?
   - Have new external dependencies or deployment targets appeared?
   - Has the system's scope changed?
3. **If the document hasn't changed meaningfully** — reuse the existing harness. Report: `Harness validated — reusing existing harness from previous run. Scores are comparable.`
4. **If the document HAS changed** — alert the user before rebuilding:
   ```
   ⚠ Document has changed since the last harness was built:
   - 2 new components added (CacheLayer, MetricsCollector)
   - Interface between API Gateway and AuthService restructured
   - 3 new data flows

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

### 1. Component Responsibility Clarity
{checks with anchored rubrics}

### 2. Interface Contract Completeness
{checks with anchored rubrics}

### 3. Failure Mode Analysis
{checks with anchored rubrics}

### 4. Data Flow Consistency
{checks with anchored rubrics}

### 5. Scalability / Capacity Planning
{checks with anchored rubrics}

### 6. Security Boundary Definition
{checks with anchored rubrics}

## Special Rules
{Edge-case handling rules}

## Output Format
{Exact scoring table structure}
```

### Anchored Rubrics

Each dimension uses a 1-5 scale with concrete anchors. Do NOT use vague labels like "clear" or "good". Every anchor must describe an observable condition.

**Component responsibility clarity:**
```
5 — Every component has a single, well-defined responsibility. Reading the description tells you exactly what it owns and what it doesn't. No overlapping ownership.
4 — Components are mostly well-scoped. 1-2 have slightly fuzzy boundaries but an engineer could infer the intent.
3 — Some components are too broad ("handles all user operations") or overlap with others. An engineer would need to ask where certain logic belongs.
2 — Multiple components have unclear or overlapping responsibilities. Ownership disputes would arise during implementation.
1 — Components are grab-bags of loosely related concerns. No clear ownership model.
```

**Interface contract completeness:**
```
5 — Every component-to-component interaction specifies: protocol, data format, error handling, and expected latency/throughput. Contract is implementable without questions.
4 — Most interfaces are well-specified. 1-2 are missing error handling or data format details.
3 — Interfaces exist but are incomplete. About half specify the full contract. Others say "calls API" without format or error details.
2 — Most interfaces are hand-wavy ("communicates with", "sends data to"). An engineer would need to design the contract from scratch.
1 — Interfaces are barely mentioned. Components are described in isolation. How they talk to each other is left as an exercise.
```

**Failure mode analysis:**
```
5 — Every component and critical path has identified failure modes with specific mitigation strategies (retry, circuit breaker, fallback, graceful degradation). Cascading failure scenarios are addressed.
4 — Major failure modes are identified. 1-2 components or paths lack explicit failure handling. No cascading failure analysis.
3 — Some failure modes mentioned but inconsistently. Happy path is well-designed but what happens when DB is down or API times out is spotty.
2 — Failure handling is an afterthought. Most components assume everything works. A few "error handling TBD" notes.
1 — No failure mode analysis. The architecture assumes perfect availability. A single component failure would have unknown cascading effects.
```

**Data flow consistency:**
```
5 — Every data path is traceable end-to-end. Data formats are consistent across boundaries. Storage schemas match what components produce and consume. No orphaned data.
4 — Data flows are mostly traceable. 1-2 format transformations are implicit.
3 — Major data flows are documented. Some intermediate transformations are unclear. A few "data is passed through" without specifying format.
2 — Data flows are fragmentary. Multiple gaps where data format or transformation is unspecified.
1 — Data flows are largely undocumented. How data gets from A to B is unclear for most paths.
```

**Scalability / capacity planning:**
```
5 — Load estimates are quantified (requests/sec, data volume, growth rate). Bottlenecks are identified with specific scaling strategies (horizontal, caching, sharding). Capacity limits are stated.
4 — Scaling approach is described. Most bottlenecks identified. 1-2 missing quantified limits.
3 — General scaling strategy exists ("we'll use horizontal scaling") but without specifics. Some bottlenecks identified, others not.
2 — Scaling is mentioned vaguely ("should scale well"). No quantified estimates. Bottlenecks not analyzed.
1 — No scaling consideration. Architecture assumes current scale forever.
```

**Security boundary definition:**
```
5 — Trust boundaries are explicit. Auth/authz is specified per component. Data classification (PII, secrets) is mapped. Network segmentation is defined. Zero-trust where applicable.
4 — Security boundaries exist. Auth model is clear. 1-2 components lack explicit trust boundary definition.
3 — Some security considerations. Auth is mentioned but not fully specified per component. Data classification is partial.
2 — Security is addressed only at the perimeter. Internal trust boundaries are undefined. Auth model is vague.
1 — Security is not addressed in the architecture. No trust boundaries, no auth model, no data classification.
```

**Rules for writing anchors:**
- Each level must be distinguishable from adjacent levels by an observable condition
- Use counts where possible ("1-2 issues" vs "several issues") to reduce scoring ambiguity
- The 3-anchor (midpoint) should describe what "acceptable but not great" looks like
- Frame anchors from the implementing engineer's perspective: "an engineer reading this would..."

### Dimension Coverage

Generate 12-16 total checks across dimensions. Draw 2-3 per dimension. Don't cluster all checks on one type of issue. For each dimension, write 2-3 specific checks that apply the anchored rubric to concrete aspects of THIS document's architecture.

### Special Rules

- **ADRs (Architecture Decision Records)**: If the document contains ADRs or stated decisions, preserve them. Don't change decided items — only improve documentation of the decision rationale.
- **Technology choices**: Score whether a technology choice is DOCUMENTED well (rationale, trade-offs, alternatives considered), not whether it's the RIGHT choice. Don't second-guess decided technologies.
- **Diagrams (mermaid, ASCII)**: Don't modify diagrams directly. If a diagram is inconsistent with the text, flag it but fix the text to match the diagram (diagrams are usually more carefully maintained).
- **PRD cross-reference**: If the architecture doc references a PRD and that PRD is accessible, cross-reference component coverage against PRD requirements. But never modify the PRD.
- **Intentionally deferred items**: Items explicitly marked as "deferred", "out of scope", or "Phase 2" should NOT count as gaps. Only unacknowledged gaps count.
- **Infrastructure specifics**: For deployment topology, score based on whether operational details are specified (regions, instance types, scaling triggers), not whether the choice is optimal.

### Output Format

Every scoring round must produce this exact table:

```
| Dimension              | Check                          | Score | Evidence (one line)                          |
|------------------------|--------------------------------|-------|----------------------------------------------|
| Responsibility         | Service scope clarity          | 4     | 1 service ("DataProcessor") has fuzzy scope  |
| Interface              | API contract specs             | 3     | 3/6 interfaces lack error response formats   |
| ...                    | ...                            | ...   | ...                                          |
|------------------------|--------------------------------|-------|----------------------------------------------|
| OVERALL                |                                | 3.4   |                                              |
```

Log the harness summary (dimension count, check count) to the user as a status update. Proceed immediately to baseline scoring. The harness CAN be adjusted before the baseline if the user passes specific criteria or dimensions as parameters, but once the baseline is scored, it's frozen for the rest of the run.

**Parameters** (optional, passed by user or calling automation):
- `focus:<dimension>` — only include checks from specified dimension(s)
- `skip:<dimension>` — exclude specific dimensions
- `max-rounds:<N>` — override the default 15-round limit
- `mode:audit` — score only, don't modify

## Phase 3: Baseline Scoring

Score every harness check against the current document using the anchored rubrics.

**Scoring approach for large documents:** Don't re-read the entire document for each check. Use the component map to read only the relevant sections. For interface checks, read the two components being compared. For data flow checks, trace the specific path.

For each check, record:
- The score (1-5) with the specific anchor level it matches
- One-line evidence citing the section(s) and what you observed

Calculate baseline: average of all check scores, normalized to percentage ((avg - 1) / 4 * 100).

Update `results.json` and `dashboard.html`. Report both the structural score AND a brief overall quality note:
```
Baseline: 52% structural compliance (avg 3.1/5 across 14 checks)
This measures architecture documentation completeness, not design quality.

Weakest dimensions:
  - Failure Mode Analysis: avg 1.5 — no failure modes documented for any component
  - Scalability: avg 2.0 — "will scale horizontally" without numbers
  - Interface Contracts: avg 2.5 — most interfaces say "REST API" without request/response formats
```

## Phase 4: Improvement Loop

Repeat autonomously until convergence or max rounds.

### Each Round

**1. Pick the target** — From the harness scores, find the single check with the lowest score. If tied, pick the most impactful. Start with easy documentation additions. Progress to harder analytical content.

**2. Classify the fix:**

| Fix Type | What it does | Autonomy |
|----------|-------------|----------|
| Add interface detail | Specify protocol, format, or error handling | Apply freely |
| Add failure mode | Document what happens when a component fails | Apply freely (infer from component type and dependencies) |
| Add scaling analysis | Quantify load or identify bottleneck | Apply freely if numbers can be inferred from existing context |
| Clarify responsibility boundary | Define what a component owns vs doesn't | Apply freely |
| Add security boundary | Define trust boundary or auth requirement | Apply freely |
| Add data format specification | Specify schema at a component boundary | Apply freely |
| Add new component or change architecture decisions | Structural change to the design | Skip, log as "needs human decision" |

The boundary: if the improvement can be inferred from what's already in the document (component types, stated requirements, deployment targets), apply it. If it requires new architecture decisions, skip it, log it in the gap report, and move to the next-weakest check.

**3. Apply** — Before editing, copy `document.md` to `document.md.bak` (this is your revert path). Then make ONE targeted change using the Edit tool. The change should be minimal and traceable to a specific harness check.

**4. Re-score** — Score ALL harness checks against the modified document. Use the component map to read only affected sections. Use the exact same anchored rubrics from the frozen harness.

**5. Keep or revert:**
- Overall average improved (or equal, AND the targeted check improved) → Keep. Delete `.bak`.
- Overall average worse, or targeted check didn't improve → Revert by copying `.bak` back to `document.md`.

**6. Record** — Append to `results.json`:
```json
{
  "round": 1,
  "score": 0.56,
  "previousScore": 0.52,
  "checks": {"Service scope clarity": 4, "API contract specs": 4},
  "targetedCheck": "API contract specs",
  "targetedCheckBefore": 3,
  "targetedCheckAfter": 4,
  "fixType": "Add interface detail",
  "change": "Added request/response JSON schemas for AuthService → UserService interface",
  "location": "Component Interfaces > Auth-User Contract",
  "kept": true
}
```

**7. Update dashboard** and report one line:
```
Round 1: 56% (was 52%) [KEPT] — interface: added Auth→User request/response schemas
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
  - If you've been adding interface details, try documenting failure modes
  - If harness checks seem unmeetable, log them in the gap report and skip
  - If remaining failures need architecture decisions, log them and move to the next-weakest dimension
- **One change per round.** Never batch.
- **Dimension rotation**: After 2 rounds targeting the same dimension with no improvement, move to the next-weakest dimension.

## Phase 5: Completion

1. Copy final `document.md` to `<original-name>.improved.md` next to the original
2. Generate a **gap report** listing:
   - Checks that still score below 4 (with evidence and recommended fixes)
   - Items that need architecture decisions from the team
   - Structural improvements that would require broader redesign
3. Print final summary:
   - Baseline → final score
   - Rounds run, kept vs reverted
   - Per-dimension score trajectory (baseline → final)
   - Top 3 remaining gaps needing human attention
4. Clean up: remove `.bak` file

## Working Directory

```
architecture-optimizer-{doc-name}/
  original.md          # backup (never modified)
  document.md          # working copy
  document.md.bak      # previous version (for revert)
  component-map.json   # component/interface/data flow index
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
  <title>Architecture Optimizer — {doc-name}</title>
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
    <h1>Architecture Optimizer — <span id="docName"></span></h1>
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
    const dimsEl = document.getElementById('dims');
    const dimNames = ['Responsibility', 'Interface', 'Failure Mode', 'Data Flow', 'Scalability', 'Security'];
    const baselineChecks = DATA.baselineChecks || {};
    const currentChecks = checksData;
    dimNames.forEach(dim => {
      const bScores = Object.entries(baselineChecks).filter(([k]) => k.startsWith(dim)).map(([,v]) => v);
      const cScores = Object.entries(currentChecks).filter(([k]) => k.startsWith(dim)).map(([,v]) => v);
      if (bScores.length === 0 && cScores.length === 0) return;
      const bAvg = bScores.length ? (bScores.reduce((a,b) => a+b, 0) / bScores.length).toFixed(1) : '—';
      const cAvg = cScores.length ? (cScores.reduce((a,b) => a+b, 0) / cScores.length).toFixed(1) : '—';
      const delta = (bScores.length && cScores.length) ? (parseFloat(cAvg) - parseFloat(bAvg)).toFixed(1) : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + dim + '</td><td>' + bAvg + '</td><td>' + cAvg + '</td><td>' + (delta > 0 ? '+' : '') + delta + '</td>';
      dimsEl.appendChild(tr);
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

**Focused** — "focus on failure modes": only include checks from specified dimension(s) in the harness.

**Watch** — "re-score": re-read document, re-score all harness checks, update dashboard. No modifications.
