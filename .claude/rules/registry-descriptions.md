# Registry Item Descriptions

Every `item.json` has two description fields. Both are mandatory for all registry items.

## `description` — "What does this do?"

A single sentence that tells the user what the item does.

- One clear sentence — naturally short because it focuses on the core capability
- Lead with what it *does*, not what it *is* ("Analyze code for 23 classic code smells" not "A code analysis tool")
- No trigger instructions ("Use when..."), no title restatements ("X plugin for Claude")
- Must work at a glance in a list view — users scan, they don't read

## `longDescription` — "Should I install this?"

Everything the user needs to decide whether to install, without reading the README.

- All concrete specifics: supported languages/frameworks, number of rules/patterns/techniques, included agents/commands, approach taken
- Differentiators: what makes this different from doing it manually or using alternatives
- No filler, no marketing speak — just the facts
- After reading this, the user should be able to make an informed install/skip decision
- Typically 30-90 words. The pre-commit hook enforces a minimum of 30 words.

### Formatting

Use **structured markdown** for complex items. The TL;DR section renders markdown with support for bold, inline code, and bullet lists.

- **Lead sentence**: Summarize what's included at a glance (counts, component types)
- **Bullet list**: When listing **3+ items** of the same kind (agents, categories, scripts, etc.), use a markdown bullet list with **bold category names**
- **Bold**: Use `**bold**` for counts and category/component names (e.g., `**15 code reviewers**`)
- **Backticks**: Use `` ` `` for file names, paths, commands, code identifiers. Do NOT backtick brand names (React, Tailwind CSS), pattern names (Factory Method), or role names (code reviewer)
- **No bullets for simple items**: If the item has only 1-2 components, keep it as prose — bullets add noise to short descriptions

### Examples

**Complex package** (use bullets):
```
Ships **29 agents**, **22 commands**, **19 skills**, and a `context7` MCP server.

- **Code reviewers** (15): Rails, TypeScript, Python, security, performance, architecture, data integrity
- **Research agents** (5): best practices, framework docs, git history
- **Design agents** (3): Figma sync, iteration
- **Workflow agents** (5): bug reproduction, PR resolution, linting
- **Commands**: `/workflows:` suite (`plan`, `review`, `work`, `compound`, `brainstorm`)
```

**Skill with categories** (use bullets):
```
Detects all **23 classic code smells** from Martin Fowler's catalog across 5 categories:

- **Bloaters** (5): Long Method, Large Class, Primitive Obsession, Long Parameter List, Data Clumps
- **OO Abusers** (4): Switch Statements, Temporary Field, Refused Bequest, Alternative Classes
- **Dispensables** (6): Dead Code, Duplicate Code, Lazy Class, Speculative Generality, Data Class, Comments
- **Couplers** (5): Feature Envy, Inappropriate Intimacy, Message Chains, Middle Man

Each smell includes detection heuristics, `file:line` locations, and the specific refactoring technique to fix it. Language-agnostic.
```

**Simple wrapper** (prose is fine):
```
Connects via Slack MCP server to search messages, list channels, read threads, and pull conversation history into context. No local server to install — authenticates through Slack's OAuth flow.
```
