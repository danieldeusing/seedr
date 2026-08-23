import { homedir } from "node:os";
import { join } from "node:path";
import type { CodingAgentConfig, InstallScope, ContentTypeConfig } from "../types.js";
import type { CodingAgent, ComponentType } from "@seedr/shared";

const home = homedir();

const SETTINGS_FILE = "settings.json";
const JSON_MERGE = "json-merge";

/** Every agent installs skills the same way: a directory holding `SKILL.md`. */
const SKILL_DIRECTORY: ContentTypeConfig = {
  path: "skills",
  extension: ".md",
  structure: "directory",
  mainFile: "SKILL.md",
};

export const CODING_AGENTS: Record<CodingAgent, CodingAgentConfig> = {
  claude: {
    name: "Claude Code",
    shortName: "claude",
    projectRoot: ".claude",
    userRoot: join(home, ".claude"),
    contentTypes: {
      skill: SKILL_DIRECTORY,
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
        structure: JSON_MERGE,
        mergeTarget: SETTINGS_FILE,
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
        structure: JSON_MERGE,
        mergeTarget: SETTINGS_FILE,
      },
      mcp: {
        path: "",
        extension: ".json",
        structure: JSON_MERGE,
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
      skill: SKILL_DIRECTORY,
    },
  },
  gemini: {
    name: "Gemini Code Assist",
    shortName: "gemini",
    projectRoot: ".gemini",
    userRoot: join(home, ".gemini"),
    contentTypes: {
      skill: SKILL_DIRECTORY,
    },
  },
  codex: {
    name: "OpenAI Codex CLI",
    shortName: "codex",
    projectRoot: ".codex",
    userRoot: join(home, ".codex"),
    contentTypes: {
      skill: SKILL_DIRECTORY,
    },
  },
  opencode: {
    name: "OpenCode",
    shortName: "opencode",
    projectRoot: ".opencode",
    userRoot: join(home, ".opencode"),
    contentTypes: {
      skill: SKILL_DIRECTORY,
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
 * Get Claude Code's MCP config path for a given scope.
 */
export function getMcpPath(
  scope: InstallScope,
  cwd: string = process.cwd()
): string {
  return getMcpConfigPath("claude", scope, cwd);
}

/**
 * Where each agent keeps its MCP server configuration. Project and local
 * scope share the project file; only Claude Code distinguishes them elsewhere.
 *
 * - claude:   `<cwd>/.mcp.json` / `~/.claude.json`
 * - codex:    `<cwd>/.codex/config.toml` / `~/.codex/config.toml`
 * - gemini:   `<cwd>/.gemini/settings.json` / `~/.gemini/settings.json`
 * - opencode: `<cwd>/opencode.json` / `~/.config/opencode/opencode.json`
 *
 * Copilot has no verified MCP format and is not listed; `undefined` means
 * "no known configuration file".
 */
export function getMcpConfigPath(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): string {
  const isUser = scope === "user";
  switch (agent) {
    case "claude":
      return isUser ? join(home, ".claude.json") : join(cwd, ".mcp.json");
    case "codex":
      return isUser ? join(home, ".codex", "config.toml") : join(cwd, ".codex", "config.toml");
    case "gemini":
      return isUser ? join(home, ".gemini", SETTINGS_FILE) : join(cwd, ".gemini", SETTINGS_FILE);
    case "opencode":
      return isUser ? join(home, ".config", "opencode", "opencode.json") : join(cwd, "opencode.json");
    case "copilot":
      throw new Error("GitHub Copilot has no verified MCP configuration format");
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
