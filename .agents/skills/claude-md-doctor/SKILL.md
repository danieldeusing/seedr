---
name: claude-md-doctor
description: |
  Diagnose and improve CLAUDE.md files and .claude/rules/ for Claude Code projects.
  Use when asked to: audit CLAUDE.md, check project instructions, improve Claude Code setup,
  diagnose rules, fix CLAUDE.md issues, optimize project memory, or when phrases like
  "CLAUDE.md", "project instructions", "rules quality", "Claude Code setup" appear.
  Evaluates: file structure, quality scoring, anti-patterns, staleness, token efficiency,
  rule modularity, frontmatter correctness, and actionability. Provides detailed reports
  with severity ratings and specific fixes.
tools: Read, Glob, Grep, Bash, Edit, AskUserQuestion
---

# CLAUDE.md Doctor

Diagnose, evaluate, and repair CLAUDE.md files and `.claude/rules/` across a codebase to ensure optimal Claude Code project context.

## Capabilities

- **Audit** CLAUDE.md files for quality, staleness, and anti-patterns
- **Evaluate** `.claude/rules/` for modularity, frontmatter correctness, and focus
- **Diagnose** common issues: verbosity, staleness, broken commands, vague instructions
- **Recommend** targeted fixes with severity ratings
- **Apply** approved changes to improve project instructions

---

## Workflow

### Phase 1: Discovery

Scan for all project instruction files:

```bash
# Find CLAUDE.md files
find . -name "CLAUDE.md" -o -name ".claude.md" -o -name ".claude.local.md" 2>/dev/null | head -50

# Find rule files
find .claude/rules -name "*.md" 2>/dev/null | head -50

# Check for global files
ls -la ~/.claude/CLAUDE.md ~/.claude/rules/*.md 2>/dev/null
```

**File Locations & Purpose:**

| Type | Location | Scope | Git |
|------|----------|-------|-----|
| Project root | `./CLAUDE.md` | Primary project context | ✓ Shared |
| Local overrides | `./.claude.local.md` | Personal settings | ✗ Gitignored |
| Global defaults | `~/.claude/CLAUDE.md` | User-wide defaults | N/A |
| Modular rules | `./.claude/rules/*.md` | Topic-specific rules | ✓ Shared |
| Package-specific | `./packages/*/CLAUDE.md` | Module context | ✓ Shared |

### Phase 2: Quality Assessment

For each file, evaluate against criteria. See:
- [references/quality-criteria.md](references/quality-criteria.md) for CLAUDE.md scoring
- [references/rules-criteria.md](references/rules-criteria.md) for .claude/rules/ scoring

**Quick Diagnostic Checklist:**

| Check | Severity | What to Look For |
|-------|----------|------------------|
| Commands documented | High | Build/test/lint commands with exact syntax |
| Architecture clarity | High | Directory structure, key files, entry points |
| Token efficiency | High | File under 300 lines, no verbose explanations |
| Actionability | High | Copy-paste ready commands, no vague language |
| Currency | High | Commands work, paths exist, tech stack current |
| Gotchas captured | Medium | Non-obvious patterns, quirks, warnings |
| Rule modularity | Medium | Rules split by topic, not one monolithic file |
| Frontmatter correct | Medium | Only `paths` in rules, no Cursor-specific fields |

### Phase 3: Diagnostic Report

**ALWAYS output a diagnostic report BEFORE making any changes.**

Format:

```
## CLAUDE.md Health Report

### Summary
- Files scanned: X CLAUDE.md, Y rules
- Overall health: Good/Fair/Poor
- Critical issues: X
- Warnings: X
- Files needing attention: X

### Critical Issues (Fix Now)

#### 1. [Issue Name] — Severity: Critical
**File:** `./CLAUDE.md`
**Problem:** [What's wrong]
**Evidence:** [Specific example from the file]
**Fix:** [Exact change to make]

### Warnings (Should Fix)

#### 2. [Issue Name] — Severity: Warning
...

### Suggestions (Nice to Have)

#### 3. [Issue Name] — Severity: Low
...

### File-by-File Scores

| File | Score | Grade | Status |
|------|-------|-------|--------|
| ./CLAUDE.md | 75/100 | B | Needs work |
| .claude/rules/security.md | 90/100 | A | Good |
```

### Phase 4: Interactive Triage

After the report, ask user how to proceed:

```
header: "Action"
question: "How should I proceed with the diagnosed issues?"
options:
  - label: "Fix All (Recommended)"
    description: "Apply all recommended fixes automatically"
  - label: "Fix Critical Only"
    description: "Only fix critical issues, skip warnings"
  - label: "Review Each"
    description: "Show each fix for individual approval"
  - label: "Report Only"
    description: "Don't make any changes"
```

### Phase 5: Apply Fixes

For each approved fix:

1. **Show the diff** before applying
2. **Explain why** this helps future Claude sessions
3. **Apply with Edit tool**, preserving existing structure
4. **Verify** the file is still valid markdown

---

## Severity Classification

| Severity | Criteria | Examples |
|----------|----------|----------|
| **Critical** | Actively harms Claude sessions | Broken commands, wrong paths, missing essential context |
| **Warning** | Reduces effectiveness | Verbose explanations, outdated info, missing gotchas |
| **Low** | Minor improvement | Formatting, organization, optional sections |

---

## Common Issues Detected

### Critical Issues

1. **Broken Commands** — Commands that would fail if run
2. **Missing Essential Commands** — No build/test/lint documented
3. **Non-existent Paths** — References to files/dirs that don't exist
4. **Wrong Frontmatter** — Using `alwaysApply`, `description` in rules (Cursor-only)
5. **Severely Outdated** — Major tech stack changes not reflected

### Warnings

1. **Verbose Explanations** — More than 2-3 lines explaining a concept
2. **Generic Advice** — Best practices not specific to this project
3. **Token Bloat** — CLAUDE.md over 300 lines
4. **Stale Commands** — Commands work but options/flags outdated
5. **Missing Gotchas** — Non-obvious patterns not documented
6. **Monolithic Rules** — All rules in one file instead of split by topic
7. **Duplicate Content** — Same info in CLAUDE.md and rules

### Low Priority

1. **Formatting Inconsistency** — Mixed heading styles, tables vs lists
2. **Missing Optional Sections** — Environment, testing patterns
3. **Suboptimal Organization** — Sections in non-logical order

---

## Anti-Patterns Reference

See [references/anti-patterns.md](references/anti-patterns.md) for detailed examples of what to avoid.

---

## Templates Reference

See [references/templates.md](references/templates.md) for CLAUDE.md and rules templates by project type.

---

## Rules-Specific Guidance

### Valid Rules Frontmatter

Rules support ONLY the `paths` field:

```yaml
---
paths: src/**/*.ts
---
```

or multiple patterns:

```yaml
---
paths:
  - src/**/*.ts
  - lib/**/*.ts
---
```

**Invalid (Cursor-specific, will be ignored):**
- `alwaysApply`
- `description`
- `name`
- `tools`

Rules without `paths` frontmatter apply to ALL files.

### Ideal Rule File

- Focus on ONE topic (security, testing, code-style, etc.)
- 50-150 lines
- Clear heading describing the topic
- Bullet points for easy scanning
- Actionable, not vague

---

## Validation Commands

After making changes, suggest verification:

```bash
# Check CLAUDE.md syntax
cat ./CLAUDE.md | head -100

# Verify commands work
npm run build --help 2>&1 | head -5
npm test --help 2>&1 | head -5

# Check paths exist
ls -la src/ tests/ 2>/dev/null

# Count lines (target: under 300)
wc -l ./CLAUDE.md
```

---

## User Tips to Share

When presenting recommendations:

- **Keep it concise**: CLAUDE.md is injected into every prompt; brevity matters
- **Use `.claude/rules/`**: Split large CLAUDE.md into topic-specific rules
- **Use `@imports`**: Reference detailed docs with `@path/to/file` instead of inlining
- **Use `.claude.local.md`**: For personal preferences not shared with team
- **Global defaults**: Put user-wide preferences in `~/.claude/CLAUDE.md`
- **Emphasis sparingly**: IMPORTANT, NEVER, ALWAYS only for critical rules
- **Verification criteria**: Include commands/tests so Claude can check its own work
