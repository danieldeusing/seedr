import { homedir } from "node:os";
import { join } from "node:path";
import { CANONICAL_AGENTS, canonicalAgent } from "@seedr/registry-ops/pure";
import type { CodingAgentConfig, InstallScope, ContentTypeConfig } from "../types.js";
import type { CodingAgent, ComponentType } from "@seedr/shared";

const home = homedir();

/**
 * Claude Code's user configuration root. `~/.claude` is the convention, not the
 * rule: `$CLAUDE_CONFIG_DIR` relocates it, and containers, multi-account setups
 * and the Agent SDK all set it. Writing to `~/.claude` on such a machine
 * reports success and installs into a tree Claude Code never reads.
 *
 * Read once at module load, which is when a CLI run's environment is fixed.
 */
export const claudeUserRoot = (): string => process.env.CLAUDE_CONFIG_DIR || join(home, ".claude");

const SKILL_DIRECTORY: ContentTypeConfig = {
  path: "skills",
};

// Google Antigravity (CLI `agy`) reads the agent-neutral `.agents/` tree — the
// same convention this repo's own tooling uses — and `~/.agents` at user scope.
const ANTIGRAVITY: CodingAgentConfig = {
  name: "Google Antigravity",
  shortName: "antigravity",
  // Project content is the agent-neutral `.agents/` tree, which IS Antigravity's
  // own project root. The personal tier is not the same spelling: the shipped
  // CLI reads `~/.gemini/config/skills`, and the vendor documentation states
  // outright that `~/.agents` does not exist for it. `~/.gemini/skills` is the
  // predecessor Gemini CLI location and is not written.
  projectRoot: ".agents",
  userRoot: join(home, ".gemini", "config"),
  contentTypes: { skill: SKILL_DIRECTORY },
};

/**
 * Where each agent keeps what. The deprecated `gemini` id shares Antigravity's
 * layout, so an old flag or an unmigrated item still installs to the right place.
 */
export const CODING_AGENTS: Record<CodingAgent, CodingAgentConfig> = {
  claude: {
    name: "Claude Code",
    shortName: "claude",
    projectRoot: ".claude",
    userRoot: claudeUserRoot(),
    contentTypes: {
      skill: SKILL_DIRECTORY,
      command: {
        path: "commands",
      },
      agent: {
        path: "agents",
      },
      hook: {
        path: "",
      },
      plugin: {
        path: "plugins/cache",
      },
      settings: {
        path: "",
      },
      mcp: {
        path: "",
      },
    },
  },
  copilot: {
    name: "GitHub Copilot",
    shortName: "copilot",
    // Project content is `.github/`, but the personal tier is `~/.copilot/` —
    // the two are not the same spelling. `~/.github/skills` is read by nothing;
    // `~/.copilot/skills` is what the CLI itself populates.
    projectRoot: ".github",
    userRoot: join(home, ".copilot"),
    // Subagents are `<name>.agent.md` under `agents/`, with the same
    // `name` + `description` frontmatter a Claude subagent carries — confirmed
    // from files on a real machine.
    contentTypes: { skill: SKILL_DIRECTORY, agent: { path: "agents" } },
  },
  antigravity: ANTIGRAVITY,
  gemini: ANTIGRAVITY,
  codex: {
    name: "OpenAI Codex CLI",
    shortName: "codex",
    projectRoot: ".codex",
    userRoot: join(home, ".codex"),
    contentTypes: { skill: SKILL_DIRECTORY },
  },
  opencode: {
    name: "OpenCode",
    shortName: "opencode",
    projectRoot: ".opencode",
    userRoot: join(home, ".opencode"),
    contentTypes: { skill: SKILL_DIRECTORY },
  },
};

/** The agents `--agents all` expands to: canonical ids only. */
export const ALL_AGENTS: CodingAgent[] = [...CANONICAL_AGENTS];

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
  return getAgentConfig(agent).contentTypes[type];
}

/**
 * Get the root path for an agent based on scope.
 */
export function getAgentRoot(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): string {
  const config = getAgentConfig(agent);
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
      return join(claudeUserRoot(), "settings.json");
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
 * - opencode: `<cwd>/opencode.json` / `~/.config/opencode/opencode.json`
 * - copilot:  `<cwd>/.github/mcp.json` / `~/.copilot/mcp-config.json`
 *
 * Antigravity is still not listed. Its file name is documented
 * (`~/.gemini/config/mcp_config.json`) but the shipped manual omits the
 * workspace path, and the file is empty on every machine checked, so the
 * schema has never been observed. The deprecated `gemini` id resolves to
 * antigravity before it ever reaches this table.
 */
export function getMcpConfigPath(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): string {
  const isUser = scope === "user";
  switch (canonicalAgent(agent) ?? agent) {
    case "claude":
      return isUser ? join(process.env.CLAUDE_CONFIG_DIR || home, ".claude.json") : join(cwd, ".mcp.json");
    case "codex":
      return isUser ? join(home, ".codex", "config.toml") : join(cwd, ".codex", "config.toml");
    case "opencode":
      return isUser ? join(home, ".config", "opencode", "opencode.json") : join(cwd, "opencode.json");
    case "copilot":
      // `copilot mcp --help` names three sources: `~/.copilot/mcp-config.json`
      // for the user, and `.mcp.json` OR `.github/mcp.json` for the workspace.
      // `.github/mcp.json` is the one that does not collide with Claude's
      // `.mcp.json` — sharing that file would make a Copilot uninstall delete
      // Claude's server entry.
      return isUser ? join(home, ".copilot", "mcp-config.json") : join(cwd, ".github", "mcp.json");
    default:
      // copilot and antigravity: the mcp handler refuses these before ever
      // resolving a path (MCP_UNSUPPORTED_REASONS in config/compatibility.ts).
      throw new Error(`${agent} has no verified MCP configuration format`);
  }
}

/** The agent's skills directory. Used by detection and `init`. */
export function getAgentPath(
  agent: CodingAgent,
  scope: "project" | "user",
  cwd: string = process.cwd()
): string {
  return getContentPath(agent, "skill", scope, cwd) || "";
}
