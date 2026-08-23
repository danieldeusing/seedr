import type { CodingAgent, ComponentType } from "@seedr/shared";

/**
 * Maps content types to the coding agents that support them.
 *
 * Skills are cross-platform. MCP servers are supported for every agent whose
 * configuration format could be verified against primary documentation:
 * Claude Code (`.mcp.json` / `~/.claude.json`), Codex (`config.toml`), Gemini
 * CLI (`settings.json`) and OpenCode (`opencode.json`). GitHub Copilot is
 * deliberately absent from `mcp` — its MCP configuration could not be
 * verified, and writing Claude's schema into a Copilot file is worse than
 * refusing (see `MCP_UNSUPPORTED_REASONS`). Everything else is Claude-only.
 */
export const AGENT_COMPATIBILITY: Record<ComponentType, CodingAgent[]> = {
  skill: ["claude", "copilot", "gemini", "codex", "opencode"],
  command: ["claude"],
  agent: ["claude"],
  hook: ["claude"],
  plugin: ["claude"],
  settings: ["claude"],
  mcp: ["claude", "gemini", "codex", "opencode"],
};

/** Why a type/agent pair is refused, when there is more to say than "not supported". */
export const MCP_UNSUPPORTED_REASONS: Partial<Record<CodingAgent, string>> = {
  copilot:
    "GitHub Copilot's MCP configuration format could not be verified against primary documentation, so seedr does not write it",
};

/**
 * Check if a content type is supported by a specific agent.
 */
export function isTypeSupported(type: ComponentType, agent: CodingAgent): boolean {
  return AGENT_COMPATIBILITY[type].includes(agent);
}

/**
 * Get all agents that support a given content type.
 */
export function getCompatibleAgents(type: ComponentType): CodingAgent[] {
  return AGENT_COMPATIBILITY[type];
}

/**
 * Filter agents to only those that support the given content type.
 */
export function filterCompatibleAgents(
  type: ComponentType,
  agents: CodingAgent[]
): CodingAgent[] {
  const compatible = AGENT_COMPATIBILITY[type];
  return agents.filter((a) => compatible.includes(a));
}

/**
 * Explain why an agent cannot take a content type: a specific reason when one
 * is recorded, otherwise a generic one.
 */
export function describeIncompatibility(type: ComponentType, agent: CodingAgent): string {
  if (type === "mcp" && MCP_UNSUPPORTED_REASONS[agent]) {
    return MCP_UNSUPPORTED_REASONS[agent]!;
  }
  return `${agent} does not support ${type} content`;
}
