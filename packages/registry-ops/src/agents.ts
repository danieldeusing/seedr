import type { CanonicalCodingAgent, CodingAgent, ComponentType, LegacyCodingAgent } from "@seedr/shared";

/**
 * The one runtime vocabulary of coding-agent identifiers (plan §5). Everything
 * that parses, validates or matches an agent id goes through here, so the
 * staged `gemini` → `antigravity` rollout is a change to this file and the data,
 * not a grep across the repo.
 */
export const CANONICAL_AGENTS = ["claude", "copilot", "antigravity", "codex", "opencode"] as const satisfies readonly CanonicalCodingAgent[];

/** Deprecated ids and what they mean now. Accepted on input and in data; never written by new code. */
export const AGENT_ALIASES: Record<LegacyCodingAgent, CanonicalCodingAgent> = { gemini: "antigravity" };

/** Every id a registry item or a CLI flag may carry: canonical plus the aliases. */
export const KNOWN_AGENTS = [...CANONICAL_AGENTS, ...(Object.keys(AGENT_ALIASES) as LegacyCodingAgent[])] as const;

/** Display names, kept beside the ids so every surface prints the same one. */
export const AGENT_LABELS: Record<CanonicalCodingAgent, string> = {
  claude: "Claude Code",
  copilot: "GitHub Copilot",
  antigravity: "Google Antigravity",
  codex: "OpenAI Codex",
  opencode: "OpenCode",
};

export function isCanonicalAgent(value: unknown): value is CanonicalCodingAgent {
  return typeof value === "string" && (CANONICAL_AGENTS as readonly string[]).includes(value);
}

export function isLegacyAgent(value: unknown): value is LegacyCodingAgent {
  return typeof value === "string" && Object.hasOwn(AGENT_ALIASES, value);
}

/**
 * What registry DATA may carry that the canonical vocabulary would not write.
 * Empty since 2026-08-25: the published CLI understands `antigravity` (0.1.88
 * carries the canonical list and resolves `gemini`), so the data was migrated
 * and writers now store the canonical id. `gemini` stays an accepted alias in
 * AGENT_ALIASES — old data and old flags still resolve — but nothing writes it.
 */
export const STORAGE_ALIASES: Partial<Record<CanonicalCodingAgent, LegacyCodingAgent>> = {};

/** The canonical, deduplicated agent list downgraded to the ids data may store during B1. */
export function storageAgents(values: readonly unknown[]): CodingAgent[] {
  return canonicalAgents(values).map((agent) => STORAGE_ALIASES[agent] ?? agent);
}

/** The canonical id for any known id (alias resolved), or null for an unknown one. */
export function canonicalAgent(value: unknown): CanonicalCodingAgent | null {
  if (isCanonicalAgent(value)) return value;
  if (isLegacyAgent(value)) return AGENT_ALIASES[value];
  return null;
}

/** Canonicalise a list, dropping unknown ids and duplicates, in canonical order. */
export function canonicalAgents(values: readonly unknown[]): CanonicalCodingAgent[] {
  const present = new Set(values.map(canonicalAgent).filter((a): a is CanonicalCodingAgent => a !== null));
  return CANONICAL_AGENTS.filter((a) => present.has(a));
}


/**
 * Which agents can hold each content type — the CLI's real capability, not what
 * an item happens to declare.
 *
 * It lives here rather than in the CLI because the registry has to reconcile
 * every item's own `compatibility` against it. When the two drift, the item
 * wins and the capability is unreachable: five working plugin stores were
 * reachable through one catalogue item for exactly that reason.
 *
 * A format appears here only once it has been verified against the real tool.
 * See `docs/verification.md` and the per-agent stores in the CLI.
 */
export const AGENT_COMPATIBILITY: Record<ComponentType, CanonicalCodingAgent[]> = {
  skill: ["claude", "copilot", "antigravity", "codex", "opencode"],
  command: ["claude"],
  // Copilot's subagent files carry the same name/description frontmatter.
  // OpenCode's do not — theirs use `mode` and a `tools` map — so porting there
  // needs a frontmatter translation, not a path.
  agent: ["claude", "copilot"],
  hook: ["claude"],
  plugin: ["claude", "copilot", "antigravity", "codex", "opencode"],
  settings: ["claude"],
  mcp: ["claude", "codex", "opencode", "copilot"],
  rule: ["claude", "copilot", "antigravity", "codex", "opencode"],
};

/** Whether one agent can hold one content type. Aliases resolve first. */
export function isTypeSupported(type: ComponentType, agent: CodingAgent): boolean {
  const canonical = canonicalAgent(agent);
  return canonical !== null && AGENT_COMPATIBILITY[type].includes(canonical);
}

/** Every agent that can hold this content type. */
export function getCompatibleAgents(type: ComponentType): CanonicalCodingAgent[] {
  return [...AGENT_COMPATIBILITY[type]];
}

/**
 * Agents this particular item can never reach, whatever the capability table
 * says, because of what the item itself is.
 *
 * One rule so far: OpenCode resolves a plugin from a git spec, and an
 * npm-style spec has no subpath. A plugin whose content is a subdirectory of a
 * marketplace monorepo therefore cannot be named at all — the repository root
 * is a different module. Declaring OpenCode for one would be a promise the CLI
 * has to break at install time.
 */
export function structurallyImpossibleAgents(item: {
  type: ComponentType;
  pluginSource?: { path?: string };
}): CanonicalCodingAgent[] {
  if (item.type === "plugin" && item.pluginSource?.path) return ["opencode"];
  return [];
}

/**
 * Agents the CLI could install this item for, but which the item does not
 * declare. Non-empty means the item is narrower than the tooling — sometimes
 * deliberate, often just stale.
 *
 * Agents the item structurally cannot reach are not counted: they are a fact
 * about the item, not a gap in its declaration.
 */
export function unclaimedAgents(item: {
  type: ComponentType;
  compatibility: readonly string[];
  pluginSource?: { path?: string };
}): CanonicalCodingAgent[] {
  const declared = new Set(canonicalAgents(item.compatibility));
  const impossible = new Set(structurallyImpossibleAgents(item));
  return getCompatibleAgents(item.type).filter(
    (agent) => !declared.has(agent) && !impossible.has(agent)
  );
}
