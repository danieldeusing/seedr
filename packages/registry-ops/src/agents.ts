import type { CanonicalCodingAgent, CodingAgent, LegacyCodingAgent } from "@seedr/shared";

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
 * B1 (plan §5): what registry DATA may carry today. The published CLI (0.1.87)
 * reads `main` live and crashes on ids it does not know, so every writer stores
 * `gemini`, never `antigravity`, until a CLI that understands both has shipped.
 * B2 is one flip: run scripts/migrate-agent-ids.ts and empty this table.
 */
export const STORAGE_ALIASES: Partial<Record<CanonicalCodingAgent, LegacyCodingAgent>> = { antigravity: "gemini" };

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

