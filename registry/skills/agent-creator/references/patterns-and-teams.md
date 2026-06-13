# Agent Patterns & Teams

## Common Agent Patterns

Field-tested agent configurations that solve specific problems.

### Code Reviewer
```yaml
---
name: code-reviewer
description: Review code for bugs, security vulnerabilities, and best practices violations. Use when asked to review code, PRs, or check code quality.
tools: [Read, Grep, Glob, Bash]
model: sonnet
permissionMode: dontAsk
maxTurns: 15
---
```
Read-only analysis. `dontAsk` blocks any action needing approval — second safety layer beyond tool restrictions. Bash for running linters/type-checkers.

### Test Writer
```yaml
---
name: test-writer
description: Generate comprehensive test suites from implementation code. Use when asked to write tests, add test coverage, or create test files.
tools: [Read, Write, Edit, Bash, Grep, Glob]
model: sonnet
maxTurns: 20
---
```
Needs Write/Edit to create test files. Bash to run tests and verify they pass.

### Debugger
```yaml
---
name: debugger
description: Track down bugs using systematic root cause analysis. Use when asked to debug, find the cause of an error, or investigate a failing test.
tools: [Read, Edit, Bash, Grep, Glob]
model: sonnet
maxTurns: 25
---
```
Captures error, isolates failure, implements fix. Needs Edit for fixes, Bash for reproduction.

### Doc Generator
```yaml
---
name: doc-generator
description: Generate documentation from code including API docs, README sections, and inline documentation.
tools: [Read, Write, Grep, Glob]
model: haiku
maxTurns: 15
---
```
Haiku for fast, cheap doc generation. Read-heavy with Write for output.

### Security Auditor
```yaml
---
name: security-auditor
description: Scan for OWASP vulnerabilities, dependency issues, and security misconfigurations. Use for security reviews and audits.
tools: [Read, Grep, Glob, Bash]
model: sonnet
permissionMode: dontAsk
maxTurns: 20
---
```
Sonnet for accuracy on security-sensitive analysis. Bash for running security scanning tools.

### Architecture Reviewer
```yaml
---
name: architecture-reviewer
description: Evaluate design decisions, suggest architectural improvements, and review system design. Use for architecture reviews and design discussions.
tools: [Read, Grep, Glob]
model: opus
permissionMode: dontAsk
maxTurns: 15
---
```
Opus for deep reasoning about architectural trade-offs. Strictly read-only.

### Codebase Explorer
```yaml
---
name: explorer
description: Search files and discover code patterns across the codebase. Use for quick lookups and broad research.
tools: [Read, Grep, Glob]
model: haiku
permissionMode: dontAsk
maxTurns: 10
---
```
Haiku for fast/cheap parallel research. 10 of these cost ~1 Sonnet agent. Great for broad searches.

---

## Orchestration Patterns

Claude decides orchestration based on the task. You influence this through how you phrase requests and which agents you define.

### Leader (most common)
"Review this PR" — session spawns reviewer, security auditor, and test runner in parallel. Each reports findings. Session combines into one review.

Best for: Independent subtasks that can run simultaneously.

### Pipeline
"Build auth feature" — spec agent writes requirements → design agent → code agent → test agent. Each stage's output feeds the next.

Best for: Sequential dependencies where each step builds on the previous.

### Swarm
"Migrate 50 endpoints" — five agents each handle 10 endpoints simultaneously. Same task template, different data slices. Requires Agent Teams.

Best for: Embarrassingly parallel work with clear data boundaries.

### Council
"GraphQL or REST?" — performance analyst, security expert, and DX advocate each argue their case. Multi-perspective recommendation.

Best for: Decisions requiring multiple viewpoints.

---

## Agent Teams

Agent Teams are a **separate feature** from subagents. Instead of helpers that report back, teammates are fully independent Claude Code instances that communicate with each other.

### Enabling
Experimental. Add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to settings.json `env` or shell environment.

### Subagents vs Teams

| | Subagents | Teams |
|---|---|---|
| Context | Own context, results return to caller | Fully independent contexts |
| Communication | Report back only | Message each other directly |
| Coordination | None (caller orchestrates) | Shared task list, self-coordination |
| Cost | Lower | Higher (scales with teammates) |
| Best for | Focused tasks where only result matters | Complex work requiring discussion |

### Architecture

- **Team Lead** — your main session. Creates team, spawns teammates, assigns work, synthesizes results.
- **Teammates** — separate Claude Code instances with own context windows. Load CLAUDE.md, MCP servers, and skills independently.
- **Shared Task List** — work items with statuses (pending/in-progress/completed) and dependencies. Teammates self-claim unblocked tasks.
- **Mailbox** — direct messages between any teammates.

### Best Use Cases

- **Research & review** — multiple teammates investigate different aspects simultaneously
- **New modules** — each teammate owns a separate piece without file conflicts
- **Competing hypotheses** — teammates test different theories and debate
- **Cross-layer work** — frontend, backend, and tests each owned by different teammate

### Controls

- **Display modes** — `in-process` (one terminal, Shift+Up/Down to switch) or `tmux`/`iTerm2` split panes
- **Delegate mode** — Shift+Tab to restrict lead to coordination only
- **Plan approval** — require teammates to plan before implementing
- **Quality hooks** — `TeammateIdle` and `TaskCompleted` hooks enforce rules

### Limitations

- One team per session
- No nested teams
- No session resumption for in-process teammates
- Lead is fixed (can't promote a teammate)
- All teammates start with lead's permission mode
- Token cost scales with number of teammates
