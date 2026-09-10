# Checking OpenCode compatibility

`AGENT_COMPATIBILITY` in `packages/registry-ops/src/agents.ts` says which agents
can hold each *type* of content at all (see
[verification.md](../../docs/verification.md) for how that table was
established). OpenCode is the one agent on that list whose real support still
has to be checked **per item**, not just per type, because of how its plugin
system actually works. Do this check whenever `/add-community` or `/add-seedr`
asks the compatibility question, and whenever an existing item's compatibility
looks stale.

## Plugins — verify, never assume

A Claude Code plugin (skills, hooks, agents, commands bundled together) and an
OpenCode plugin are unrelated formats. OpenCode loads a plugin as a JavaScript
module (`Npm.add`, resolving `main` or `exports["./server"]`) — it does not
read `.claude-plugin/plugin.json` or unpack the bundle the way Claude and
Copilot do. Nearly every plugin in the registry only ships the Claude bundle,
so **most plugins have nothing OpenCode can load, regardless of what they wrap**.
Selecting "All" in the compatibility question must never include `opencode`
for a plugin without this check.

A plugin is OpenCode-compatible only when its repository ships both halves:

1. A `.opencode/plugins/<name>.{js,ts,mjs,cjs}` file — the entry point.
2. A root `package.json` whose `main` (or `exports["./server"]`) points at it.

Check both, at the pinned revision:

```bash
# from the item's pluginSource.url + sha (or pin's sourceRevision)
curl -s "https://raw.githubusercontent.com/<owner>/<repo>/<sha>/package.json" | jq -r '.main, .exports["./server"]'
```

The result must name a path under `.opencode/plugins/`. A `.opencode/` directory
with no `main` pointing at it (some repos ship one but install it their own
way, via a `sync:opencode` script or similar) is not enough — seedr's install
writes a `git+<url>#<sha>` module spec into `opencode.json`, and OpenCode
resolves that spec exactly as `npm install` would: no `main`, nothing loads.

A **first-party** plugin (no repository, content lives in this registry) is
different: seedr copies its tree to `~/.config/opencode/plugins/<name>/` and
points `opencode.json` at that directory, so it works without any of the
above — the copy IS the entry point.

A **subdirectory plugin** (`pluginSource.path` set — most marketplace entries,
since they live in a monorepo) can never get an OpenCode git spec at all: that
form has no way to name a subpath. Refuse it outright, don't mark it.

## Skills, MCP servers, rules — safe by default, but read the content first

These three types are structurally portable: a skill is a `SKILL.md` read from
the shared `.agents/skills/` directory, an MCP server is a command/URL config
entry, and a rule is a marked section of `AGENTS.md` — none of it is
Claude-specific machinery. Marking `opencode` for one of these is the default,
**unless the content itself is tied to Claude Code internals** — instructs
editing `CLAUDE.md` or `.claude/` paths, documents Claude's own subagent
frontmatter, or invokes the `claude` CLI as part of the procedure. Read the
skill body (not just its `description`) before deciding; four first-party
skills in this registry are deliberately Claude-only for exactly this reason
(`agent-creator`, `claude-memory-doctor`, `reflection`, `skill-creator`).

## Agents, hooks, commands, settings — never

`AGENT_COMPATIBILITY` has no OpenCode entry for these types at all: OpenCode's
subagent frontmatter is a different schema (`mode`, a `tools` map) that needs a
translation rather than a copy, and no hook, command or settings format for it
has been observed. Do not add `opencode` to an item of these types — there is
nowhere for the CLI to install it.
