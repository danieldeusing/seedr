# Verifying a format before seedr writes it

`AGENT_COMPATIBILITY` in `packages/registry-ops/src/agents.ts` lists a
`(capability, agent)` pair only once the destination has been **verified against
the real tool**. This file is the record of how each one was established, so the
claim in that table is checkable rather than asserted.

The rule exists because the failure it prevents is silent. A file written to a
directory nothing reads produces no error: the install reports success, the plan
looks right, and the capability simply does not work. Four defects of exactly
that shape were found in this codebase after being introduced from documentation
alone.

## The method

Install with the real CLI into an isolated `HOME`, then diff the tree.

```bash
PROBE=$(mktemp -d)
HOME="$PROBE" <cli> <install command>
find "$PROBE" -type f | sed "s|$PROBE||" | sort
```

An isolated `HOME` matters for two reasons: the developer's own configuration is
never touched, and a directory that already exists cannot be mistaken for one the
tool created. Where a tool offers a validator, prefer it — it answers what the
tool *accepts*, not merely what it writes.

Reading the vendor documentation is where a verification starts, never where it
ends. Documentation describes intent; the binary describes behaviour, and the two
disagree often enough that the table treats only the second as evidence.

## What "verified" does not cover

Observing where a tool **writes** does not establish what it **reads**. The two
are different questions and have had different answers here:

- `agy plugin install` writes `~/.gemini/config/plugins/<name>/`, which made that
  path look established. It also requires a `plugin.json` at the plugin root
  before it will recognise anything there — `agy plugin validate` answers
  `missing plugin.json` for a tree carrying only `.claude-plugin/plugin.json`.
  Plugins installed from the write-path observation alone were invisible to the
  tool that had just demonstrated the path.
- Copilot reads `.mcp.json` **and** `.github/mcp.json`, but as a precedence list:
  the first that exists per directory wins. Writing the second while the first
  existed was silently discarded.

So a destination is verified when the tool has been shown to *load* from it, not
when it has been seen to write there.

## The record

| capability | agent | destination | how it was established |
|---|---|---|---|
| plugin | claude | `~/.claude/plugins/{cache,marketplaces}`, `installed_plugins.json`, settings `enabledPlugins` | isolated-`HOME` install, tree diff |
| plugin | copilot | `~/.copilot/settings.json` (`extraKnownMarketplaces`, `enabledPlugins`), `installed-plugins/<mp>/<name>/` | `copilot plugin marketplace add` + `install`, tree diff |
| plugin | codex | `~/.codex/config.toml` (`[marketplaces.…]`, `[plugins."…"]`), `plugins/cache/<mp>/<name>/<version>/` | `config.toml` inspection; the `<version>` level read off real cache entries |
| plugin | opencode | `opencode.json` → `plugin: ["name@git+<url>#<sha>"]`, no tree | OpenCode's own loader (`Npm.add` → `exports["./server"]` or `main`); both shipped plugins set `main` to their `.opencode/plugins/*.js` |
| plugin | antigravity | `~/.gemini/config/plugins/<name>/` with a root `plugin.json`; `import_manifest.json` | `agy plugin install` diff, then `agy plugin validate` for the marker |
| mcp | claude | `.mcp.json` / resolved user JSON file | primary documentation |
| mcp | codex · opencode | `config.toml` / `opencode.json` | primary documentation |
| mcp | copilot | `.mcp.json` (project, shared) / `~/.copilot/mcp-config.json` | `copilot mcp --help` plus a populated config on a real machine |
| agent | copilot | `agents/<slug>.agent.md` | real subagent files on disk; same `name`/`description` frontmatter Claude uses |
| rule | claude · antigravity | `.claude/rules/`, `.agents/rules/` | vendor documentation, corroborated by configr's independent scanner |
| rule | copilot | `.github/instructions/<slug>.instructions.md` | documented loader; the suffix is load-bearing |
| rule | codex · opencode | a marked section in `AGENTS.md` | documented `AGENTS.md` walks; **not** `~/.codex/rules/`, which is Starlark policy |

## Refused, and why

A pair is left out when the format has not been observed. Refusing is the
honest answer; guessing produces the silent failure this file exists to prevent.

- **MCP for antigravity.** `~/.gemini/config/mcp_config.json` is documented by
  name, but the file is empty on every machine checked and the shipped manual
  omits the workspace path, so the schema has never been seen.
- **Subagents for opencode.** OpenCode has a subagent directory and files in it,
  but its frontmatter is a different schema — `mode`, and `tools` as a map, where
  Claude's is a name and a comma list. Porting needs a translation, which is a
  feature rather than a path.
- **Subagents for codex and antigravity.** No subagent file has been observed.
- **Hooks beyond claude.** Copilot has a hooks directory; the Codex and
  Antigravity formats have not been established.

## Keeping it true

`scripts/check-compatibility.ts` reports items declaring fewer agents than the
CLI supports. It is a report rather than a gate: a narrow item is often
deliberate, and widening one is a judgement about what its content actually
contains, not a mechanical edit.
