# Rust Linting

## Tool: Clippy

Clippy is the standard Rust linter, included with rustup.

```bash
rustup component add clippy
```

## Config: Cargo.toml or clippy.toml

### Cargo.toml

```toml
[lints.clippy]
# Correctness - always error
correctness = "deny"

# Suspicious code
suspicious = "warn"

# Complexity
cognitive_complexity = "warn"

# Style
style = "warn"

# Pedantic (opinionated but useful)
pedantic = "warn"

# Allow specific pedantic lints that are too noisy
needless_pass_by_value = "allow"
must_use_candidate = "allow"
module_name_repetitions = "allow"

# Restriction lints (opt-in, very strict)
# unwrap_used = "warn"
# expect_used = "warn"
```

### clippy.toml (for configurable lints)

```toml
cognitive-complexity-threshold = 15
too-many-arguments-threshold = 7
type-complexity-threshold = 250
```

## Strictness Levels

### Relaxed
```toml
[lints.clippy]
correctness = "deny"
suspicious = "warn"
style = "allow"
pedantic = "allow"
```

### Moderate (Default)
```toml
[lints.clippy]
correctness = "deny"
suspicious = "warn"
style = "warn"
pedantic = "warn"
# Allow noisy pedantic lints
needless_pass_by_value = "allow"
must_use_candidate = "allow"
```

### Strict
```toml
[lints.clippy]
correctness = "deny"
suspicious = "deny"
style = "deny"
pedantic = "deny"
# Restriction lints
unwrap_used = "warn"
expect_used = "warn"
missing_docs_in_private_items = "warn"
```

## Commands

```bash
# Check
cargo clippy

# Check all targets (tests, examples, benches)
cargo clippy --all-targets

# Fix automatically
cargo clippy --fix

# CI mode (fail on warnings)
cargo clippy -- -D warnings
```

## Recommended .cargo/config.toml

```toml
[target.'cfg(all())']
rustflags = ["-D", "warnings"]
```

## Common Useful Lints

```toml
[lints.clippy]
# Error handling
unwrap_in_result = "warn"
map_err_ignore = "warn"

# Performance
needless_collect = "warn"
inefficient_to_string = "warn"

# Clarity
match_bool = "warn"
if_not_else = "warn"
redundant_else = "warn"
```

## rustfmt Integration

Pair clippy with rustfmt for formatting:

```toml
# rustfmt.toml
edition = "2021"
max_width = 100
tab_spaces = 4
```

```bash
cargo fmt
cargo fmt --check  # CI mode
```
