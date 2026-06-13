# Python Linting

## Tool Choice

**Prefer ruff** - Fast, replaces flake8/isort/pyupgrade/autoflake in one tool.

Fallback to flake8 only if ruff is incompatible with the project.

## Dependencies

```bash
pip install ruff
# or
pip install flake8 flake8-bugbear flake8-comprehensions
```

## Config: pyproject.toml (ruff)

```toml
[tool.ruff]
target-version = "py311"  # Adjust to project's Python version
line-length = 88

[tool.ruff.lint]
select = [
  "E",      # pycodestyle errors
  "W",      # pycodestyle warnings
  "F",      # pyflakes
  "I",      # isort
  "B",      # flake8-bugbear
  "C4",     # flake8-comprehensions
  "UP",     # pyupgrade
  "SIM",    # flake8-simplify
  "TCH",    # flake8-type-checking
  "RUF",    # ruff-specific
  "PTH",    # flake8-use-pathlib
  "ERA",    # eradicate (commented code)
  "PL",     # pylint
]
ignore = [
  "E501",   # line too long (handled by formatter)
  "PLR0913", # too many arguments
]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]  # allow assert in tests

[tool.ruff.lint.isort]
known-first-party = ["myproject"]  # Replace with actual package name

[tool.ruff.format]
quote-style = "double"
```

## Strictness Levels

### Relaxed
```toml
select = ["E", "W", "F", "I", "B"]
ignore = ["E501", "B008"]
```

### Moderate (Default)
Use the config as shown above.

### Strict
```toml
select = [
  "ALL",  # Enable all rules
]
ignore = [
  "E501",
  "D",      # pydocstyle (optional)
  "ANN",    # flake8-annotations (optional)
]

[tool.ruff.lint.pylint]
max-complexity = 10
```

## Config: setup.cfg (flake8 fallback)

```ini
[flake8]
max-line-length = 88
extend-ignore = E203, E501, W503
per-file-ignores =
    tests/*: S101
select = B,B9,C,E,F,W
```

## Scripts

Add to pyproject.toml:

```toml
[project.scripts]
# or use in CI/Makefile:
```

Common commands:
```bash
ruff check .
ruff check . --fix
ruff format .
```

## pre-commit Integration

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.4
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
```
