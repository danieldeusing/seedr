# CLAUDE.md Quality Criteria

Scoring rubric for evaluating CLAUDE.md files.

## Scoring Rubric (100 points total)

### 1. Commands/Workflows (20 points)

| Score | Criteria |
|-------|----------|
| **20** | All essential commands documented with context (build, test, lint, dev, deploy) |
| **15** | Most commands present, some missing context or options |
| **10** | Basic commands only, no workflow guidance |
| **5** | Few commands, many missing |
| **0** | No commands documented |

**What to check:**
- Can someone run the project immediately?
- Are flags/options explained where non-obvious?
- Is the development workflow clear?

### 2. Architecture Clarity (20 points)

| Score | Criteria |
|-------|----------|
| **20** | Clear codebase map: directories explained, entry points identified, data flow described |
| **15** | Good structure overview, minor gaps |
| **10** | Basic directory listing only |
| **5** | Vague or incomplete structure info |
| **0** | No architecture info |

**What to check:**
- Key directories explained with purpose
- Module relationships documented
- Entry points identified (main files, config files)
- Data flow described where relevant

### 3. Non-Obvious Patterns (15 points)

| Score | Criteria |
|-------|----------|
| **15** | Gotchas, quirks, and workarounds captured |
| **10** | Some patterns documented |
| **5** | Minimal pattern documentation |
| **0** | No gotchas or patterns |

**What to check:**
- Known issues and workarounds
- "Why we do it this way" for unusual patterns
- Edge cases and ordering dependencies
- Common mistakes to avoid

### 4. Conciseness (15 points)

| Score | Criteria |
|-------|----------|
| **15** | Dense, valuable content; each line adds value |
| **10** | Mostly concise, some padding |
| **5** | Verbose in places, filler content |
| **0** | Mostly filler or restates obvious code |

**What to check:**
- No verbose explanations (2-3 lines max per concept)
- No obvious information (class names already tell us purpose)
- No redundancy with code comments
- One line per concept when possible

### 5. Currency (15 points)

| Score | Criteria |
|-------|----------|
| **15** | Reflects current codebase; commands work, paths exist |
| **10** | Mostly current, minor staleness |
| **5** | Several outdated references |
| **0** | Severely outdated |

**What to check:**
- Run documented commands (do they work?)
- Check referenced files exist
- Tech stack versions current
- No references to deleted files/folders

### 6. Actionability (15 points)

| Score | Criteria |
|-------|----------|
| **15** | Instructions are executable; commands copy-paste ready |
| **10** | Mostly actionable |
| **5** | Some vague instructions |
| **0** | Vague or theoretical |

**What to check:**
- Commands can be copy-pasted directly
- Steps are concrete, not "do things"
- Paths are real, not placeholders
- Includes exact syntax, not "run tests"

---

## Grade Scale

| Grade | Score | Meaning |
|-------|-------|---------|
| **A** | 90-100 | Comprehensive, current, actionable |
| **B** | 70-89 | Good coverage, minor gaps |
| **C** | 50-69 | Basic info, missing key sections |
| **D** | 30-49 | Sparse or outdated |
| **F** | 0-29 | Missing or severely outdated |

---

## Red Flags (Automatic Deductions)

- **-10**: Commands that would fail (wrong paths, missing deps)
- **-10**: References to deleted files/folders
- **-5**: Copy-paste from templates without customization
- **-5**: Generic advice not specific to the project
- **-5**: "TODO" items never completed
- **-5**: Duplicate info already in `.claude/rules/`

---

## Assessment Process

1. **Read** the CLAUDE.md file completely
2. **Cross-reference** with actual codebase:
   - Run documented commands (or mentally trace)
   - Check if referenced files exist
   - Verify architecture descriptions match reality
3. **Score** each criterion (0-15/20)
4. **Apply** red flag deductions
5. **Calculate** total and assign grade
6. **List** specific issues found
7. **Propose** concrete improvements

---

## Token Efficiency Guidelines

CLAUDE.md is injected into every prompt. Token budget matters.

| Guideline | Target |
|-----------|--------|
| Total lines | Under 300 (ideal: under 60) |
| Imports | Use `@path/to/file` for detailed docs |
| Rules | Split into `.claude/rules/` by topic |
| Explanations | 1-3 lines max per concept |
| Emphasis | Use IMPORTANT/NEVER sparingly |
