---
name: skill-optimizer
description: Auto-improve any Claude skill through iterative test-score-refine loops. Reads a target skill, builds a frozen evaluation harness with anchored rubrics, then autonomously loops - execute the skill's instructions, score output against the harness, make one small targeted change, test again, keep if better or revert if not. Use this skill whenever the user says "optimize skill", "improve skill", "refine skill", "auto-improve", "skill-optimizer", "run skill-optimizer on [skill]", "make my [skill] skill better", or wants to systematically improve any skill's output quality through automated iteration.
---

# Skill Optimizer

Iteratively improve a skill's prompt through autonomous test-score-refine loops.

Each round: follow the skill's instructions to produce output, score against a frozen harness, identify the weakest area, make one targeted change, test again, keep if improved, revert if not.

## How This Works (Mental Model)

The harness (like Karpathy's `prepare.py`) is the fixed evaluation function — it defines exactly what "good output" means with anchored rubrics so scoring is consistent across all rounds. The skill being optimized is the mutable artifact (like `train.py`). This optimizer is the program that drives the loop.

The harness is built once per run, validated against the current skill state, and frozen. Within a run, the harness never changes. This ensures every round is scored on the same scale, making keep/revert decisions reliable.

## Phase 1: Setup

### 1. Find the Target Skill

Locate and read the target skill's SKILL.md. Understand its purpose, instructions, and current prompt structure. If the user says "my landing page skill", search for it in `.claude/skills/` and `~/.claude/skills/`.

### 2. Define Test Inputs

Use test inputs provided by the user as parameters. If none were provided, generate 1-3 realistic test inputs from the skill's description automatically. Pick inputs that exercise different aspects of the skill — don't cluster on one type.

Example: for a landing page skill, test inputs might be "write landing page copy for an AI productivity tool that helps developers ship 2x faster" and "write landing page copy for a B2B invoicing SaaS targeting small accounting firms."

### 3. Create Working Directory

Create `skill-optimizer-{skill-name}/` in the current working directory:

```
skill-optimizer-{skill-name}/
  original-skill.md   # backup of original SKILL.md (never modified)
  skill.md             # working copy (modified each round)
  skill.md.bak         # previous version (for revert)
  harness.md           # frozen evaluation harness
  results.json         # score history and changelog
  dashboard.html       # live results dashboard
```

Copy the original SKILL.md body (everything after frontmatter) to both `original-skill.md` and `skill.md`.

Initialize `results.json`:
```json
{
  "skill": "skill-name",
  "startedAt": "ISO timestamp",
  "harness": "harness.md",
  "harnessBuiltAt": "ISO timestamp",
  "testInputs": ["input1"],
  "baseline": null,
  "currentScore": null,
  "bestScore": null,
  "consecutiveHighPasses": 0,
  "rounds": []
}
```

## Phase 2: Build or Validate Harness

The harness is the frozen evaluation function for the run. It lives in `harness.md` inside the working directory.

### If a harness already exists from a previous run:

1. Read the existing `harness.md`
2. Compare it against the current skill state:
   - Has the skill's purpose or scope changed?
   - Have instructions been added, removed, or restructured?
   - Have the test inputs changed?
   - Do the existing checks still make sense for what the skill does now?
3. **If the skill and test inputs haven't changed meaningfully** — reuse the existing harness. Report: `Harness validated — reusing existing harness from previous run. Scores are comparable.`
4. **If the skill or test inputs HAVE changed** — alert the user before rebuilding:
   ```
   ⚠ Skill has changed since the last harness was built:
   - New section added: "Tone guidelines"
   - Test input 2 was updated

   The harness needs to be rebuilt to cover these changes.
   Scores from this run will NOT be comparable to previous runs.
   Rebuilding harness now.
   ```
   Then rebuild the harness following the steps below.

### Building a new harness:

Analyze the skill's instructions and infer the most likely failure modes. If the user passed specific pain points as parameters (e.g., `pain:buzzwords,vague-headlines`), use those to guide criterion selection. Otherwise, derive criteria from the skill's structure — what it asks the LLM to do, what constraints it sets, and where those constraints are weakest.

Generate `harness.md` with this structure:

```markdown
# Evaluation Harness
# Frozen at: {ISO timestamp}
# Skill: {skill name}
# DO NOT MODIFY DURING A RUN

## Test Inputs
1. {input 1}
2. {input 2}
3. {input 3}

## Scoring Criteria

### 1. {Criterion name}
{Anchored rubric}

### 2. {Criterion name}
{Anchored rubric}

...

## Execution Constraints
{Word limits, format requirements, timing constraints}

## Special Rules
{Edge-case handling}

## Output Format
{Exact scoring table structure}
```

### Anchored Rubrics

Each criterion uses a 1-5 scale with concrete anchors. Do NOT use vague labels like "good" or "clear". Every anchor must describe an observable condition in the skill's output.

Example criterion — Headline specificity (for a landing page skill):
```
Does the headline include a specific, quantified outcome?

5 — Headline names a specific metric and number ("Ship 2x faster" / "Cut deploy time by 40 minutes").
4 — Headline implies a measurable outcome but doesn't quantify ("Ship faster with fewer bugs").
3 — Headline names a benefit but it's generic ("Improve your workflow").
2 — Headline is a category label, not a benefit ("AI Productivity Tool").
1 — Headline is filler or a question with no implied outcome ("Ready to transform?").
```

Example criterion — Buzzword avoidance:
```
Is the copy free of empty marketing buzzwords?

5 — Zero buzzwords. Every claim is concrete and specific.
4 — 1 borderline term that could be swapped for something specific.
3 — 2-3 buzzwords present. The copy still communicates but feels generic in places.
2 — Buzzwords dominate key positions (headline, CTA, first sentence).
1 — Reads like a buzzword generator. No concrete claims anywhere.
```

**Rules for writing anchors:**
- Each level must be distinguishable from adjacent levels by an observable condition
- Use counts where possible ("zero buzzwords" vs "2-3 buzzwords") to reduce scoring ambiguity
- The 3-anchor (midpoint) should describe "acceptable but not great"
- Frame from the reader's perspective: "a developer reading this would..."

### Criterion Count

3-6 criteria is the sweet spot. More than that and the skill starts gaming the checklist instead of genuinely improving. Each criterion should target a distinct failure mode.

### Special Rules

Add edge-case rules to bound LLM scoring variance:

- **Generative skills** (copy, content, creative): Score based on the output text itself. Don't penalize the skill's instructions for things the LLM would do anyway.
- **Analytical skills** (review, audit, analysis): Score based on whether the output identifies the right issues, not writing quality.
- **Structural skills** (templates, scaffolds): Score based on whether the structure matches the spec, not content quality.
- **Multi-format skills**: If the skill produces different output types depending on input, score each type against the criteria that apply to it. Don't penalize a summary for not having a CTA.

### Output Format

Every scoring round must produce this exact table:

```
| Input | Criterion              | Score | Evidence (one line)                        |
|-------|------------------------|-------|--------------------------------------------|
| 1     | Headline specificity   | 4     | "Ship faster" — benefit but no number      |
| 1     | Buzzword avoidance     | 5     | Zero buzzwords found                       |
| 2     | Headline specificity   | 3     | Generic "Improve your workflow"            |
| ...   | ...                    | ...   | ...                                        |
|-------|------------------------|-------|--------------------------------------------|
| AVG   |                        | 3.8   |                                            |
```

Log the harness summary (criterion count, test input count) as a status update. Proceed immediately to baseline scoring. The harness CAN be adjusted before the baseline if the user passes specific criteria or pain points as parameters, but once the baseline is scored, it's frozen for the rest of the run.

**Parameters** (optional, passed by user or calling automation):
- `pain:<issue1>,<issue2>` — specific failure modes to target
- `inputs:<input1>|<input2>` — explicit test inputs (pipe-separated)
- `max-rounds:<N>` — override the default 15-round limit
- `mode:audit` — score only, don't modify

## Phase 3: Baseline

1. Read `skill.md`
2. For each test input: follow the skill's instructions as if you were a fresh Claude instance with this skill loaded, producing the output the skill is designed to create
3. Score each output against every harness criterion using the anchored rubrics
4. Calculate baseline: average of all scores, normalized to percentage ((avg - 1) / 4 * 100)
5. Update `results.json` with the baseline score
6. Update `dashboard.html` — replace `__OPTIMIZER_DATA__` with current `results.json`
7. Report:
   ```
   Baseline: 62% (avg 3.5/5 across 4 criteria x 2 inputs)

   Weakest criteria:
     - Headline specificity: avg 2.5 — headlines are generic category labels
     - CTA verb phrase: avg 3.0 — CTAs use "Learn More" on 1 of 2 inputs
   ```

Important: when producing output, genuinely follow the skill instructions. Don't let your knowledge of the harness influence the output — that would defeat the purpose. The harness evaluates the skill's instructions, not your ability to pass the checklist.

## Phase 4: Improvement Loop

Repeat autonomously until stopped or convergence reached.

### Each Round

**1. Analyze** — Look at the harness scores from the previous round. Which criterion has the lowest average score across all test inputs? Focus on that one.

**2. Hypothesize** — Decide on ONE small, targeted change to `skill.md` that would address the weakest criterion. Types of changes:
- Add a specific rule or constraint targeting the failure
- Add a banned-items list (e.g., list of buzzwords to avoid)
- Add a worked example showing the desired pattern
- Clarify an ambiguous instruction
- Reorder instructions to give more prominence to important rules

**3. Apply** — Copy `skill.md` to `skill.md.bak`. Make the single change to `skill.md`.

**4. Test** — Read the modified `skill.md`. Follow its instructions with ALL test inputs. Score each output against the full harness. Calculate the new average score.

**5. Evaluate** — Compare to previous best score:
- **Improved**: Keep the change. Delete `.bak`. Log as KEPT.
- **Same or worse**: Revert `skill.md` from `.bak`. Log as REVERTED.

**6. Record** — Append to `results.json`:
```json
{
  "round": 1,
  "score": 0.72,
  "previousScore": 0.62,
  "checks": {"Headline specificity": 4, "Buzzword avoidance": 5},
  "targetedCriterion": "Headline specificity",
  "targetedBefore": 2.5,
  "targetedAfter": 4.0,
  "change": "Added rule: headline must include a specific number or metric",
  "kept": true
}
```

Update `currentScore`, `bestScore`, and `consecutiveHighPasses`.

**7. Dashboard** — Update `dashboard.html` by replacing `__OPTIMIZER_DATA__` with current `results.json`.

**8. Report** — Print one line: `Round N: XX% (was YY%) [KEPT/REVERTED] — change description`

### Loop Rules

- **One change per round.** Never batch multiple changes — you need to know what helped.
- **Test ALL inputs every round.** Not just one.
- **Plateau strategy**: After 3 consecutive rounds with no improvement, switch approach:
  - If you've been adding rules, try adding a worked example instead
  - If you've been adding examples, try restructuring or reordering
  - If nothing works, log the stuck criterion in the completion report and move on
- **Convergence**: Stop when score reaches 95%+ on 3 consecutive rounds.
- **Max rounds**: Stop after 15 rounds if not converged — report findings in completion summary.

## Phase 5: Completion

1. Copy the final `skill.md` content into the original skill's directory as `SKILL.improved.md` (the original SKILL.md stays untouched)
2. Print a final report:
   - Starting score and final score
   - Per-criterion score trajectory (baseline → final)
   - Rounds run, changes kept vs reverted
   - Summary of each kept change (this changelog documents what works for this specific skill)
3. Remind the user: original is preserved, improved version saved separately. They can review the diff and replace the original when ready.

## Dashboard

The dashboard (`dashboard.html`) is a self-contained HTML file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="10">
  <title>Skill Optimizer — {skill-name}</title>
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
    .crit-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 8px; }
    .crit-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #30363d; color: #8b949e; }
    .crit-table td { padding: 6px 8px; border-bottom: 1px solid #21262d; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Skill Optimizer — <span id="skillName"></span></h1>
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
    <div class="card"><h2>Criteria (latest)</h2><div id="checks"></div></div>
  </div>
  <div class="card" style="margin-bottom: 16px;"><h2>Criterion Averages</h2><table class="crit-table"><thead><tr><th>Criterion</th><th>Baseline</th><th>Current</th><th>Delta</th></tr></thead><tbody id="crits"></tbody></table></div>
  <div class="card changelog"><h2>Changelog</h2><table><thead><tr><th>Round</th><th>Score</th><th>Target</th><th>Change</th><th>Result</th></tr></thead><tbody id="log"></tbody></table></div>
  <script>
    const DATA = __OPTIMIZER_DATA__;
    document.getElementById('skillName').textContent = DATA.skill || '';
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
      tr.innerHTML = '<td>' + r.round + '</td><td>' + fmt(r.score) + '</td><td>' + (r.targetedCriterion || '—') + '</td><td>' + (r.change || '') + '</td><td class="' + (r.kept ? 'kept' : 'reverted') + '">' + (r.kept ? 'KEPT' : 'REVERTED') + '</td>';
      log.appendChild(tr);
    });
  </script>
</body>
</html>
```

Each round, replace `__OPTIMIZER_DATA__` with the current `results.json` content and rewrite the file.
