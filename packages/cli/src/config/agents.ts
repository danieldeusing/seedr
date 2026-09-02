import { existsSync } from "node:fs";
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
/**
 * Claude Code's user JSON state file, which holds user-scope `mcpServers`.
 *
 * It is a resolver result, not a fixed path: `$CLAUDE_CONFIG_DIR/.config.json`
 * when that file exists, and otherwise `${CLAUDE_CONFIG_DIR || $HOME}/.claude.json`.
 * Hard-coding the second branch reads the obvious file and writes the wrong
 * effective configuration on any machine using the first.
 *
 * The non-production OAuth suffixes (`-local-oauth`, `-staging-oauth`,
 * `-custom-oauth`) are deliberately not guessed at: no such file has been
 * observed, and picking one would be the guessing this repo refuses.
 */
export function claudeUserJsonPath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (configDir) {
    const scoped = join(configDir, ".config.json");
    if (existsSync(scoped)) return scoped;
  }
  return join(configDir || home, ".claude.json");
}

/**
 * Each agent's user configuration root, honouring the relocation variable it
 * documents. `~/.copilot` and friends are the convention, not the rule, and
 * writing to the convention on a machine that has moved the tree reports
 * success while installing where the CLI never looks — the same failure this
 * file already guards against for Claude.
 *
 * Antigravity is deliberately absent: agy 1.1.12 exposes no config-root
 * override, so there is nothing to honour.
 */
export const copilotUserRoot = (): string => process.env.COPILOT_HOME || join(home, ".copilot");

export const codexUserRoot = (): string => process.env.CODEX_HOME || join(home, ".codex");

/** OpenCode's global config directory: its own override, then XDG, then the default. */
export const openCodeUserConfigDir = (): string =>
  process.env.OPENCODE_CONFIG_DIR ||
  (process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "opencode") : join(home, ".config", "opencode"));

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
    userRoot: copilotUserRoot(),
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
    userRoot: codexUserRoot(),
    contentTypes: { skill: SKILL_DIRECTORY },
  },
  opencode: {
    name: "OpenCode",
    shortName: "opencode",
    // `~/.opencode` is the LEGACY user directory. The global config directory
    // is `~/.config/opencode`, which is where this package already writes
    // `opencode.json` and `AGENTS.md` — splitting one agent across two roots
    // made `list` and `remove` diverge, and creating `~/.opencode` on a machine
    // that had none adds a capability directory ranked above every project one.
    projectRoot: ".opencode",
    userRoot: openCodeUserConfigDir(),
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
 * - copilot:  `<cwd>/.mcp.json` (shared, and the one Copilot reads first) / `~/.copilot/mcp-config.json`
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
      return isUser ? claudeUserJsonPath() : join(cwd, ".mcp.json");
    case "codex":
      return isUser ? join(codexUserRoot(), "config.toml") : join(cwd, ".codex", "config.toml");
    case "opencode":
      return isUser ? join(openCodeUserConfigDir(), "opencode.json") : join(cwd, "opencode.json");
    case "copilot":
      // `copilot mcp --help` names three sources: `~/.copilot/mcp-config.json`
      // for the user, and `.mcp.json` OR `.github/mcp.json` for the workspace.
      //
      // The workspace pair is a PRECEDENCE list, not a choice: per directory
      // Copilot takes the first that exists, so `.mcp.json` shadows
      // `.github/mcp.json` entirely whenever both are present. Writing the
      // `.github` spelling to avoid sharing Claude's file therefore lost
      // silently — the install reported success, `copilot mcp get <name>`
      // answered "not found", and a later removal emptied a file Copilot had
      // never opened.
      //
      // `.mcp.json` is the shared project MCP file by design, and both agents
      // read it. Sharing it is the honest model: an entry there is the
      // project's, and removing it removes it for every agent that reads it.
      return isUser ? join(copilotUserRoot(), "mcp-config.json") : join(cwd, ".mcp.json");
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
