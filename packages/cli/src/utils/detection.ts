import { exists } from "./fs.js";
import { CODING_AGENTS, ALL_AGENTS, getAgentPath } from "../config/agents.js";
import type { CodingAgent, InstallScope } from "../types.js";

export interface DetectedAgent {
  agent: CodingAgent;
  scope: InstallScope;
  path: string;
}

export async function detectInstalledAgents(
  cwd: string = process.cwd()
): Promise<DetectedAgent[]> {
  const checks = ALL_AGENTS.flatMap((agent) => {
    const projectPath = getAgentPath(agent, "project", cwd);
    const userPath = getAgentPath(agent, "user", cwd);
    return [
      exists(projectPath).then((found): DetectedAgent | null => found ? { agent, scope: "project", path: projectPath } : null),
      exists(userPath).then((found): DetectedAgent | null => found ? { agent, scope: "user", path: userPath } : null),
    ];
  });
  const results = await Promise.all(checks);
  return results.filter((r): r is DetectedAgent => r !== null);
}

export async function detectProjectAgents(
  cwd: string = process.cwd()
): Promise<CodingAgent[]> {
  const checks = ALL_AGENTS.map(async (agent) => {
    const projectPath = getAgentPath(agent, "project", cwd);
    return (await exists(projectPath)) ? agent : null;
  });
  const results = await Promise.all(checks);
  return results.filter((a): a is CodingAgent => a !== null);
}

export async function isAgentInstalled(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  // getAgentPath only supports project and user scopes
  // local scope uses same path as project for skill detection
  const effectiveScope = scope === "local" ? "project" : scope;
  const path = getAgentPath(agent, effectiveScope, cwd);
  return exists(path);
}

export function getAgentDisplayName(agent: CodingAgent): string {
  return CODING_AGENTS[agent].name;
}

export function parseAgentArg(arg: string): CodingAgent | null {
  const normalized = arg.toLowerCase().trim();

  // Direct match
  if (ALL_AGENTS.includes(normalized as CodingAgent)) {
    return normalized as CodingAgent;
  }

  // Alias matching
  const aliases: Record<string, CodingAgent> = {
    "claude-code": "claude",
    claudecode: "claude",
    cc: "claude",
    "github-copilot": "copilot",
    gh: "copilot",
    "gemini-code": "gemini",
    gca: "gemini",
    "openai-codex": "codex",
    oc: "opencode",
  };

  return aliases[normalized] ?? null;
}

export function parseAgentsArg(agents: string, allAgents: CodingAgent[]): CodingAgent[] {
  if (agents === "all") {
    return allAgents;
  }
  return agents
    .split(",")
    .map((a) => parseAgentArg(a.trim()))
    .filter((a): a is CodingAgent => a !== null);
}
