# CLAUDE.md Anti-Patterns

Common mistakes that reduce CLAUDE.md effectiveness. Recognize and fix these.

---

## 1. Verbose Explanations

**Bad:**
```markdown
The authentication system in our application uses JSON Web Tokens (JWT).
JWT is an open standard (RFC 7519) that defines a compact and self-contained
way for securely transmitting information between parties as a JSON object.
In our implementation, we use the HS256 algorithm, which provides HMAC
authentication using the SHA-256 hash function. Tokens are stored in...
```

**Good:**
```markdown
Auth: JWT with HS256. Tokens in `Authorization: Bearer <token>` header.
```

**Why it's bad:** CLAUDE.md is injected into every prompt. Verbose explanations waste tokens and dilute important information.

---

## 2. Obvious Information

**Bad:**
```markdown
The `UserService` class handles user-related operations like creating users,
updating users, deleting users, and fetching user data.
```

**Good:** (Don't include at all — the class name is self-explanatory)

Or if there's something non-obvious:
```markdown
`UserService` — Must call `init()` before any operations (loads config from DB).
```

**Why it's bad:** Restating what code already expresses wastes tokens.

---

## 3. Generic Best Practices

**Bad:**
```markdown
## Code Quality

- Always write tests for new features
- Use meaningful variable names
- Keep functions small and focused
- Don't repeat yourself (DRY)
- Handle errors appropriately
```

**Good:** (Don't include generic advice)

Or if project-specific:
```markdown
## Testing

- Integration tests required for all API endpoints
- Use `tests/factories/` for test data (not inline mocks)
```

**Why it's bad:** Generic advice applies to all projects; Claude already knows it.

---

## 4. One-Off Fixes

**Bad:**
```markdown
## Bug Fixes

- Fixed issue in commit abc123 where login button didn't work on Safari
- Resolved the memory leak in the dashboard component (see PR #456)
```

**Good:** (Don't include — these are historical, not recurring)

**Why it's bad:** Past bugs don't help future sessions unless they're recurring gotchas.

---

## 5. Vague Instructions

**Bad:**
```markdown
- Run tests appropriately
- Be careful with database operations
- Consider performance implications
- Make sure the code is clean
```

**Good:**
```markdown
- `npm test` — Run full test suite
- `npm test -- --watch` — Watch mode for TDD
- Always use transactions for multi-table writes
- Queries must include `LIMIT` clause (no unbounded selects)
```

**Why it's bad:** Claude can't execute vague instructions. Be specific.

---

## 6. Monolithic CLAUDE.md

**Bad:** Single CLAUDE.md file with 500+ lines covering everything

**Good:**
```
CLAUDE.md (60 lines) — Core commands and architecture
.claude/rules/
  security.md — Security requirements
  testing.md — Test patterns
  code-style.md — Conventions
```

**Why it's bad:** Large files get ignored/diluted. Split by topic.

---

## 7. Template Copy-Paste

**Bad:**
```markdown
## Architecture

```
src/
  components/  # UI components
  utils/       # Utility functions
  hooks/       # Custom hooks
```
```

(When the project actually has different structure)

**Good:** Actually describe YOUR project's structure

**Why it's bad:** Incorrect information is worse than no information.

---

## 8. Cursor-Specific Frontmatter in Rules

**Bad:**
```yaml
---
alwaysApply: true
description: "Security rules for all files"
name: "Security"
---
```

**Good:**
```yaml
---
paths: src/**/*.ts
---
```

Or no frontmatter at all (applies to all files)

**Why it's bad:** Claude Code ignores `alwaysApply` and `description`. Only `paths` works.

---

## 9. Emphasis Overuse

**Bad:**
```markdown
IMPORTANT: Always use TypeScript
CRITICAL: Never use `any` type
ALWAYS: Write tests first
NEVER: Skip code review
MUST: Follow naming conventions
```

**Good:**
```markdown
- Use TypeScript (no `.js` files)
- Avoid `any` — use proper types or `unknown`
- Tests required before merge

**NEVER** commit API keys or secrets (use `.env.local`)
```

**Why it's bad:** When everything is emphasized, nothing stands out. Reserve for critical gotchas.

---

## 10. Outdated Commands

**Bad:**
```markdown
## Commands

- `yarn start` — Start dev server
- `yarn test:unit` — Run unit tests
```

(When the project now uses npm and commands changed)

**Good:** Verify commands actually work before documenting

**Why it's bad:** Broken commands waste time and confuse Claude.

---

## 11. Path References That Don't Exist

**Bad:**
```markdown
## Key Files

- `src/core/auth.ts` — Authentication logic
- `config/database.yaml` — Database configuration
```

(When these files have been moved or deleted)

**Good:** Verify paths exist: `ls -la src/core/auth.ts`

**Why it's bad:** Claude will look for files that don't exist.

---

## 12. Duplicate Information

**Bad:**
```markdown
# CLAUDE.md
## Security
- Never commit secrets
- Validate all user input

# .claude/rules/security.md
## Security Guidelines
- Don't commit secrets to git
- Always validate input from users
```

**Good:** Put it in ONE place. Rules for topic-specific, CLAUDE.md for cross-cutting.

**Why it's bad:** Duplication wastes tokens and can become inconsistent.

---

## 13. TODO Items Never Completed

**Bad:**
```markdown
## Setup

TODO: Document environment variables
TODO: Add deployment instructions
```

**Good:** Either complete the TODO or remove it

**Why it's bad:** Stale TODOs signal neglect and may confuse Claude.

---

## Detection Heuristics

| Anti-Pattern | Detection |
|--------------|-----------|
| Verbose explanations | Paragraphs >3 lines explaining one concept |
| Obvious info | Descriptions that match class/function names |
| Generic advice | Phrases like "use meaningful names", "write tests" |
| Vague instructions | Words like "appropriately", "consider", "be careful" |
| Outdated | Commands that fail, paths that don't exist |
| Template copy-paste | Generic structure that doesn't match actual project |
| Emphasis overuse | >3 IMPORTANT/NEVER/ALWAYS in one file |
| Duplication | Same content in CLAUDE.md and rules |
