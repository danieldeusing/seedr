# Capability gap backlog — seedr and configr

Sources: `docs/coding-agents/cross-tool-matrix.html` (rows cited by first cell); the three `conformance-*.md` audits (ids prefixed `CC-` Claude, `CX-` Codex, `GH-` Copilot, `AG-` Antigravity, `OC-` OpenCode, `XT-` cross-tool); `packages/registry-ops/src/{agents,paths}.ts`; configr `scanner/`. Agents: **C** Claude, **X** Codex, **G** Copilot, **A** Antigravity, **O** OpenCode. (d) documented deferral, TW tested-wrong, p partial.

## A. Capability classes the agents have that seedr does not model as a type

`ALL_TYPES` (`paths.ts:38`): skill, plugin, hook, agent, mcp, settings, command, rule. Rules directories are modelled (`rule` → all five, `agents.ts:85`).

| Class | Matrix row | Agents | configr |
|---|---|---|---|
| Project instruction files | "Repository-root AGENTS.md", "Repository / nested CLAUDE.md", "… GEMINI.md", ".github/copilot-instructions.md" | AGENTS.md X G A O; CLAUDE.md C G O; GEMINI.md G A; copilot-instructions G | `instruction` type (`instructions.rs:39`). seedr only merges a `rule` into `AGENTS.md` for X/O (`ruleTargets.ts:87-105`) |
| Output styles | ".claude/output-styles/*.md" | C | No — CC-C70 |
| Workflows | ".claude/workflows/*.js"; "Antigravity workflow files" (U-03) | C; A (dir unpublished) | C no (CC-C70); A emitted as `command`, verdict `Unknown` (`antigravity.rs:315`) |
| Routines, `loop.md` | "Claude routines/", ".claude/loop.md" | C | No — CC-C70 |
| LSP servers | "Language-server registry" | C (plugin), G (`.github/lsp.json`, `lsp-config.json`), O (`lsp` key) | No — GH-C13, C19, C34 |
| Apps | "What an enabled plugin may contribute" (Codex) | X | no row |
| Themes | "Terminal colour themes" | C, O | No — OC-O14, O118 |
| Channels, monitors, `bin/` | "What an enabled plugin may contribute" (Claude) | C | no row |
| Sidecars | "Antigravity sidecars/<id>/sidecar.json" | A | No — AG-A77 |
| Plugin marketplaces | "Marketplace catalog paths" | C X G (RW); A (S-only) | C yes (`plugins/marketplaces`); X no (CX-X58, X59); G no (GH-C84, C85) |
| Extensions / tool modules | "Custom tool modules on disk" | G (`.github/extensions/`), O (`{tool,tools}/*.{js,ts}`) | No — GH-C87, OC-O101, O102 |
| Execution-policy rules (Starlark) | "Execution-policy rule files" | X | Yes, as `rule` (`codex.rs:459`); seedr excludes on purpose (`ruleTargets.ts:25-29`) |
| Declared-source registries | "Declared-source registries" | A | Tier not modelled — AG-A35 |
| Keybindings, status line | "Keybindings", "Status line" | C A O; G (statusLine) | No — GH-C92, AG-A80 |

## B. Types seedr models but cannot install on every agent that supports them

`AGENT_COMPATIBILITY` (`agents.ts:74-86`): command → C; agent → C G; hook → C; settings → C; mcp → C X O G. Verdicts: `docs/verification.md` "Refused, and why"; OpenCode audit §7. hook / O is rightly excluded ("Hook registry": no hooks surface).

| Type / agent | Matrix evidence | Verdict |
|---|---|---|
| command / O | "OpenCode {command,commands}/**/*.md and the inline command map" — R · D/S | §7 "seedr / {command…} / opencode closed" |
| command / G | ".claude/commands/*.md" — D (claimed, not proven); "Plugin-supplied commands/" — B:R | none |
| agent / X | ".codex/agents/**/*.toml …" — R · S, TOML | Refused: no file observed |
| agent / A | ".agents/agents/<name>.md or <name>/agent.md" — R · S | Refused: no file observed |
| agent / O | "OpenCode {agent,agents}/**/*.md" — R · S | Refused: `mode` + `tools` map need translation (`agents.ts:77-79`) |
| hook / X | "Project- or user-level hooks.json" — R · S; 11 events | Refused: format not established |
| hook / G | same — R · D/S/O (`.github/hooks/*.json`, `~/.copilot/hooks/**/*.json`); 15 events | Refused: not established |
| hook / A | same — R · D/S (three `hooks.json` locations); 5 events | Refused: not established |
| mcp / A | "User-scope MCP file" — R · D/S (`~/.gemini/config/mcp_config.json`); project path D only | Refused: schema never seen; configr parses it (`antigravity_mcp.rs:201`) |
| settings / X | "Primary settings files" — RW `config.toml` | none; install audit: "no … settings" |
| settings / G | same — RW `settings.json`, 14 repo keys | none |
| settings / A | same — RW `config.json` + `settings.json` | none |
| settings / O | same — RW `opencode.json` | none |

## C. Audit rows NOT-IMPLEMENTED for seedr

The audits score configr; seedr appears only in the install-path carry-over (OpenCode audit §3.6, §7; configr `docs/seedr-install-audit.md`).

- **P0-1** (X G O) — substitutes Claude for command/agent/hook/settings; configr now refuses, seedr's table unchanged.
- **P0-3** (G) — user-scope skill root `~/.github/skills`, unread; seedr now `~/.copilot` (`config/agents.ts:49`).
- **P2-3** (C) — `$CLAUDE_CONFIG_DIR` ignored; seedr reads it since 3db7ab3 (`config/agents.ts:31`).
- **U-2/U-3** (O) — user-scope skill root `~/.opencode`, not XDG; seedr now XDG (`config/agents.ts:55`).
- **§7 mcp/O cell** — wrote `.mcp.json`, unread by OpenCode; `handlers/mcp.ts:86` now writes `opencode.json`.
- **P1-6** — no install validates the agent's shape; open.
- **P2-6** — configr pins no seedr CLI version; open.

## D. Audit rows NOT-IMPLEMENTED for configr

Clustered by anchor; every NOT-IMPLEMENTED and partial id appears.

**CC** — C3 C4 C49 C58 C67 managed tiers · C6 C8 `launch.json`, `scheduled_tasks.json` · C12 C17 C18 C19 C24 C25 instruction order, `@path`, worktree, memory · C28 C31p C32 C34 C43 skill roots and rules · C38 C40 agent files · C46p C48p C50 hook contributors · C2p C5p C51p C59 config resolver, `${VAR}` · C39 C70p C73 C75 worktree fallback, 3 of 6 dirs, merge rules.

**CX** — X2 X3 X9 X61 system scope, profile, `requirements.toml`, feature gate · X6p X8p denylist, `[features]` · X10p X16 X17 root markers, fallback names, budget · X20 X22 X26 skill roots · X30 X33 agents · X38 X41 X43 hooks · X46 X47 X49 X50 MCP · X56 X57 X58 X59 X60 plugins, marketplaces · X62 X63 X64 memories, goals, sessions.

**GH** — C22 C68 MDM, policy.d · C13 C19 C34 LSP · C87 extensions · C84 C85 marketplaces · C86 plugin contents · C50 C52 skill tiers, built-ins · C51 TW-1 skill-is-directory pinned wrong · C36 C40 C41 C42 C43 C44 instructions · C57 C58 C59 C60 agents · C56(d) C102(d) remote org tier · C70 C71 hook shapes · C75(d) C77 folder trust, `--plugin-dir`, ODR · C06 skills override commands · C27 C90 C91 C92 settings keys.

**AG** — A80 A81 A82 settings files and keys · A74(d) plugin enablement · A77 sidecars · A09 built-in skills · A35 declared-source tier · A29 TW-2 `~/.agents/skills` scanned though denied · A46 A47 agents · A55p A56 A57 A58 hook handler · A68 MCP keys · A93 `.antigravityignore`.

**OC** — O05 O06 O16 O17 O19 O57 O61 O63 layers and merge · O10(d) O18(d) O41(d) O67(d) O71–O73(d) legacy rank, env dir, ceiling, loader writes · O03 V2 unlabelled · O55 O56 O58p array exceptions · O34 O35 O36 O47 instruction mechanics · O14 O15 O42 O118 O119 O120 O121 XT-X22 themes, TUI, inventories · O80 O81 O82 agents · O85p O86 O87 commands · O88p O89(TW-2) O92 O93 O94 O95 O96p O97 skills · O101 O102 tools · O106 plugins · O114 O115 MCP · O124 writers.

## E. Suggested order

1. seedr hook / G — R · D/S/O, real files on disk; small.
2. seedr command / O — R · D/S, body is a template; small.
3. seedr mcp / A — reuse configr's `antigravity_mcp.rs` shape; small.
4. configr Claude `workflows/`, `output-styles/`, `routines/` — CC-C70; small.
5. configr TW-1 (GH-C51), TW-2 (AG-A29, OC-O89); small.
6. seedr agent / O — translate `mode`/`tools` (`agents.ts:77-79`); medium.
7. seedr instruction-file type — reuse the marked-section merge (`ruleTargets.ts:145`); medium.
8. seedr hook / X and A — `hooks.json`, 11 and 5 events; medium.
9. configr Copilot LSP, extensions — GH-C13, C19, C34, C87; medium.
10. seedr agent / X (TOML) and A — blocked until a file is observed; medium.
11. configr managed tiers — CC-C3/C4/C58, CX-X2/X9, GH-C22/C68, OC-O19; large, triage S1 blocked.
12. configr OpenCode themes/TUI — OC-O14, O15, O42, O118, O119; large.
