---
name: lint-doctor
description: |
  Diagnose and configure linting for any project based on universal best practices.
  Use when asked to: set up linting, configure ESLint, add code quality rules, fix lint config,
  set up pre-commit hooks, improve code quality tooling, or when phrases like "lint", "code quality",
  "static analysis", "eslint", "ruff", "clippy", "checkstyle" appear.
  Supports: JavaScript/TypeScript (ESLint + sonarjs, unicorn), React/Vue/Angular, Python (ruff),
  Java (Checkstyle, Google style), Rust (clippy), Go (golangci-lint). Handles monorepos.
---

# Lint Doctor

Diagnose project environment and configure linting with universal best practices (Google style fallback).

## Workflow

### 1. Detect Environment

Scan project root for config files:

| Files Found | Stack Detected |
|-------------|----------------|
| `package.json`, `tsconfig.json` | JS/TS |
| `package.json` + react in deps | React |
| `angular.json` | Angular |
| `vite.config.ts` + vue | Vue |
| `pyproject.toml`, `setup.py`, `requirements.txt` | Python |
| `pom.xml`, `build.gradle` | Java |
| `Cargo.toml` | Rust |
| `go.mod` | Go |

For monorepos: check for workspaces in `package.json`, multiple config files in subdirectories.

### 2. User Interaction

Ask initial question using AskUserQuestion:

```
header: "Mode"
question: "How should I configure linting?"
options:
  - label: "Automatic (Recommended)"
    description: "Apply best practices with sensible defaults"
  - label: "Interactive"
    description: "Ask about each configuration choice"
```

If Interactive, also ask:

```
header: "Strictness"
question: "What strictness level?"
options:
  - label: "Moderate (Recommended)"
    description: "Warnings for style, errors for bugs"
  - label: "Relaxed"
    description: "Mostly warnings, fewer rules"
  - label: "Strict"
    description: "More rules, errors for style violations"
```

```
header: "Pre-commit"
question: "Set up pre-commit hooks?"
options:
  - label: "No (Recommended)"
    description: "Just configure the linter"
  - label: "Yes"
    description: "Add husky + lint-staged for JS, or pre-commit for Python"
```

### 3. Configure

Based on detected stack, apply rules from the appropriate reference:

- **JavaScript/TypeScript/React/Vue/Angular**: See [references/javascript.md](references/javascript.md)
- **Python**: See [references/python.md](references/python.md)
- **Java**: See [references/java.md](references/java.md)
- **Rust**: See [references/rust.md](references/rust.md)
- **Go**: See [references/go.md](references/go.md)
- **Pre-commit hooks**: See [references/pre-commit.md](references/pre-commit.md)

**Priority**: Read and enhance existing configs. If a lint config already exists, read it first and merge new rules into the existing structure rather than replacing it. Only create new files if none exist.

### 4. Output

1. **Show changes** - Display diff of config modifications
2. **Add lint scripts** - Add `lint` and `lint:fix` scripts to `package.json` (JS) or show equivalent CLI commands for other stacks
3. **List key rules** - Show a "Key rules enabled" summary naming at least 5 specific rule IDs (e.g., `no-unused-vars`, `E501`, `B006`) with a one-line description of what each catches
4. **List dependencies** - Show packages to install
5. **Ask to install** - Use AskUserQuestion to confirm installation
6. **Ask about --fix** - Offer to run auto-fix after setup

```
header: "Install"
question: "Install these dependencies?"
options:
  - label: "Yes (Recommended)"
    description: "Run npm install / pip install now"
  - label: "No"
    description: "I'll install manually"
```

```
header: "Auto-fix"
question: "Run auto-fix on existing code?"
options:
  - label: "Yes"
    description: "Run linter with --fix flag"
  - label: "No (Recommended)"
    description: "Just configure, don't modify code yet"
```

## Severity Guidelines

Follow best practice conventions:

| Category | Severity | Examples |
|----------|----------|----------|
| Bugs | `error` | no-undef, no-unused-vars |
| Security | `error` | no-eval, no-implied-eval |
| Complexity | `warn` | cognitive-complexity, max-depth |
| Style | `warn` | prefer-const, no-var |
| Formatting | `off` | Let Prettier handle it |

**For tools without native severity levels** (e.g., ruff, clippy): map the severity concept by categorizing rules in the output. In the "Key rules enabled" summary, label each rule as `[error]`, `[warn]`, or `[off]` based on the table above. For ruff, put formatting rules (E501, W291, W292) in `ignore` and explain in the output that bug/security rules will block CI while style rules are advisory.
