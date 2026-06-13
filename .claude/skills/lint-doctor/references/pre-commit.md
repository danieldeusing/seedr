# Pre-commit Hooks

## JavaScript/TypeScript: Husky + lint-staged

### Installation

```bash
npm install -D husky lint-staged
npx husky init
```

### .husky/pre-commit

```bash
npx lint-staged
```

### package.json

```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ],
    "*.css": [
      "prettier --write"
    ]
  }
}
```

### Strict Mode (block on warnings)

```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": [
      "eslint --max-warnings=0 --fix",
      "prettier --write"
    ]
  }
}
```

---

## Python: pre-commit

### Installation

```bash
pip install pre-commit
pre-commit install
```

### .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.4
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-merge-conflict

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.9.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests]
```

### Commands

```bash
# Run on all files
pre-commit run --all-files

# Update hooks
pre-commit autoupdate

# Skip hooks (emergency only)
git commit --no-verify
```

---

## Rust: Pre-commit with cargo

### .pre-commit-config.yaml

```yaml
repos:
  - repo: local
    hooks:
      - id: cargo-fmt
        name: cargo fmt
        entry: cargo fmt --
        language: system
        types: [rust]

      - id: cargo-clippy
        name: cargo clippy
        entry: cargo clippy --all-targets -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false
```

---

## Go: Pre-commit with golangci-lint

### .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/golangci/golangci-lint
    rev: v1.57.2
    hooks:
      - id: golangci-lint

  - repo: local
    hooks:
      - id: go-fmt
        name: go fmt
        entry: gofmt -w
        language: system
        types: [go]
```

---

## Java: Pre-commit

### .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer

  - repo: local
    hooks:
      - id: checkstyle
        name: checkstyle
        entry: mvn checkstyle:check -q
        language: system
        types: [java]
        pass_filenames: false
```

---

## CI Integration

### GitHub Actions

```yaml
- uses: pre-commit/action@v3.0.1
```

### Skip in CI (if linting happens separately)

```yaml
env:
  SKIP: eslint,prettier
```
