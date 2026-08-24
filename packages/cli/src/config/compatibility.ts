import { canonicalAgent, canonicalAgents } from "@seedr/registry-ops/pure";
import type { CanonicalCodingAgent, CodingAgent, ComponentType } from "@seedr/shared";

/**
 * Maps content types to the coding agents that support them.
 * Skills are cross-platform; MCP servers are written only for agents whose
 * configuration format was verified against primary documentation (Claude,
 * Codex, OpenCode) — Copilot's and Antigravity's could not be, so they are
 * refused rather than guessed at. Everything else is Claude-only.
 * Canonical ids only; inputs are resolved through `canonicalAgent`, so the
 * deprecated `gemini` alias behaves exactly like `antigravity`.
 */
export const AGENT_COMPATIBILITY: Record<ComponentType, CanonicalCodingAgent[]> = {
  skill: ["claude", "copilot", "antigravity", "codex", "opencode"],
  command: ["claude"],
  agent: ["claude"],
  hook: ["claude"],
  plugin: ["claude"],
  settings: ["claude"],
  mcp: ["claude", "codex", "opencode"],
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
