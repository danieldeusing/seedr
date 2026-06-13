import type { CodingAgent, ComponentType } from "@seedr/shared";

/**
 * Maps content types to the coding agents that support them.
 * Skills and MCP are cross-platform, everything else is Claude-only.
 */
export const AGENT_COMPATIBILITY: Record<ComponentType, CodingAgent[]> = {
  skill: ["claude", "copilot", "gemini", "codex", "opencode"],
  command: ["claude"],
  agent: ["claude"],
  hook: ["claude"],
  plugin: ["claude"],
  settings: ["claude"],
  mcp: ["claude", "copilot", "gemini", "codex", "opencode"],
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
