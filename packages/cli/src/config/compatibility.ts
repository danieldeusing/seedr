import { canonicalAgent, canonicalAgents } from "@seedr/registry-ops/pure";
import type { CanonicalCodingAgent, CodingAgent, ComponentType } from "@seedr/shared";

/**
 * Maps content types to the coding agents that support them.
 * Skills are cross-platform. A format is listed only once it has been verified
 * against the real tool — never guessed at:
 *
 * - MCP servers: verified against primary documentation for Claude, Codex and
 *   OpenCode. Copilot's and Antigravity's could not be, so they are refused.
 * - Plugins: every agent here has a native plugin system, and each store's
 *   on-disk format was verified by installing into an isolated HOME and
 *   diffing the result (see `pluginStores.ts` for the per-agent layouts).
 *
 * Everything else is Claude-only. Canonical ids only; inputs are resolved
 * through `canonicalAgent`, so the deprecated `gemini` alias behaves exactly
 * like `antigravity`.
 */
export const AGENT_COMPATIBILITY: Record<ComponentType, CanonicalCodingAgent[]> = {
  skill: ["claude", "copilot", "antigravity", "codex", "opencode"],
  command: ["claude"],
  agent: ["claude"],
  hook: ["claude"],
  plugin: ["claude", "copilot", "antigravity", "codex", "opencode"],
  settings: ["claude"],
  mcp: ["claude", "codex", "opencode"],
  // Every agent reads standing instructions; only the surface differs. Three
  // take a markdown file in a rules directory, and Codex and OpenCode take a
  // marked section in AGENTS.md because neither has a prose rules directory —
  // Codex's `rules/` is Starlark sandbox policy. See `ruleTargets.ts`.
  rule: ["claude", "copilot", "antigravity", "codex", "opencode"],
};

/**
 * Check if a content type is supported by a specific agent.
 */
export function isTypeSupported(type: ComponentType, agent: CodingAgent): boolean {
  const canonical = canonicalAgent(agent);
  return canonical !== null && AGENT_COMPATIBILITY[type].includes(canonical);
}

/**
 * Get all agents that support a given content type.
 */
export function getCompatibleAgents(type: ComponentType): CodingAgent[] {
  return AGENT_COMPATIBILITY[type];
}

/**
 * Filter agents to only those that support the given content type.
 * The result is canonical: an alias in the input comes out as its canonical id.
 */
export function filterCompatibleAgents(
  type: ComponentType,
  agents: CodingAgent[]
): CodingAgent[] {
  const compatible = AGENT_COMPATIBILITY[type];
  return canonicalAgents(agents).filter((a) => compatible.includes(a));
}

/** Why a type/agent pair is refused, when there is more to say than "not supported". */
export const MCP_UNSUPPORTED_REASONS: Partial<Record<CanonicalCodingAgent, string>> = {
  copilot:
    "GitHub Copilot's MCP configuration format could not be verified against primary documentation, so seedr does not write it",
  antigravity:
    "Google Antigravity's MCP configuration format could not be verified against primary documentation, so seedr does not write it",
};

/** A sentence explaining why `agent` cannot take `type` content. */
export function describeIncompatibility(type: ComponentType, agent: CodingAgent): string {
  const canonical = canonicalAgent(agent);
  if (type === "mcp" && canonical !== null && MCP_UNSUPPORTED_REASONS[canonical]) {
    return MCP_UNSUPPORTED_REASONS[canonical];
  }
  return `${canonical ?? agent} does not support ${type} content`;
}
