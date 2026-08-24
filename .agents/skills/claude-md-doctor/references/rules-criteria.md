# .claude/rules/ Quality Criteria

Scoring rubric for evaluating modular rule files in `.claude/rules/`.

## Purpose of Rules Directory

The `.claude/rules/` directory splits a monolithic CLAUDE.md into focused, topic-specific files. Benefits:

- **Modularity**: Edit one topic without touching others
- **Scoping**: Apply rules only to matching files with `paths` frontmatter
- **Maintainability**: Easier to keep individual rules current
- **Token efficiency**: Only load rules relevant to current context

---

## Scoring Rubric (100 points total)

### 1. Topic Focus (25 points)

| Score | Criteria |
|-------|----------|
| **25** | Each file focuses on ONE specific topic |
| **20** | Mostly focused, minor overlap |
| **15** | Some files cover multiple topics |
| **10** | Topics mixed across files |
| **0** | No logical organization |

**Good topic splits:**
- `security.md` — Security practices and requirements
- `testing.md` — Test requirements, coverage, patterns
- `code-style.md` — Naming conventions, formatting, imports
- `architecture.md` — Project structure, patterns, dependencies
- `git.md` — Commit conventions, branching, PR workflow
- `api.md` — API design patterns, endpoint conventions

### 2. Frontmatter Correctness (20 points)

| Score | Criteria |
|-------|----------|
| **20** | Only valid `paths` field, or no frontmatter |
| **15** | Minor issues (unused but valid YAML) |
| **0** | Uses Cursor-specific fields (alwaysApply, description) |

**Valid frontmatter:**

```yaml
---
paths: src/**/*.ts
---
```

```yaml
---
paths:
  - src/**/*.ts
  - lib/**/*.ts
---
```

**Invalid (Cursor-specific, will be ignored by Claude Code):**

```yaml
---
alwaysApply: true        # ❌ Ignored
description: "Security"   # ❌ Ignored
name: "Security Rules"    # ❌ Ignored
---
```

### 3. Appropriate Length (20 points)

| Score | Criteria |
|-------|----------|
| **20** | 50-150 lines per file |
| **15** | Slightly over/under (30-200 lines) |
| **10** | Too short (<30) or too long (200-300) |
| **5** | Very short (<15) or very long (>300) |
| **0** | Single massive file or empty files |

### 4. Clarity & Actionability (20 points)

| Score | Criteria |
|-------|----------|
| **20** | Clear heading, bullet points, actionable instructions |
| **15** | Mostly clear, some vague sections |
| **10** | Mixed clarity, some theoretical |
| **5** | Mostly vague or theoretical |
| **0** | Unclear or not actionable |

**Good rule format:**
- Start with clear heading describing the topic
- Use markdown bullet points for easy scanning
- Be specific: "Use `const` over `let`" not "use modern syntax"
- Include examples where helpful

### 5. No Duplication (15 points)

| Score | Criteria |
|-------|----------|
| **15** | No duplicate content across rules or CLAUDE.md |
| **10** | Minor duplication |
| **5** | Significant duplication |
| **0** | Same content in multiple places |

---

## Grade Scale

| Grade | Score | Meaning |
|-------|-------|---------|
| **A** | 90-100 | Well-organized, focused, correct |
| **B** | 70-89 | Good organization, minor issues |
| **C** | 50-69 | Needs reorganization |
| **D** | 30-49 | Poor organization |
| **F** | 0-29 | Broken or severely disorganized |

---

## Common Rule File Topics

| File | Purpose |
|------|---------|
| `security.md` | Security best practices, input validation, secrets handling |
| `code-style.md` | Naming conventions, formatting, import ordering |
| `testing.md` | Test requirements, coverage targets, naming patterns |
| `architecture.md` | Project structure, module boundaries, data flow |
| `git.md` | Commit message format, branching strategy, PR process |
| `api.md` | Endpoint patterns, response formats, error handling |
| `database.md` | Query patterns, migration conventions, schema design |
| `frontend.md` | Component patterns, state management, styling |
| `backend.md` | Service patterns, middleware, authentication |
| `tooling.md` | Build tools, IDE settings, development workflow |

---

## Scoping with `paths`

Use glob patterns to apply rules only to matching files:

```yaml
---
paths: src/api/**/*.ts
---

# API Endpoint Rules

- All endpoints must return JSON
- Use proper HTTP status codes
- Include request validation
```

This rule ONLY applies when working with files matching `src/api/**/*.ts`.

**Pattern examples:**
- `*.ts` — All TypeScript files in root
- `**/*.ts` — All TypeScript files recursively
- `src/**/*.{ts,tsx}` — TS/TSX in src
- `tests/**/*` — All test files
- `!**/node_modules/**` — Exclude node_modules

---

## Red Flags

- Using Cursor-specific frontmatter (`alwaysApply`, `description`)
- Single monolithic rule file over 300 lines
- Rules that overlap significantly with CLAUDE.md
- Empty or near-empty rule files
- Generic advice not specific to the project
- Vague language like "be careful" or "consider"
