import { homedir } from "node:os";
import { join } from "node:path";
import type { CodingAgent, InstallScope } from "../types.js";
import { canonicalAgent } from "@seedr/registry-ops/pure";
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
    }
  | {
      kind: "section";
      /** The shared instruction file the rule is merged into as a marked block. */
      file: (scope: InstallScope, cwd: string) => string;
    };

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
  gemini: antigravityTarget,
  copilot: copilotTarget,
  codex: codexTarget,
  opencode: openCodeTarget,
};

export function ruleTargetFor(agent: CodingAgent): RuleTarget {
  const target = TARGETS[canonicalAgent(agent) ?? agent];
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

/** Insert or replace this rule's section, leaving the rest of the file untouched. */
export function upsertSection(document: string, slug: string, content: string): string {
  const block = `${sectionStart(slug)}\n${stripFrontmatter(content).trim()}\n${sectionEnd(slug)}`;
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
