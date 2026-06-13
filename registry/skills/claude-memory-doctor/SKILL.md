---
name: claude-memory-doctor
description: >
  Comprehensive health check for Claude Code configurations — audits CLAUDE.md files,
  .claude/rules/, memory files, settings.json, hooks, plugins, and agent configs to find
  contradictions, redundancies, anti-patterns, bloat, staleness, and broken infrastructure.
  Use this skill whenever the user says "memory doctor", "detox", "clean up my rules", "audit
  my config", "check my setup", "my outputs are getting worse", "review my Claude configuration",
  "CLAUDE.md doctor", "diagnose my rules", or mentions rules contradicting each other, config
  bloat, wanting to simplify their setup, or doing a health check on their Claude Code
  instructions. Also trigger when users mention they've been accumulating rules over time and
  want to prune, reset, or improve their Claude Code project instructions. Even if the user
  doesn't use these exact words, trigger this skill when the conversation is clearly about
  auditing, diagnosing, or improving the quality of Claude Code configuration files.
tools: Read, Glob, Grep, Bash, Edit, AskUserQuestion
---

# Claude Memory Doctor

Full diagnostic for your Claude Code configuration. Finds contradictions between rules,
scores file quality, detects anti-patterns, validates infrastructure (hooks, plugins, settings),
and offers to fix everything it finds.

## Scope

By default, audit **project-level** configuration (current working directory):
- `CLAUDE.md` (project root + any package-level)
- `.claude/rules/*.md`
- `.claude/agents/*.md`
- `.claude/settings.json` and `.claude/settings.local.json`
- `.claude/hooks/`
- Project memory files under `~/.claude/projects/`

If the user passes `--home` or `home`, audit **user-level** configuration:
- `~/.claude/CLAUDE.md`
- `~/.claude/rules/*.md`
- `~/.claude/settings.json`
- `~/.claude/hooks/`
- `~/.claude/skills/**/SKILL.md`
- `~/.claude/projects/*/memory/**/*.md`

If the user passes `--all`, audit both levels together — best for catching cross-level
contradictions.

---

## Phase 1: Discovery

Find and read ALL config files for the selected scope. Read them in parallel.

**Project scope:**
```
CLAUDE.md, .claude.local.md
.claude/rules/**/*.md
.claude/agents/**/*.md
.claude/settings.json, .claude/settings.local.json
.claude/hooks/*
packages/*/CLAUDE.md (monorepo)
~/.claude/projects/<encoded-cwd>/memory/**/*.md
```

**Home scope:**
```
~/.claude/CLAUDE.md
~/.claude/rules/**/*.md
~/.claude/settings.json
~/.claude/hooks/*
~/.claude/skills/**/SKILL.md
~/.claude/projects/*/memory/**/*.md
```

Also check what plugins are enabled by reading the `plugins` section of settings.json.

---

## Phase 2: Cross-File Analysis

This is the highest-value part — finding issues that span multiple files. Go through each
category and quote the specific text and file:line for every issue found.

### Contradictions (Critical)

Two rules telling Claude to do opposite things create unpredictable behavior. The model has
to pick one, and it may pick differently each time.

Look for:
- Direct opposites: "always X" in one place, "never X" in another
- Conflicting preferences: verbose vs concise, cautious vs autonomous, minimal vs thorough
- Scope conflicts: a project rule overriding a user rule ambiguously
- Process contradictions: "ask before acting" vs "execute autonomously"
- Philosophy clashes: "general-purpose solutions" vs "minimum for current task"

### Redundancy (Medium)

Same instruction in multiple files wastes context tokens and creates maintenance drift.

Look for:
- Exact or near-exact duplicates across files
- Same idea in different words
- Rules that are subsets of other rules
- Content in CLAUDE.md that's also in rules files

### Infrastructure Issues (Medium-Critical)

Check settings.json for broken or risky configuration:
- **Broken hooks**: hooks referencing scripts that don't exist
- **Duplicate plugins**: same plugin from multiple sources or versions
- **Security gaps**: sandbox disabled + broken security hooks = no safety net
- **Stale permissions**: accumulated one-time command approvals in settings.local.json
- **Disabled plugins**: installed but disabled plugins cluttering the config

### Anti-Patterns (Medium)

See [references/anti-patterns.md](references/anti-patterns.md) for the full catalog. Key ones:
- Verbose explanations (paragraphs where one line would do)
- Generic best practices Claude already follows
- Emphasis overuse (when everything is IMPORTANT, nothing is)
- Template copy-paste that doesn't match the actual project
- Cursor-specific frontmatter in rules (`alwaysApply`, `description` — Claude Code ignores these)

### Over-Specification (Low-Medium)

Rules that restate Claude's default behavior add noise and can cause overthinking.

Look for:
- "Be helpful", "write working code", "follow existing conventions"
- Rules about tool calling behavior that's already built-in
- Generic software engineering principles stated without project-specific context

### Staleness (Low)

Look for:
- References to files, tools, or APIs that don't exist
- Memory files describing superseded architectures
- Memory stored under the wrong project scope
- TODO items never completed
- Commands that would fail if run

### Bloat (Low)

Look for:
- CLAUDE.md over 300 lines (target: under 60)
- Rule files over 200 lines
- Deep nesting where flat lists work
- Large accumulated session data

---

## Phase 3: Per-File Quality Assessment

Score each CLAUDE.md and rules file individually.

**CLAUDE.md scoring** (see [references/quality-criteria.md](references/quality-criteria.md)):
- Commands/Workflows (20 pts) — are essential commands documented?
- Architecture Clarity (20 pts) — is the codebase map clear?
- Non-Obvious Patterns (15 pts) — are gotchas captured?
- Conciseness (15 pts) — is every line earning its keep?
- Currency (15 pts) — do commands work, do paths exist?
- Actionability (15 pts) — are instructions copy-paste ready?

Red flags: -10 for broken commands, -10 for non-existent paths, -5 for generic advice.

**Rules scoring** (see [references/rules-criteria.md](references/rules-criteria.md)):
- Topic Focus (25 pts) — one topic per file?
- Frontmatter Correctness (20 pts) — only `paths` field, no Cursor-specific fields?
- Appropriate Length (20 pts) — 50-150 lines ideal
- Clarity & Actionability (20 pts) — specific, not vague
- No Duplication (15 pts)

Grades: A (90-100), B (70-89), C (50-69), D (30-49), F (0-29)

---

## Phase 4: Generate Report

Lead with the most impactful issues. Use this format:

```
# Claude Memory Doctor Report

**Scope**: [project / home / all]
**Files scanned**: [count]
**Issues found**: [count by severity]

## Critical Issues

### [Issue title]
**Category**: [Contradiction / Broken Infrastructure / ...]
**Files**: `path/to/file1.md:L12` vs `path/to/file2.md:L8`
**Problem**: [Concise description with quoted text]
**Fix**: [Exact change to make]
```

**Example of a properly formatted issue:**

```
### Conflicting autonomy instructions
**Category**: Contradiction
**Files**: `~/.claude/rules/02-simplicity.md:L8` vs `~/.claude/projects/-cwd/memory/autonomous.md:L3`
**Problem**: Rules say `"Only make changes that are directly requested"` but memory says
`"execute all phases autonomously without asking for permission"`. Claude may oscillate
between asking and not asking depending on which instruction it weighs more.
**Fix**: Add qualifier to simplicity rule: "Only make changes that are directly requested
— but once a plan is approved, execute all steps without pausing for confirmation."
```

Every issue MUST follow this pattern: quote the exact problematic text in backticks, include the file path with `:L<number>` line reference, and provide a Fix that specifies the exact edit (not "review and update").

```

## Medium Issues
...

## Low Issues
...

## File Scores

| File | Score | Grade | Key Issue |
|------|-------|-------|-----------|
| ./CLAUDE.md | 75/100 | B | Missing gotchas |
| .claude/rules/security.md | 90/100 | A | — |

## Health Score: [X/10]

[One paragraph summary + top recommendation]
```

Health score guide:
- 9-10: Clean, focused, no contradictions, good file scores
- 7-8: Minor redundancy or bloat, no contradictions
- 5-6: Some contradictions or significant bloat
- 3-4: Multiple contradictions actively hurting quality
- 1-2: Config is working against itself

---

## Phase 5: Interactive Triage

After the report, ask how to proceed:

1. **Fix All** — Apply all recommended fixes automatically
2. **Fix Critical Only** — Only fix critical issues
3. **Review Each** — Show each fix for individual approval
4. **Report Only** — Don't make changes

---

## Phase 6: Apply Fixes

For each approved fix:

1. **Contradictions**: Ask which side to keep. Don't guess — both sides seemed reasonable
   when written.
2. **Redundancy**: Consolidate into the most appropriate file. Remove duplicates.
3. **Infrastructure**: Fix broken hooks, remove duplicate plugins, clean stale permissions.
4. **Anti-patterns**: Rewrite verbose instructions concisely. Show before/after.
5. **Staleness**: Remove or update stale references. Verify paths exist.
6. **Bloat**: Suggest splitting large files, moving detail to references.

Show the diff before applying each change. Explain why it helps.

---

## Important

- Be honest. If the config is clean, say so. Don't manufacture issues.
- Quote specific text. For infrastructure issues, quote the exact JSON key/value (e.g., `"enabled": false`). For rule issues, quote the exact sentence that conflicts.
- Respect intent. The user wrote these rules for a reason.
- Validate claims. Check if referenced paths actually exist, if commands actually work.
- Be fast. Read files in parallel, analyze systematically.
