---
name: prompt-optimizer
description: Iteratively evaluate and improve prompts and system prompts embedded in application source code through autonomous test-score-refine loops. Finds the prompt in source code (Python strings, YAML configs, JSON files, template files, TypeScript/JavaScript), extracts it, builds a frozen evaluation harness with anchored rubrics, then autonomously loops — run the prompt against test inputs, score output quality, make one targeted change to the prompt in-place, re-score, keep if better or revert if not. Use this skill whenever the user says "optimize prompt", "improve this prompt", "refine this system prompt", "prompt-optimizer", "run prompt-optimizer on [file]", "make this prompt better", "tune this prompt", "improve my LLM prompt", or wants to systematically improve any prompt embedded in application code through automated iteration. Also trigger when users want to reduce hallucinations, improve output format compliance, tighten instructions, or make a prompt more robust against edge cases. Do NOT use for SKILL.md files (use skill-optimizer) or standalone prompt files that aren't part of an application.
---

# Prompt Optimizer

Iteratively improve prompts embedded in application source code through autonomous test-score-refine loops.

Each round: run the prompt against test inputs, score outputs against a frozen harness, identify the weakest area, make one targeted change to the prompt in-place, re-score, keep if improved, revert if not.

## How This Works (Mental Model)

The harness (like Karpathy's `prepare.py`) is the fixed evaluation function — it defines exactly what "good prompt output" means with anchored rubrics so scoring is consistent across all rounds. The prompt being optimized is the mutable artifact (like `train.py`). This optimizer is the program that drives the loop.

The harness is built once per run, validated against the current prompt state, and frozen. Within a run, the harness never changes. This ensures every round is scored on the same scale, making keep/revert decisions reliable.

**Key distinction:** This optimizer handles prompts embedded in source code — strings in `.py`, `.ts`, `.js` files, or in `.yaml`/`.json` config files used by AI-powered applications. It edits prompts in-place within their source files. It does NOT handle SKILL.md files (use skill-optimizer for those) or standalone prompt documents (use prd-optimizer for requirements-style docs).

## Phase 1: Setup

### 1. Find the Prompt

Locate the prompt in the source code. The user will point at a file or variable. Read the file and:
- Extract the full prompt text
- Record its location: file path, line range, variable/key name
- Identify the surrounding code context (how the prompt is used, what API it's sent to)
- Detect template variables (`{{user_input}}`, `{context}`, `${query}`, etc.) — these are part of the application interface and must be preserved exactly
- Identify the target model if inferrable from surrounding code (model parameter, API endpoint, client configuration)
- Determine if it's a system prompt, user prompt, or part of a multi-turn conversation

### 2. Define Test Inputs

Use test inputs provided by the user via the `inputs:` parameter. If none were provided:
- Look for existing test files, fixtures, or example inputs in the codebase
- Check for sample data in the same directory or test directories
- If nothing found, generate 2-4 realistic test inputs from the prompt's purpose, including at least one edge case (empty input, very long input, off-topic input)

### 3. Create Working Directory

Create `prompt-optimizer-{prompt-name}/` in the current working directory:

```
prompt-optimizer-{prompt-name}/
  original-prompt.txt    # backup of original prompt text (never modified)
  prompt-location.json   # file path, line range, variable name, template vars
  harness.md             # frozen evaluation harness
  results.json           # score history and changelog
  dashboard.html         # live results dashboard
```

Save the original prompt text to `original-prompt.txt`. Save location metadata to `prompt-location.json`:
```json
{
  "file": "src/agents/summarizer.py",
  "lineStart": 24,
  "lineEnd": 45,
  "variableName": "SYSTEM_PROMPT",
  "templateVars": ["{{document}}", "{{max_length}}"],
  "targetModel": "claude-sonnet-4-20250514",
  "promptType": "system"
}
```

Initialize `results.json`:
```json
{
  "prompt": "prompt-name",
  "file": "src/agents/summarizer.py",
  "startedAt": "ISO timestamp",
  "harness": "harness.md",
  "harnessBuiltAt": "ISO timestamp",
  "testInputs": ["input1", "input2"],
  "baseline": null,
  "currentScore": null,
  "bestScore": null,
  "consecutiveHighPasses": 0,
  "tokenCount": null,
  "rounds": []
}
```

## Phase 2: Build or Validate Harness

The harness is the frozen evaluation function for the run. It lives in `harness.md`.

### If a harness already exists from a previous run:

1. Read the existing `harness.md`
2. Compare it against the current prompt state:
   - Has the prompt's purpose or scope changed?
   - Have instructions been added, removed, or restructured?
   - Have the test inputs changed?
   - Have template variables changed?
   - Do the existing criteria still apply?
3. **If the prompt and test inputs haven't changed meaningfully** — reuse the existing harness. Report: `Harness validated — reusing existing harness from previous run. Scores are comparable.`
4. **If the prompt or test inputs HAVE changed** — alert before rebuilding:
   ```
   ⚠ Prompt has changed since the last harness was built:
   - New instruction added: "Always respond in JSON"
   - Template variable {{max_length}} was removed

   The harness needs to be rebuilt to cover these changes.
   Scores from this run will NOT be comparable to previous runs.
   Rebuilding harness now.
   ```
   Then rebuild the harness following the steps below.

### Building a new harness:

Analyze the prompt's instructions and infer the most likely failure modes. Generate `harness.md` with sections: Test Inputs, Deterministic Verifiers, LLM-Judged Criteria (with anchored rubrics below), Special Rules, and Output Format. Header must include frozen timestamp, prompt name, file path, and `DO NOT MODIFY DURING A RUN`.

### Deterministic Verifiers

- **Source file integrity**: After editing the prompt in-place, the source file must still parse/compile. Run the language-appropriate syntax check. Failure = auto-revert.
- **Template variable preservation**: Every template variable found in the original prompt must be present in the modified prompt. Missing variable = auto-revert.
- **Token count**: Tracked each round. If the user specified `max-tokens:<N>`, exceeding it = auto-revert. Otherwise, flag significant increases (>20%) as a warning.
- **Format compliance**: If the prompt requests structured output, validate that test outputs conform. Parse JSON, validate XML, check markdown structure.
- **Regression tests**: If existing test fixtures map inputs to expected outputs, those must still pass.

### LLM-Judged Criteria

Use these four criteria with their anchored rubrics. Adjust anchors to be specific to the prompt's purpose.

**Output quality on test cases:**
```
5 — Output matches intent perfectly on all test inputs. Correct format, correct content, no hallucination, no refusals on valid inputs.
4 — Output is correct on all test inputs with minor imperfections (slightly verbose, one field slightly off).
3 — Output is mostly correct. 1-2 test inputs produce suboptimal results (wrong tone, missing a field, slightly off-target).
2 — Multiple test inputs produce incorrect or incomplete output. The prompt's intent is not reliably achieved.
1 — Output frequently misses the mark. Wrong format, wrong content, or refusals on valid inputs.
```

**Instruction clarity:**
```
5 — A fresh model instance would follow these instructions correctly on the first try. Every constraint is explicit. No ambiguity about format, tone, or scope.
4 — Instructions are clear. 1 constraint is implicit but would likely be inferred correctly.
3 — Some instructions are ambiguous. A model might interpret "keep it brief" differently across runs. 1-2 important constraints are missing.
2 — Multiple ambiguous instructions. Different runs produce notably different outputs. Key constraints are missing.
1 — Instructions are vague, contradictory, or incomplete. Output quality is largely luck.
```

**Robustness:**
```
5 — Handles edge-case inputs gracefully (empty, very long, adversarial, off-topic). Fails safely with clear messages rather than hallucinating.
4 — Handles most edge cases. 1 edge-case input produces unexpected behavior.
3 — Happy-path inputs work well. 2-3 edge cases cause problems (hallucination, wrong format, infinite loops in output).
2 — Only works reliably on "perfect" inputs. Slight variations cause failures.
1 — Fragile. Even normal-looking inputs sometimes produce wrong output.
```

**Conciseness:**
```
5 — Every sentence in the prompt earns its place. Same output quality couldn't be achieved with fewer tokens. No redundant instructions or over-explanation.
4 — Prompt is efficient. 1-2 sentences could be removed or shortened without quality loss.
3 — Some redundancy. 15-25% of the prompt could be trimmed. Some instructions repeat in different words.
2 — Significantly bloated. Much of the prompt is filler, repetition, or over-hedging. 30-50% could be cut.
1 — Prompt is mostly noise. Core instruction is buried in boilerplate.
```

### Output Format

Every scoring round must produce:

```
## Deterministic Results
| Verifier                | Result         | Status |
|-------------------------|----------------|--------|
| Source file integrity   | Parses OK      | OK     |
| Template vars preserved | All 3 present  | OK     |
| Token count             | 482 tokens     | OK     |
| Format compliance       | Valid JSON 3/3  | OK     |

## LLM Criteria
| Input | Criterion           | Score | Evidence (one line)                              |
|-------|---------------------|-------|--------------------------------------------------|
| 1     | Output quality      | 4     | Correct JSON, one field slightly verbose          |
| 1     | Instruction clarity  | 3     | "be concise" is ambiguous — no length target     |
| 2     | Output quality      | 5     | Perfect match on structured input                |
| ...   | ...                 | ...   | ...                                              |
|-------|---------------------|-------|--------------------------------------------------|
| AVG   |                     | 3.8   |                                                  |
```

Log the harness summary (verifier count, criterion count, test input count). Proceed immediately to baseline scoring. The harness CAN be adjusted before the baseline, but once the baseline is scored, it's frozen for the rest of the run.

## Phase 3: Baseline

1. Read the prompt from its source file
2. For each test input: simulate sending the prompt (with template variables filled from the test input) to the target model, producing the output the prompt is designed to elicit
3. Run deterministic verifiers on the current state
4. Score each output against every harness criterion using the anchored rubrics
5. Calculate baseline: average of all LLM scores, normalized to percentage `(avg - 1) / 4 * 100`
6. Update `results.json` with the baseline score and token count
7. Update `dashboard.html` — replace `__OPTIMIZER_DATA__` with current `results.json`
8. Report:
   ```
   Baseline: 58% (avg 3.3/5 across 4 criteria x 3 inputs)
   Token count: 482

   Weakest criteria:
     - Instruction clarity: avg 2.5 — "keep it brief" is vague, no format spec
     - Robustness: avg 3.0 — empty input produces hallucinated output
   ```

Important: when producing output, genuinely simulate how a model would respond to the prompt. Don't let your knowledge of the harness influence the output.

## Phase 4: Improvement Loop

Repeat autonomously until stopped or convergence reached.

### Each Round

**1. Analyze** — Look at harness scores from the previous round. Which criterion has the lowest average across all test inputs? Focus on that.

**2. Hypothesize** — Decide on ONE small, targeted change to the prompt that would address the weakest criterion. Types of changes:
- Tighten a vague instruction into a specific constraint ("be concise" -> "respond in under 100 words")
- Add a few-shot example showing desired output format
- Remove redundant instructions that say the same thing differently
- Add edge-case handling instructions ("if the input is empty, respond with...")
- Restructure to put critical instructions first (primacy effect)
- Add output format specification (JSON schema, markdown template)
- Replace hedging language ("try to", "if possible") with direct instructions
- Add a constraint that was implicit but caused failures

**3. Apply** — Edit the prompt in-place in its source file. The surrounding code must not break. Preserve all template variables exactly.

**4. Verify deterministic checks** — Run all deterministic verifiers:
- Source file still parses? Template vars preserved? Token count acceptable?
- Any hard constraint violated? -> Auto-revert immediately. Log as `REVERTED (hard constraint: {which one})`. Skip LLM scoring.

**5. Test** — For each test input, simulate the prompt producing output. Score against the full harness.

**6. Evaluate** — Compare to previous best score:
- **Improved**: Keep the change. Log as KEPT.
- **Same or worse**: Revert the source file to its previous state. Log as REVERTED.

**7. Record** — Append to `results.json`:
```json
{
  "round": 1,
  "score": 0.69,
  "previousScore": 0.58,
  "tokenCount": 510,
  "deterministic": {
    "sourceFileIntegrity": true,
    "templateVarsPreserved": true,
    "tokenCount": 510,
    "formatCompliance": "3/3"
  },
  "checks": {
    "Output quality": 4.0,
    "Instruction clarity": 3.5,
    "Robustness": 3.0,
    "Conciseness": 4.0
  },
  "targetedCriterion": "Instruction clarity",
  "targetedBefore": 2.5,
  "targetedAfter": 3.5,
  "change": "Replaced 'be concise' with 'respond in under 100 words using bullet points'",
  "kept": true,
  "hardConstraintViolation": null
}
```

Update `currentScore`, `bestScore`, and `consecutiveHighPasses`.

**8. Dashboard** — Update `dashboard.html` by replacing `__OPTIMIZER_DATA__` with current `results.json`.

**9. Report** — Print one line: `Round N: XX% (was YY%) [KEPT/REVERTED] — change description [tokens: N]`

### Loop Rules

- **One change per round.** Never batch multiple changes — you need to know what helped.
- **Test ALL inputs every round.** Not just one.
- **Deterministic checks are non-negotiable.** A broken source file or missing template variable is auto-reverted regardless of score improvement.
- **Preserve template variables exactly.** `{{user_input}}` must remain `{{user_input}}` — not `{{input}}`, not `{user_input}`.
- **System vs user prompts**: If both exist, only modify the one the user pointed at. Never change both in the same round.
- **Multi-turn prompts**: Score the full conversation flow, not individual messages in isolation.
- **Plateau strategy**: After 3 consecutive rounds with no improvement:
  - If you've been tightening constraints, try adding a few-shot example instead
  - If you've been adding examples, try restructuring or removing redundancy
  - If nothing works, log the stuck criterion and stop
- **Convergence**: Stop when score reaches 90%+ on 3 consecutive rounds.
- **Max rounds**: Stop after 15 rounds if not converged.
- **Dimension rotation**: After 2 rounds targeting the same criterion with no improvement, move to the next-weakest.

## Phase 5: Completion

1. The improved prompt is already in the source file (kept changes were applied in-place). Save a copy of the final prompt text to `prompt-optimizer-{name}/improved-prompt.txt`
2. Print a final report:
   ```
   Prompt Optimizer — Final Report
   ════════════════════════════════
   File: src/agents/summarizer.py (SYSTEM_PROMPT, lines 24-52)
   Rounds: 7 (5 kept, 2 reverted)

   Token count: 482 → 510 (+28)

   Criteria:
     Output quality:      3.5 → 4.5 (+1.0)
     Instruction clarity:  2.5 → 4.0 (+1.5)
     Robustness:          3.0 → 4.0 (+1.0)
     Conciseness:         4.0 → 4.0 (unchanged)

   Composite: 58% → 84%

   Kept changes:
     1. Replaced "be concise" with "respond in under 100 words using bullet points"
     2. Added JSON schema example for output format
     3. Added "if input is empty, respond with {}" edge-case instruction
     4. Moved format specification to first paragraph (primacy)
     5. Removed duplicate "always be helpful" instruction

   Original preserved at: prompt-optimizer-{name}/original-prompt.txt
   ```
3. Remind the user: original prompt is preserved. They can diff the source file against the original to review all changes.

## Parameters

- `inputs:<input1>|<input2>` — explicit test inputs (pipe-separated)
- `max-rounds:<N>` — override default 15-round limit
- `max-tokens:<N>` — add token count as a hard constraint
- `mode:audit` — score only, don't modify
- `model:<name>` — target model for the prompt (affects token counting and behavior expectations)

## Dashboard

The dashboard (`dashboard.html`) is a self-contained HTML file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="10">
  <title>Prompt Optimizer — {prompt-name}</title>
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
    .token-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .token-ok { background: #1b3a2d; color: #3fb950; }
    .token-warn { background: #3d2e00; color: #d29922; }
    .token-over { background: #3d1418; color: #f85149; }
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
    <h1>Prompt Optimizer — <span id="promptName"></span></h1>
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
    <div class="stat"><div class="stat-value" id="tokens">—</div><div class="stat-label">tokens</div></div>
  </div>
  <div class="grid">
    <div class="card">
      <h2>Score History</h2>
      <div class="chart" id="chart"></div>
    </div>
    <div class="card">
      <h2>Deterministic Verifiers</h2>
      <table class="det-table">
        <thead><tr><th>Verifier</th><th>Result</th><th>Status</th></tr></thead>
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
      <thead><tr><th>Round</th><th>Score</th><th>Tokens</th><th>Target</th><th>Change</th><th>Result</th></tr></thead>
      <tbody id="log"></tbody>
    </table>
  </div>
  <script>
    const DATA = __OPTIMIZER_DATA__;
    document.getElementById('promptName').textContent = DATA.prompt || '';
    const fmt = v => v != null ? Math.round(v * 100) + '%' : '—';
    document.getElementById('currentScore').textContent = fmt(DATA.currentScore);
    document.getElementById('baseline').textContent = fmt(DATA.baseline);
    const rounds = DATA.rounds || [];
    document.getElementById('rounds').textContent = rounds.length;
    document.getElementById('kept').textContent = rounds.filter(r => r.kept).length;
    document.getElementById('reverted').textContent = rounds.filter(r => !r.kept).length;
    const lastRound = rounds[rounds.length - 1];
    const tokenCount = lastRound ? lastRound.tokenCount : DATA.tokenCount;
    document.getElementById('tokens').textContent = tokenCount != null ? tokenCount : '—';
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
    const checksData = lastRound ? lastRound.checks : {};
    Object.entries(checksData).forEach(([q, score]) => {
      const div = document.createElement('div');
      const cls = score >= 4 ? 'high' : score >= 3 ? 'mid' : 'low';
      div.className = 'check ' + cls;
      div.textContent = q + ' — ' + score + '/5';
      checksEl.appendChild(div);
    });
    const detEl = document.getElementById('detVerifiers');
    if (lastRound && lastRound.deterministic) {
      const det = lastRound.deterministic;
      Object.entries(det).forEach(([k, v]) => {
        const tr = document.createElement('tr');
        const status = (v === true || v === 'OK') ? 'OK' : (typeof v === 'number' ? v : String(v));
        tr.innerHTML = '<td>' + k + '</td><td>' + status + '</td><td>' + ((v === true || v === 'OK') ? '✓' : status) + '</td>';
        detEl.appendChild(tr);
      });
    }
    const log = document.getElementById('log');
    rounds.forEach(r => {
      const tr = document.createElement('tr');
      const result = r.hardConstraintViolation
        ? 'REVERTED (hard: ' + r.hardConstraintViolation + ')'
        : (r.kept ? 'KEPT' : 'REVERTED');
      const cls = r.kept ? 'kept' : 'reverted';
      tr.innerHTML = '<td>' + r.round + '</td><td>' + fmt(r.score) + '</td><td>' + (r.tokenCount || '—') + '</td><td>' + (r.targetedCriterion || '—') + '</td><td>' + (r.change || '') + '</td><td class="' + cls + '">' + result + '</td>';
      log.appendChild(tr);
    });
  </script>
</body>
</html>
```

Each round, replace `__OPTIMIZER_DATA__` with the current `results.json` content and rewrite the file.
