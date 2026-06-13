---
name: agent-creator
description: Guide for creating Claude Code agents (subagents). Use when users want to create a new agent, modify an existing agent, understand agent configuration, or ask about agent frontmatter fields, tools, permissions, models, memory, hooks, or skills. Triggers on "create an agent", "new agent", "agent for...", "modify agent", ".claude/agents/", agent frontmatter fields (tools, model, permissionMode, maxTurns, memory, hooks, skills, mcpServers, disallowedTools), or any question about how Claude Code agents work.
---

# Agent Creator

Guide for creating effective Claude Code agents. An agent is a **markdown file with YAML frontmatter** stored in `.claude/agents/`. The frontmatter configures behavior; the markdown body is the system prompt.

## Agent File Structure

```
---
name: my-agent
description: What this agent does and when to use it.
tools: [Read, Grep, Glob]
model: sonnet
permissionMode: dontAsk
maxTurns: 15
---

# Agent System Prompt

Instructions for the agent go here. Write like you're briefing a colleague.
The more specific and structured, the more consistent the behavior.
```

## Complete Example

Here is a complete, well-structured agent — use this as a template for quality:

```markdown
---
name: dependency-auditor
description: Audit npm/yarn dependencies for known vulnerabilities, outdated packages, and license compliance issues. Use when reviewing package.json or running security checks.
tools: [Read, Grep, Glob, Bash]
model: sonnet
permissionMode: default
maxTurns: 12
---

# Dependency Auditor

You audit project dependencies for security, freshness, and license compliance.

## Focus Areas
- **Vulnerabilities**: Check for CVEs via `npm audit` or `yarn audit`. Flag critical/high severity.
- **Outdated packages**: Identify packages >2 major versions behind.
- **License compliance**: Flag copyleft licenses (GPL, AGPL) in commercial projects.
- **Unused dependencies**: Cross-reference imports against package.json entries.

## Process
1. Read package.json and lock file to understand the dependency tree.
2. Run `npm audit --json` (or yarn equivalent) and parse results.
3. Grep source files to find actually-used imports vs declared dependencies.
4. Compile findings into a structured report.

## Output Format
For each finding, report:
- **Package**: name and current version
- **Issue**: vulnerability CVE / outdated / license / unused
- **Severity**: Critical, High, Medium, Low, Info
- **Action**: specific recommended fix (e.g., "upgrade lodash from 4.17.15 to 4.17.21")

## Rules
- Never auto-fix — report only. The user decides what to upgrade.
- If no issues found, confirm clean audit with summary stats.
- Skip devDependencies for license checks unless asked.
```

## Frontmatter Fields

### Required

| Field | Description |
|-------|-------------|
| `name` | Unique identifier — lowercase letters and hyphens only (e.g. `code-reviewer`). Referenced in prompts and CLI flags. |
| `description` | Short sentence explaining what agent does. Claude matches messages against every agent's description to decide which to spawn — **make it specific and unambiguous**. Must include: (1) the action performed, (2) the domain/scope, and (3) a "Use when..." trigger phrase. Example: "Audit npm dependencies for vulnerabilities and license issues. Use when reviewing package.json or running security checks." |

### Optional

| Field | Values | Default | Description |
|-------|--------|---------|-------------|
| `tools` | `[Read, Grep, Glob, Edit, Write, Bash, WebFetch, WebSearch]` | All tools | Allowlist. Agent can **only** use listed tools. Omit to inherit all (use sparingly). |
| `disallowedTools` | Tool names to remove | None | Denylist — "everything except X". |
| `model` | `haiku`, `sonnet`, `opus` | `inherit` | AI model. See Model Selection below. |
| `permissionMode` | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan`, `delegate` | `default` | How agent handles permission prompts. Independent of parent session. |
| `maxTurns` | Positive integer | No limit | Max API round-trips. Safety net against runaway token consumption. |
| `skills` | Array of skill names | None | Skills injected into context at startup. **Not inherited** from parent — must list explicitly. |
| `mcpServers` | Server names or inline configs | None | MCP servers available to this agent. |
| `hooks` | `PreToolUse`, `PostToolUse`, `Stop` | None | Lifecycle hooks scoped to this agent. See [references/memory-and-hooks.md](references/memory-and-hooks.md). |
| `memory` | `user`, `project`, `local` | None | Persistent memory scope. See [references/memory-and-hooks.md](references/memory-and-hooks.md). |

## Tools Reference

| Tool | What it does | Danger level |
|------|-------------|--------------|
| `Read` | Read file contents | Safe (read-only) |
| `Grep` | Search inside files for text patterns | Safe (read-only) |
| `Glob` | Find files by name pattern | Safe (read-only) |
| `Edit` | Modify existing files (find-and-replace) | **Modifies files** |
| `Write` | Create new files or overwrite existing | **Modifies files** |
| `Bash` | Run terminal commands | **Runs arbitrary commands** |
| `WebFetch` | Fetch content from a URL | Network access |
| `WebSearch` | Search the web | Network access |

**Read-only set:** `[Read, Grep, Glob]` — use for reviewers, auditors, explorers.
**Standard write set:** `[Read, Write, Edit, Bash, Grep, Glob]` — use for implementers.

**No nesting:** Agents cannot spawn other agents. Even if Task is listed, it has no effect.

## Permission Modes

| Mode | Behavior | Use for |
|------|----------|---------|
| `default` | Ask approval for each action | General purpose |
| `acceptEdits` | Auto-accept file edits, still ask for shell commands | Trusted writers |
| `dontAsk` | Block any action needing approval | Read-only agents (second safety layer) |
| `bypassPermissions` | Skip all checks | **Extreme caution** |
| `plan` | Read-only exploration | Planning agents |
| `delegate` | Team coordination only | Team leads |

## Model Selection

| Model | Cost/task | Accuracy | Best for |
|-------|-----------|----------|----------|
| `haiku` | ~$0.03 | ~60% | File lookups, formatting, bulk ops. 10 Haiku ≈ 1 Sonnet cost. |
| `sonnet` | ~$0.24 | ~85% | Standard dev work, code reviews. |
| `opus` | ~$1.20 | ~95% | Architecture, security-sensitive code. |
| `inherit` | (session) | (session) | Default when not specified. |

**Use Sonnet or Opus for sensitive code:** auth, payments, database ops, crypto — accuracy matters for security.

## Where to Save

| Location | Scope | Shareable |
|----------|-------|-----------|
| `.claude/agents/` | Project | Yes (via Git) |
| `~/.claude/agents/` | User (all projects) | No |
| `agents/` (in plugin) | Plugin | Yes (via plugin) |

Agents load at session start. If created mid-session, restart or use `/agents` to reload.

## Agent Lifecycle

1. **Spawn** — Fresh context with: agent's system prompt + CLAUDE.md + environment details. Parent summarizes relevant context in the task prompt (lossy).
2. **Execute** — Works independently using only its granted tools.
3. **Return** — Results come back as a summary, not full output.
4. **Resume** (optional) — Pass agent's ID to continue where it left off with full history intact.

### What agents receive
- Their custom system prompt (markdown body)
- CLAUDE.md project instructions
- Basic environment details (working directory, platform)
- Preloaded skills (only if listed in `skills` field)

### What agents do NOT receive
- Parent conversation history
- Parent skills (must be explicit)
- Full Claude Code system prompt (agents get their own simpler prompt)

### Context & storage
- **Own context window** — verbose tool output stays in agent's window, not yours
- **Compaction** — at ~95% capacity, older messages compressed. Put critical rules in CLAUDE.md (reloaded after compaction)
- **Transcripts** — saved as `~/.claude/projects/<hash>/agent-<agentId>.jsonl`. Auto-removed after 30 days.

## Invocation

| Method | How |
|--------|-----|
| **Auto** | Claude matches message against agent descriptions. Best match spawned. Most common. |
| **Explicit** | Name agent in prompt: "Use the security-auditor agent". |
| `/agents` | Slash command to browse, create, edit agents mid-session. |
| `--agent name` | CLI flag to start session as that agent. |
| `--agents '{...}'` | Register extra agents inline as JSON. |

**Foreground:** 1 agent → conversation pauses until done.
**Background:** Multiple agents → run concurrently in parallel. Background agents **cannot** use MCP tools or ask questions.

## Built-in Agents

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| `Explore` | Haiku | Read, Grep, Glob | Search files, discover patterns |
| `Plan` | Inherit | Read-only | Gather context for planning |
| `General` | Inherit | All | Complex multi-step tasks |
| `Bash` | Inherit | Bash only | Terminal commands |
| `Guide` | Haiku | Read-only | Answer Claude Code questions |

Disable a built-in: `{ "permissions": { "deny": ["Task(Explore)"] } }` in settings.

## Best Practices

1. **Minimal tools** — [Read, Grep, Glob] can't delete files or run commands. If prompt injection tricks it, damage is contained to reading.
2. **Specific descriptions** — "Handle code tasks" matches everything poorly. "Review TypeScript for security vulnerabilities in the auth module" activates reliably.
3. **Set maxTurns** — Without limit, confused agent loops indefinitely burning tokens. Code reviewer rarely needs >15 turns.
4. **dontAsk for read-only** — Blocks actions needing approval. Second safety layer beyond tool restrictions.
5. **Sonnet/Opus for sensitive code** — Larger models are harder to prompt-inject. Haiku follows instructions more literally.
6. **Check into version control** — Agents are code. PR reviews catch permission escalation and prompt regressions.
7. **Haiku for parallel research** — 10 Haiku agents cost ≈ 1 Sonnet. Finish much faster for simple file lookups.
8. **Start restrictive, expand later** — Easier to grant access than recover from a security incident.
9. **Store critical rules in CLAUDE.md** — Survives compaction. Agent system prompt can be lost at ~95% capacity.
10. **Provide verification criteria** — "Write validateEmail, test: user@example.com → true, invalid → false. Run tests after." gives the agent a feedback loop.

## Common Mistakes

1. **Swiss Army knife agent** — One agent with all tools and vague description. Never activates reliably, can't be specialized, security liability.
2. **Subagents for implementation** — They do NOT inherit conversation history. Use for research/information gathering; implement in main session.
3. **Parallel agents editing same files** — Last-write-wins race condition. Define explicit file ownership.
4. **Expecting conversation inheritance** — Agents start fresh. Include ALL necessary context in the task prompt.
5. **Not reviewing test modifications** — Agents sometimes change assertions to match incorrect code. Always review test file changes.
6. **Correction loops** — After 2 failed attempts, start fresh. /clear + better prompt is cheaper than noise accumulation.
7. **Over-parallelizing** — 5 agents for a single-domain feature wastes tokens. Match parallelism to task complexity.

## Creation Workflow

1. **Identify the task** — What specific job does this agent do? Be narrow.
2. **Choose tools** — Start with minimum needed. Read-only if possible.
3. **Choose model** — Haiku for simple lookups, Sonnet for standard work, Opus for critical reasoning.
4. **Set permissions** — `dontAsk` for read-only agents, `default` for writers.
5. **Set maxTurns** — Estimate reasonable turns for the task. Add small buffer.
6. **Write description** — Specific enough that Claude activates it for the right tasks and ignores it for others.
7. **Write system prompt** — Structure with four sections: **Focus Areas** (what to check/do), **Process** (step-by-step workflow), **Output Format** (how to report results), **Rules** (constraints and edge cases). See the Complete Example above.
8. **Add memory** (optional) — Only if agent runs repeatedly across sessions. See [references/memory-and-hooks.md](references/memory-and-hooks.md).
9. **Add hooks** (optional) — Auto-format, auto-lint, cleanup. See [references/memory-and-hooks.md](references/memory-and-hooks.md).
10. **Add skills** (optional) — Explicitly list any skills the agent needs.
11. **Save to `.claude/agents/`** and commit to Git.

## Advanced Topics

- **Persistent memory, hooks, and skills integration:** See [references/memory-and-hooks.md](references/memory-and-hooks.md)
- **Common agent patterns, orchestration, and agent teams:** See [references/patterns-and-teams.md](references/patterns-and-teams.md)
