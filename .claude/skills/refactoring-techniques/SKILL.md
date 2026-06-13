---
name: refactoring-techniques
description: |
  Comprehensive reference for 66 classic refactoring techniques.
  Use when asked to refactor code, improve code structure, simplify methods, reorganize classes,
  clean up conditionals, or improve method signatures. Triggers on: "refactor this", "simplify",
  "extract method", "move field", "inline", "encapsulate", "consolidate", "decompose",
  "replace conditional", "pull up", "push down", or any specific technique name.
  Covers 6 categories: Composing Methods (9), Moving Features (8), Organizing Data (16),
  Simplifying Conditionals (8), Simplifying Method Calls (14), Dealing with Generalization (12).
---

# Refactoring Techniques

66 classic refactoring techniques organized into 6 categories.

## Quick Reference

| Category | Count | When to Use |
|----------|-------|-------------|
| [Composing Methods](references/composing-methods.md) | 9 | Methods too long, complex expressions, tangled local variables |
| [Moving Features](references/moving-features.md) | 8 | Features in wrong class, class does too much/little |
| [Organizing Data](references/organizing-data.md) | 16 | Data fields need encapsulation, type codes, magic numbers |
| [Simplifying Conditionals](references/simplifying-conditionals.md) | 8 | Complex conditionals, nested if/else, null checks |
| [Simplifying Method Calls](references/simplifying-method-calls.md) | 14 | Awkward method signatures, unclear naming, side effects |
| [Dealing with Generalization](references/dealing-with-generalization.md) | 12 | Inheritance hierarchy issues, duplicate code across subclasses |

## Technique Selection Guide

### For Long/Complex Methods
1. **Extract Method** - Group related code into named method
2. **Extract Variable** - Break complex expressions into named parts
3. **Replace Temp with Query** - Convert temp variables to methods
4. **Replace Method with Method Object** - When local vars prevent extraction

### For Misplaced Features
1. **Move Method/Field** - Feature used more in another class
2. **Extract Class** - Class has multiple responsibilities
3. **Inline Class** - Class does almost nothing

### For Data Organization
1. **Encapsulate Field/Collection** - Public fields need protection
2. **Replace Magic Number with Constant** - Unclear numeric literals
3. **Replace Type Code with Subclasses/State-Strategy** - Type codes controlling behavior

### For Complex Conditionals
1. **Decompose Conditional** - Long if/else blocks
2. **Replace Conditional with Polymorphism** - Type-based switching
3. **Replace Nested Conditional with Guard Clauses** - Deep nesting
4. **Introduce Null Object** - Many null checks

### For Method Signatures
1. **Introduce Parameter Object** - Repeating parameter groups
2. **Preserve Whole Object** - Passing multiple values from same object
3. **Separate Query from Modifier** - Method has side effects
4. **Replace Constructor with Factory Method** - Complex object creation

### For Inheritance Issues
1. **Pull Up Method/Field** - Duplicate code in subclasses
2. **Push Down Method/Field** - Feature only used by some subclasses
3. **Extract Superclass/Interface** - Common features across classes
4. **Replace Inheritance with Delegation** - Subclass doesn't truly extend parent

## Workflow

1. **Identify the smell** - Name the specific code smell (e.g., Long Method, Large Class, Long Parameter List, Feature Envy)
2. **Select technique** - Use the selection guide above
3. **Read technique details** - Load the appropriate reference file and cite it (e.g., "See [Composing Methods](references/composing-methods.md) for full details")
4. **Show before/after** - Always include a concrete code example showing the code before and after applying the primary technique
5. **Apply incrementally** - Make small, verifiable changes
6. **Test after each step** - Ensure behavior is preserved
