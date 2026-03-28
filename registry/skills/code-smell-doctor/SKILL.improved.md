---
name: code-smell-doctor
description: |
  Analyze code for the 23 classic code smells. Use when asked to:
  review code quality, find code smells, detect anti-patterns, identify refactoring opportunities,
  audit code for maintainability issues, or when phrases like "smell", "code quality",
  "refactor", "clean up", "technical debt" appear. Covers 5 categories: Bloaters (Long Method,
  Large Class, Primitive Obsession, Long Parameter List, Data Clumps), Object-Orientation Abusers
  (Alternative Classes with Different Interfaces, Refused Bequest, Switch Statements, Temporary Field),
  Change Preventers (Divergent Change, Parallel Inheritance Hierarchies, Shotgun Surgery),
  Dispensables (Comments, Duplicate Code, Data Class, Dead Code, Lazy Class, Speculative Generality),
  and Couplers (Feature Envy, Inappropriate Intimacy, Incomplete Library Class, Message Chains, Middle Man).
---

# Code Smell Doctor

Analyze code for the 23 classic code smells and recommend specific refactoring techniques.

## Analysis Workflow

1. Read the target code file(s)
2. Scan for each smell category systematically
3. Report findings with severity (High/Medium/Low), location, explanation, and fix
4. Prioritize by impact on maintainability

## Quick Reference

| Category | Smells |
|----------|--------|
| Bloaters | Long Method, Large Class, Primitive Obsession, Long Parameter List, Data Clumps |
| OO Abusers | Alt Classes w/ Diff Interfaces, Refused Bequest, Switch Statements, Temporary Field |
| Change Preventers | Divergent Change, Parallel Inheritance, Shotgun Surgery |
| Dispensables | Comments, Duplicate Code, Data Class, Dead Code, Lazy Class, Speculative Generality |
| Couplers | Feature Envy, Inappropriate Intimacy, Incomplete Library Class, Message Chains, Middle Man |

## Detection Patterns

For detailed detection heuristics and refactoring techniques, see:
- [references/bloaters.md](references/bloaters.md) - Size-related smells
- [references/oo-abusers.md](references/oo-abusers.md) - OOP misuse patterns
- [references/change-preventers.md](references/change-preventers.md) - Rigidity smells
- [references/dispensables.md](references/dispensables.md) - Unnecessary code
- [references/couplers.md](references/couplers.md) - Coupling issues

## Output Structure

Organize your output in this exact order:

### 1. Summary Table
Start with a markdown table listing all detected smells at a glance:

```
| # | Smell | Severity | Location |
|---|-------|----------|----------|
| 1 | Long Method | High | OrderProcessor.process_order |
| 2 | ... | ... | ... |
```

### 2. Findings by Category
Group findings under the 5 category headings. For each category, use a level-2 heading. If a category has no findings, include it with "No issues found."

```
## Bloaters
### Long Method (Severity: High)
...

## OO Abusers
No issues found.
```

For each smell found within a category:

```
### [Smell Name] (Severity: High/Medium/Low)
**Location:** file:line or class/method name
**Problem:** Brief explanation of what's wrong
**Evidence:** Specific code indicators
**Fix:** Recommended refactoring technique(s)

Before:
[short code snippet showing the smell]

After:
[short code snippet showing the fix]
```

IMPORTANT: Every fix MUST include a concrete before/after code snippet showing the smelly code and the refactored version. Keep snippets short (3-8 lines each). This is the most valuable part of the output — technique names alone are not actionable enough.

### Deduplication Rule
When multiple smells share the same root cause (e.g., a class being too large causes both "Large Class" and "Divergent Change"), report ONLY the primary smell and mention the related smells as secondary notes within that entry. Do not create separate entries for the same underlying problem. Similarly, if dead code also has a comment above it, report it once (as Dead Code) rather than also listing it under Comments smell. The goal is one entry per distinct fixable issue.

### 3. Top 3 Actions
End with a "Top 3 Actions" section listing the three highest-impact fixes to make first, in priority order. Each action should name the smell, the location, and the specific refactoring technique.

## Severity Guidelines

- **High**: Actively impedes development, causes bugs, or makes changes risky
- **Medium**: Makes code harder to understand or modify
- **Low**: Minor issue, fix when touching the code anyway

## Common Detection Heuristics

### Bloaters
- Method >15 lines or >3 levels of nesting → Long Method
- Class >300 lines or >10 fields → Large Class
- Repeated primitive groups (e.g., `startDate`, `endDate`) → Data Clumps
- >4 parameters → Long Parameter List
- Constants like `USER_ADMIN = 1` → Primitive Obsession

### OO Abusers
- `switch` on type codes → Switch Statements
- Subclass overrides parent methods to throw/no-op → Refused Bequest
- Fields only set in certain methods → Temporary Field
- Two classes with same behavior, different names → Alternative Classes

### Change Preventers
- One class changes for unrelated reasons → Divergent Change
- One change touches many classes → Shotgun Surgery
- Creating `FooX` requires creating `BarX` → Parallel Inheritance

### Dispensables
- Comments explaining what code does (not why) → Comments smell
- Copy-pasted code blocks → Duplicate Code
- Class with only getters/setters → Data Class
- Unreachable code, unused vars → Dead Code
- Class doing almost nothing → Lazy Class
- Abstract class with one implementation → Speculative Generality

### Couplers
- Method uses other object's data more than own → Feature Envy
- Classes accessing each other's internals → Inappropriate Intimacy
- Chains like `a.getB().getC().getD()` → Message Chains
- Class only delegates, no real logic → Middle Man
