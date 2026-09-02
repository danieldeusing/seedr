import {
  AGENT_COMPATIBILITY,
  canonicalAgent,
  canonicalAgents,
} from "@seedr/registry-ops/pure";
import type { CanonicalCodingAgent, CodingAgent, ComponentType } from "@seedr/shared";

/**
 * The capability table itself lives in `@seedr/registry-ops` so the registry,
 * the compile step and Studio can reconcile items against the same definition.
 * This module is the CLI's front door onto it, plus the wording the CLI uses
 * when a pair is refused.
 */
export {
  AGENT_COMPATIBILITY,
  isTypeSupported,
  getCompatibleAgents,
  unclaimedAgents,
} from "@seedr/registry-ops/pure";

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
  antigravity:
    "Google Antigravity's MCP file name is documented but its schema has never been observed — the file is empty on every machine checked — so seedr does not guess at it",
};

/** A sentence explaining why `agent` cannot take `type` content. */
export function describeIncompatibility(type: ComponentType, agent: CodingAgent): string {
  const canonical = canonicalAgent(agent);
  if (type === "mcp" && canonical !== null && MCP_UNSUPPORTED_REASONS[canonical]) {
    return MCP_UNSUPPORTED_REASONS[canonical];
  }
  return `${canonical ?? agent} does not support ${type} content`;
}
