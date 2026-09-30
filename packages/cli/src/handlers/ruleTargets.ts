import { homedir } from "node:os";
import { join } from "node:path";
import type { CodingAgent, InstallScope } from "../types.js";
import {
  claudeUserRoot,
  codexUserRoot,
  copilotUserRoot,
  openCodeUserConfigDir,
  CODING_AGENTS,
} from "../config/agents.js";
import { isTypeSupported } from "../config/compatibility.js";

const home = homedir();

/**
 * How one agent takes a rule — a small, standing instruction the agent reads on
 * every turn.
 *
 * The word "rule" is not portable, which is the whole difficulty. Three agents
 * have a directory of markdown rule files and take one file each. Two have no
 * such directory and read a project instruction file instead, so their rule is
 * a marked section merged into `AGENTS.md`.
 *
 * Codex is the trap: it HAS a `rules/` directory, and that directory is not
 * prose. `$CODEX_HOME/rules/*.starlark` holds sandbox policy — `prefix_rule`,
 * `network_rule`, `host_executable` — governing shell commands and network
 * access. Writing a markdown rule there would be silently wrong, so Codex is
 * routed to `AGENTS.md` with everything else that has no prose rules directory.
 */
export type RuleTarget =
  | {
      kind: "file";
      /** Directory the rule file is written into. */
      dir: (scope: InstallScope, cwd: string) => string;
      /** File name for a slug — Copilot's loader requires the `.instructions.md` suffix. */
      fileName: (slug: string) => string;
      /** Whether YAML frontmatter (e.g. Copilot's `applyTo`) survives the write. */
      keepsFrontmatter: boolean;
      /** The frontmatter key this agent reads a rule's path scope from. */
      scopeKey: ScopeKey;
    }
  | {
      kind: "section";
      /** The shared instruction file the rule is merged into as a marked block. */
      file: (scope: InstallScope, cwd: string) => string;
    };

/**
 * One idea, three spellings: the globs a rule's body is scoped to. Copilot reads
 * `applyTo` (one comma-separated string), Claude Code `paths` (a list), and
 * Antigravity `glob` (configr's scanner documents all three).
 */
export type ScopeKey = "applyTo" | "paths" | "glob";

const markdownFile = (slug: string): string => `${slug}.md`;

/**
 * Claude Code — `.claude/rules/**\/*.md`, read recursively and at every ancestor
 * level, not only the project root.
 */
const claudeTarget: RuleTarget = {
  kind: "file",
  dir: (scope, cwd) => join(scope === "user" ? claudeUserRoot() : join(cwd, ".claude"), "rules"),
  fileName: markdownFile,
  keepsFrontmatter: true,
  scopeKey: "paths",
};

/**
 * Antigravity — `.agents/rules/*.md` in the project, `~/.gemini/config/rules/`
 * personally. Rule files carry trigger globs and a 12,000-character limit, and
 * are deduplicated by resolved path.
 */
const antigravityTarget: RuleTarget = {
  kind: "file",
  dir: (scope, cwd) =>
    join(scope === "user" ? join(home, ".gemini", "config") : join(cwd, ".agents"), "rules"),
  fileName: markdownFile,
  keepsFrontmatter: true,
  scopeKey: "glob",
};

/**
 * Copilot — `.github/instructions/*.instructions.md`, markdown with optional
 * YAML `applyTo`. The suffix is part of the contract: a plain `.md` in that
 * directory is not loaded.
 */
const copilotTarget: RuleTarget = {
  kind: "file",
  dir: (scope, cwd) =>
    join(scope === "user" ? copilotUserRoot() : join(cwd, ".github"), "instructions"),
  fileName: (slug) => `${slug}.instructions.md`,
  keepsFrontmatter: true,
  scopeKey: "applyTo",
};

/**
 * Codex — `AGENTS.md` collected from the project root down to cwd, plus
 * `$CODEX_HOME/AGENTS.md` as a global prefix. NOT `~/.codex/rules/`, which is
 * Starlark policy.
 */
const codexTarget: RuleTarget = {
  kind: "section",
  file: (scope, cwd) => (scope === "user" ? join(codexUserRoot(), "AGENTS.md") : join(cwd, "AGENTS.md")),
};

/**
 * OpenCode — every `AGENTS.md` from cwd through the worktree; `CLAUDE.md` is
 * consulted only when no `AGENTS.md` exists anywhere in that range, so writing
 * `AGENTS.md` is always the load-bearing choice. The global candidate lives in
 * the effective config directory, where `opencode.json` already does.
 */
const openCodeTarget: RuleTarget = {
  kind: "section",
  file: (scope, cwd) =>
    scope === "user" ? join(openCodeUserConfigDir(), "AGENTS.md") : join(cwd, "AGENTS.md"),
};

const TARGETS: Partial<Record<CodingAgent, RuleTarget>> = {
  claude: claudeTarget,
  antigravity: antigravityTarget,
  copilot: copilotTarget,
  codex: codexTarget,
  opencode: openCodeTarget,
};

export function ruleTargetFor(agent: CodingAgent): RuleTarget {
  const target = TARGETS[agent];
  if (!target || !isTypeSupported("rule", agent)) {
    // `CODING_AGENTS[agent]` is undefined for an id outside the vocabulary, so
    // naming it directly crashed the guard while it was building its own message.
    throw new Error(`Rules are not supported for ${CODING_AGENTS[agent]?.name ?? agent}`);
  }
  return target;
}

/** Where a rule lands, for the plan and for the install. */
export function ruleDestination(
  agent: CodingAgent,
  slug: string,
  scope: InstallScope,
  cwd: string
): string {
  const target = ruleTargetFor(agent);
  return target.kind === "file"
    ? join(target.dir(scope, cwd), target.fileName(slug))
    : target.file(scope, cwd);
}

// ---------------------------------------------------------------------------
// Marked sections in a shared instruction file
// ---------------------------------------------------------------------------

/**
 * A rule merged into `AGENTS.md` is fenced by markers so it can be replaced and
 * removed exactly, without disturbing anything a person wrote around it.
 */
export const sectionStart = (slug: string): string => `<!-- seedr:rule:${slug} -->`;
export const sectionEnd = (slug: string): string => `<!-- /seedr:rule:${slug} -->`;

/** Everything between this rule's markers, markers included. */
function sectionPattern(slug: string): RegExp {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\n*<!-- seedr:rule:${escaped} -->[\\s\\S]*?<!-- /seedr:rule:${escaped} -->\\n*`, "g");
}

/**
 * YAML frontmatter belongs to a rule FILE — Copilot reads `applyTo` from it.
 * Pasted into the middle of `AGENTS.md` it is not frontmatter at all, just a
 * stray `---` fence, so it is dropped on the way into a section.
 */
export function stripFrontmatter(content: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
  return match ? content.slice(match[0].length) : content;
}

// ---------------------------------------------------------------------------
// Path scope
// ---------------------------------------------------------------------------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;
const SCOPE_LINE = /^(applyTo|paths|glob):(.*)$/;
const unquote = (value: string): string => value.trim().replace(/^(["'])(.*)\1$/, "$2").trim();

/** How many lines after `index` continue its value: indented lines and `- ` list items. */
function continuationLength(lines: string[], index: number): number {
  let count = 0;
  while (index + count + 1 < lines.length && /^(\s+\S|-\s)/.test(lines[index + count + 1] as string)) count++;
  return count;
}

/** Split on commas outside `{}`, so a brace glob such as `src/{a,b}.ts` stays one glob. */
function splitGlobs(value: string): string[] {
  const parts = [""];
  let depth = 0;
  for (const char of value) {
    if (char === "{") depth++;
    else if (char === "}") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) parts.push("");
    else parts[parts.length - 1] += char;
  }
  return parts;
}

/** The globs a rule's frontmatter scopes it to, in whichever agent's spelling it was written. */
export function ruleScope(content: string): string[] {
  const lines = FRONTMATTER.exec(content)?.[1]?.split(/\r?\n/) ?? [];
  for (let i = 0; i < lines.length; i++) {
    const inline = SCOPE_LINE.exec(lines[i] as string)?.[2]?.trim();
    if (inline === undefined) continue;
    const values = inline
      ? splitGlobs(inline.startsWith("[") ? inline.slice(1, -1) : unquote(inline))
      : lines.slice(i + 1, i + 1 + continuationLength(lines, i)).map((line) => line.replace(/^\s*-\s*/, ""));
    return values.map(unquote).filter((glob) => glob.length > 0);
  }
  return [];
}

/**
 * The rule with its path scope rewritten into the key this agent reads, every
 * other frontmatter line kept as written. A rule without a scope is returned as is.
 */
export function withScopeKey(content: string, key: ScopeKey): string {
  const globs = ruleScope(content);
  const match = FRONTMATTER.exec(content);
  if (globs.length === 0 || !match) return content;
  const lines = (match[1] as string).split(/\r?\n/);
  if (lines.some((line) => SCOPE_LINE.exec(line)?.[1] === key)) return content;
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (SCOPE_LINE.test(lines[i] as string)) i += continuationLength(lines, i);
    else kept.push(lines[i] as string);
  }
  const scope =
    key === "paths"
      ? ["paths:", ...globs.map((glob) => `  - ${JSON.stringify(glob)}`)]
      : [`${key}: ${JSON.stringify(globs.join(", "))}`];
  return `---\n${[...kept, ...scope].join("\n")}\n---${match[2]}${content.slice(match[0].length)}`;
}

/** The one line a section carries in place of a scope its agent cannot enforce. */
const scopeProse = (globs: readonly string[]): string =>
  `Applies to files matching ${globs.map((glob) => `\`${glob}\``).join(", ")}.`;

/** Insert or replace this rule's section, leaving the rest of the file untouched. */
export function upsertSection(document: string, slug: string, content: string): string {
  const globs = ruleScope(content);
  const body = stripFrontmatter(content).trim();
  const block = `${sectionStart(slug)}\n${globs.length > 0 ? `${scopeProse(globs)}\n\n` : ""}${body}\n${sectionEnd(slug)}`;
  const existing = sectionPattern(slug);
  if (existing.test(document)) {
    return document.replace(sectionPattern(slug), `\n\n${block}\n`);
  }
  const base = document.trimEnd();
  return base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
}

/** Remove this rule's section. Returns null when it was not there. */
export function removeSection(document: string, slug: string): string | null {
  if (!sectionPattern(slug).test(document)) return null;
  const stripped = document.replace(sectionPattern(slug), "\n\n").trimEnd();
  return stripped.length > 0 ? `${stripped}\n` : "";
}

/** Every rule slug this document currently carries. */
export function listSections(document: string): string[] {
  return [...document.matchAll(/<!-- seedr:rule:([^\s>]+) -->/g)].map((match) => match[1] as string);
}
