# Go Linting

## Tool: golangci-lint

The standard aggregator for Go linters.

```bash
# macOS
brew install golangci-lint

# Linux
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin

# Go install
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

## Config: .golangci.yml

```yaml
run:
  timeout: 5m
  tests: true

linters:
  enable:
    # Bugs
    - errcheck
    - gosec
    - staticcheck
    - govet

    # Code quality
    - gocyclo
    - gocognit
    - dupl
    - goconst

    # Style
    - gofmt
    - goimports
    - revive
    - stylecheck

    # Performance
    - prealloc
    - ineffassign

    # Modern Go
    - nilerr
    - exhaustive

linters-settings:
  gocyclo:
    min-complexity: 15

  gocognit:
    min-complexity: 15

  dupl:
    threshold: 100

  goconst:
    min-len: 3
    min-occurrences: 3

  revive:
    rules:
      - name: blank-imports
      - name: context-as-argument
      - name: context-keys-type
      - name: dot-imports
      - name: error-return
      - name: error-strings
      - name: error-naming
      - name: exported
      - name: increment-decrement
      - name: var-naming
      - name: package-comments
      - name: range
      - name: receiver-naming
      - name: time-naming
      - name: unexported-return
      - name: indent-error-flow
      - name: errorf

issues:
  exclude-rules:
    # Exclude some linters from tests
    - path: _test\.go
      linters:
        - dupl
        - gosec
```

## Strictness Levels

### Relaxed
```yaml
linters:
  enable:
    - errcheck
    - staticcheck
    - govet
    - gofmt

linters-settings:
  gocyclo:
    min-complexity: 20
```

### Moderate (Default)
Use the config as shown above.

### Strict
```yaml
linters:
  enable-all: true
  disable:
    - exhaustivestruct  # deprecated
    - golint            # deprecated
    - maligned          # deprecated
    - scopelint         # deprecated

linters-settings:
  gocyclo:
    min-complexity: 10

  gocognit:
    min-complexity: 10

  funlen:
    lines: 60
    statements: 40
```

## Commands

```bash
# Lint
golangci-lint run

# Lint with fix
golangci-lint run --fix

# Lint specific directories
golangci-lint run ./cmd/... ./pkg/...

# Fast mode (skip expensive linters)
golangci-lint run --fast

# CI mode (verbose)
golangci-lint run --out-format=colored-line-number
```

## Makefile Integration

```makefile
.PHONY: lint
lint:
	golangci-lint run

.PHONY: lint-fix
lint-fix:
	golangci-lint run --fix
```

## go.mod Note

Ensure golangci-lint version matches Go version:
```yaml
run:
  go: "1.22"  # Match your go.mod
```
