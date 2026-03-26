---
name: skill-optimizer
description: Auto-improve any Claude skill through iterative test-score-refine loops. Reads a target skill, defines yes/no scoring criteria with the user, then autonomously loops - execute the skill's instructions, score output against checklist, make one small targeted change, test again, keep if better or revert if not. Use this skill whenever the user says "optimize skill", "improve skill", "refine skill", "auto-improve", "skill-optimizer", "run skill-optimizer on [skill]", "make my [skill] skill better", or wants to systematically improve any skill's output quality through automated iteration.
---

# Skill Optimizer

Iteratively improve a skill's prompt through autonomous test-score-refine loops.

Each round: follow the skill's instructions to produce output, score against a yes/no checklist, identify the weakest area, make one targeted change, test again, keep if improved, revert if not.

## Phase 1: Setup

### 1. Find the Target Skill

Locate and read the target skill's SKILL.md. Understand its purpose, instructions, and current prompt structure. If the user says "my landing page skill", search for it in `.claude/skills/` and `~/.claude/skills/`.

### 2. Define Test Inputs

Ask the user for 1-3 representative inputs the skill typically receives.

Example: for a landing page skill, a test input might be "write landing page copy for an AI productivity tool that helps developers ship 2x faster."

If the user doesn't have specific inputs, generate realistic ones from the skill's description and confirm them.

### 3. Define Scoring Checklist

Help the user create 3-6 yes/no questions that define what "good output" looks like. Each question must be:
- Binary (yes or no)
- Specific and unambiguous
- Independently scorable

Guide by asking: "What are the most common ways this skill's output disappoints you?" Then turn each failure mode into a checklist question.

Example checklist for a landing page copy skill:
- "Does the headline include a specific number or result?"
- "Is the copy free of buzzwords like 'revolutionary', 'synergy', 'cutting-edge'?"
- "Does the CTA use a specific verb phrase rather than 'Learn More'?"
- "Does the first line call out a specific pain point?"
- "Is the total copy under 150 words?"

3-6 questions is the sweet spot. More than that and the skill starts gaming the checklist instead of genuinely improving.

### 4. Create Working Directory

Create `skill-optimizer-{skill-name}/` in the current working directory:

```
skill-optimizer-{skill-name}/
  original-skill.md   # backup of original SKILL.md (never modified)
  skill.md             # working copy (modified each round)
  results.json         # score history and changelog
  dashboard.html       # live results dashboard
```

Copy the original SKILL.md body (everything after frontmatter) to both `original-skill.md` and `skill.md`.

Initialize `results.json`:
```json
{
  "skill": "skill-name",
  "startedAt": "ISO timestamp",
  "checklist": ["question1", "question2"],
  "testInputs": ["input1"],
  "baseline": null,
  "currentScore": null,
  "bestScore": null,
  "consecutiveHighPasses": 0,
  "rounds": []
}
```

Copy the dashboard template from this skill's `assets/dashboard.html` to the working directory.

## Phase 2: Baseline

1. Read `skill.md`
2. For each test input: follow the skill's instructions as if you were a fresh Claude instance with this skill loaded, producing the output the skill is designed to create
3. Score each output: evaluate every checklist question as pass (1) or fail (0)
4. Calculate baseline score: total passing checks / total checks across all inputs
5. Update `results.json` with the baseline score
6. Update `dashboard.html` — replace the `AUTORESEARCH_DATA` JavaScript variable with the current `results.json` content
7. Report: `Baseline: XX% (N/M checks passing)`

Important: when producing output, genuinely follow the skill instructions. Don't let your knowledge of the checklist influence the output — that would defeat the purpose. The checklist evaluates the skill's instructions, not your ability to pass the checklist.

## Phase 3: Improvement Loop

Repeat autonomously until stopped or convergence reached.

### Each Round

**1. Analyze** — Look at the checklist results from the previous round. Which items fail most consistently across test inputs? Focus on the single weakest one.

**2. Hypothesize** — Decide on ONE small, targeted change to `skill.md` that would address the most common failure. Types of changes to consider:
- Add a specific rule or constraint targeting the failure
- Add a banned-items list (e.g., list of buzzwords to avoid)
- Add a worked example showing the desired pattern so the skill can see what good looks like
- Clarify an ambiguous instruction that may be causing the failure
- Reorder instructions to give more prominence to important rules

**3. Apply** — Make the single change to `skill.md`. Save the previous version in memory so you can revert.

**4. Test** — Read the modified `skill.md`. Follow its instructions with ALL test inputs. Score each output against the checklist. Calculate the new average score.

**5. Evaluate** — Compare to previous best score:
- **Improved**: Keep the change. Log as KEPT.
- **Same or worse**: Revert `skill.md` to the previous version. Log as REVERTED.

**6. Record** — Append a round entry to `results.json`:
```json
{
  "round": 1,
  "score": 0.72,
  "checks": {"question text": true, "other question": false},
  "change": "Added rule: headline must include a specific number",
  "kept": true,
  "reason": "Headline check was failing on all test inputs"
}
```

Update `currentScore`, `bestScore`, and `consecutiveHighPasses` in `results.json`.

**7. Dashboard** — Update `dashboard.html` by replacing the `AUTORESEARCH_DATA` variable with the current `results.json` content and rewriting the file.

**8. Report** — Print one line: `Round N: XX% (was YY%) [KEPT/REVERTED] — change description`

### Loop Rules

- **One change per round.** Never batch multiple changes — you need to know what helped.
- **Test ALL inputs every round.** Not just one.
- **Plateau strategy**: After 3 consecutive rounds with no improvement, switch approach:
  - If you've been adding rules, try adding a worked example instead
  - If you've been adding examples, try restructuring or reordering
  - If nothing works, consider whether a checklist question is too strict or ambiguous
- **Convergence**: Stop when score reaches 95%+ on 3 consecutive rounds.
- **Max rounds**: Stop after 15 rounds if not converged — report findings and ask the user.

## Phase 4: Completion

1. Copy the final `skill.md` content into the original skill's directory as `SKILL.improved.md` (the original SKILL.md stays untouched)
2. Print a final report:
   - Starting score and final score
   - Rounds run, changes kept vs reverted
   - Summary of each kept change (this changelog is valuable — it documents what works for this specific skill)
3. Remind the user: original is preserved, improved version saved separately. They can review the diff and replace the original when ready.

## Dashboard

The dashboard (`dashboard.html`) is a self-contained HTML file with:
- Score-over-time line chart
- Current score and progress stats
- Pass/fail breakdown per checklist question (latest round)
- Changelog showing each round's change and whether it was kept/reverted
- Auto-refreshes every 10 seconds via meta tag

Each round, update the embedded `AUTORESEARCH_DATA` JavaScript variable in `dashboard.html` with the current contents of `results.json`, then rewrite the file. The template is in this skill's `assets/dashboard.html`.
