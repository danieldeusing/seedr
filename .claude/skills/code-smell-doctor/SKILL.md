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

## Output Format

For each smell found:

```
### [Smell Name] (Severity: High/Medium/Low)
**Location:** file:line or class/method name
**Problem:** Brief explanation of what's wrong
**Evidence:** Specific code indicators
**Fix:** Recommended refactoring technique(s)
```

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
