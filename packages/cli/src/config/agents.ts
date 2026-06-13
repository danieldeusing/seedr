import { homedir } from "node:os";
import { join } from "node:path";
import type { CodingAgentConfig, InstallScope, ContentTypeConfig } from "../types.js";
import type { CodingAgent, ComponentType } from "@seedr/shared";

const home = homedir();

export const CODING_AGENTS: Record<CodingAgent, CodingAgentConfig> = {
  claude: {
    name: "Claude Code",
    shortName: "claude",
    projectRoot: ".claude",
    userRoot: join(home, ".claude"),
    contentTypes: {
      skill: {
        path: "skills",
        extension: ".md",
        structure: "directory",
        mainFile: "SKILL.md",
      },
      command: {
        path: "commands",
        extension: ".md",
        structure: "directory",
        mainFile: "COMMAND.md",
      },
      agent: {
        path: "agents",
        extension: ".md",
        structure: "file",
      },
      hook: {
        path: "",
        extension: ".json",
        structure: "json-merge",
        mergeTarget: "settings.json",
        mergeField: "hooks",
      },
      plugin: {
        path: "plugins/cache",
        extension: "",
        structure: "plugin",
      },
      settings: {
        path: "",
        extension: ".json",
        structure: "json-merge",
        mergeTarget: "settings.json",
      },
      mcp: {
        path: "",
        extension: ".json",
        structure: "json-merge",
        mergeTarget: ".mcp.json",
        mergeField: "mcpServers",
      },
    },
  },
  copilot: {
    name: "GitHub Copilot",
    shortName: "copilot",
    projectRoot: ".github",
    userRoot: join(home, ".github"),
    contentTypes: {
      skill: {
        path: "skills",
        extension: ".md",
        structure: "directory",
        mainFile: "SKILL.md",
      },
    },
  },
  gemini: {
    name: "Gemini Code Assist",
    shortName: "gemini",
    projectRoot: ".gemini",
    userRoot: join(home, ".gemini"),
    contentTypes: {
      skill: {
        path: "skills",
        extension: ".md",
        structure: "directory",
        mainFile: "SKILL.md",
      },
    },
  },
  codex: {
    name: "OpenAI Codex CLI",
    shortName: "codex",
    projectRoot: ".codex",
    userRoot: join(home, ".codex"),
    contentTypes: {
      skill: {
        path: "skills",
        extension: ".md",
        structure: "directory",
        mainFile: "SKILL.md",
      },
    },
  },
  opencode: {
    name: "OpenCode",
    shortName: "opencode",
    projectRoot: ".opencode",
    userRoot: join(home, ".opencode"),
    contentTypes: {
      skill: {
        path: "skills",
        extension: ".md",
        structure: "directory",
        mainFile: "SKILL.md",
      },
    },
  },
};

export const ALL_AGENTS = Object.keys(CODING_AGENTS) as CodingAgent[];

export function getAgentConfig(agent: CodingAgent): CodingAgentConfig {
  return CODING_AGENTS[agent];
}

/**
 * Get the content type configuration for an agent/type combination.
 * Returns undefined if the agent doesn't support that content type.
 */
export function getContentTypeConfig(
  agent: CodingAgent,
  type: ComponentType
): ContentTypeConfig | undefined {
  return CODING_AGENTS[agent].contentTypes[type];
}

/**
 * Get the root path for an agent based on scope.
 */
export function getAgentRoot(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): string {
  const config = CODING_AGENTS[agent];
  switch (scope) {
    case "project":
    case "local":
      return join(cwd, config.projectRoot);
    case "user":
      return config.userRoot;
  }
}

/**
 * Get the full path for installing content of a given type.
 */
export function getContentPath(
  agent: CodingAgent,
  type: ComponentType,
  scope: InstallScope,
  cwd: string = process.cwd()
): string | undefined {
  const typeConfig = getContentTypeConfig(agent, type);
  if (!typeConfig) return undefined;

  const root = getAgentRoot(agent, scope, cwd);
  return typeConfig.path ? join(root, typeConfig.path) : root;
}

/**
 * Get the settings.json path for a given scope.
 */
export function getSettingsPath(
  scope: InstallScope,
  cwd: string = process.cwd()
): string {
  switch (scope) {
    case "project":
      return join(cwd, ".claude/settings.json");
    case "user":
      return join(home, ".claude/settings.json");
    case "local":
      return join(cwd, ".claude/settings.local.json");
  }
}

/**
 * Get the MCP config path for a given scope.
 */
export function getMcpPath(
  scope: InstallScope,
  cwd: string = process.cwd()
): string {
  switch (scope) {
    case "project":
    case "local":
      return join(cwd, ".mcp.json");
    case "user":
      return join(home, ".claude.json");
  }
}

// Legacy compatibility - will be removed
export function getAgentPath(
  agent: CodingAgent,
  scope: "project" | "user",
  cwd: string = process.cwd()
): string {
  return getContentPath(agent, "skill", scope, cwd) || "";
}
