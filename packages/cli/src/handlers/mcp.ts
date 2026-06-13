import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItemContent } from "../config/registry.js";
import { getMcpPath, CODING_AGENTS } from "../config/agents.js";
import { exists } from "../utils/fs.js";
import { readJson, writeJson } from "../utils/json.js";
import type { ContentHandler, InstallResult } from "./types.js";

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: "stdio" | "http" | "sse";
  url?: string;
  [key: string]: unknown;
}

interface McpDefinition {
  name: string;
  config: McpServerConfig;
}

interface McpJson {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

/**
 * Parse MCP server definition from registry item content.
 * Expected format is JSON with name and config.
 */
function parseMcpDefinition(content: string): McpDefinition {
  try {
    return JSON.parse(content) as McpDefinition;
  } catch {
    throw new Error("Invalid MCP definition: must be valid JSON");
  }
}

async function installMcpForAgent(
  item: RegistryItem,
  agent: CodingAgent,
  scope: InstallScope,
  _method: InstallMethod,
  force: boolean,
  cwd: string
): Promise<InstallResult> {
  const spinner = ora(
    `Installing ${item.name} for ${CODING_AGENTS[agent].name}...`
  ).start();

  try {
    const content = await getItemContent(item);
    const mcpDef = parseMcpDefinition(content);

    const configPath = getMcpPath(scope, cwd);
    const config = await readJson<McpJson>(configPath);

    // Initialize mcpServers object if needed
    config.mcpServers = config.mcpServers || {};

    if (!force && mcpDef.name in config.mcpServers) {
      throw new Error(
        `MCP server "${mcpDef.name}" already exists in ${configPath}; pass --force to overwrite`
      );
    }

    // Add or replace the MCP server config
    config.mcpServers[mcpDef.name] = mcpDef.config;

    await writeJson(configPath, config);

    spinner.succeed(
      brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`)
    );
    return { agent, success: true, path: configPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(
      chalk.red(`Failed to install for ${CODING_AGENTS[agent].name}: ${errorMsg}`)
    );
    return { agent, success: false, path: "", error: errorMsg };
  }
}

export async function installMcp(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string = process.cwd()
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  for (const agent of agents) {
    const result = await installMcpForAgent(item, agent, scope, method, force, cwd);
    results.push(result);
  }

  return results;
}

export async function uninstallMcp(
  slug: string,
  _agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  const configPath = getMcpPath(scope, cwd);
  if (!(await exists(configPath))) return false;

  const config = await readJson<McpJson>(configPath);
  if (!config.mcpServers || !(slug in config.mcpServers)) {
    return false;
  }

  delete config.mcpServers[slug];
  await writeJson(configPath, config);
  return true;
}

export async function getInstalledMcpServers(
  _agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  const configPath = getMcpPath(scope, cwd);
  if (!(await exists(configPath))) return [];

  const config = await readJson<McpJson>(configPath);
  return Object.keys(config.mcpServers || {});
}

/**
 * MCP content handler implementing the ContentHandler interface.
 */
export const mcpHandler: ContentHandler = {
  type: "mcp",

  async install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]> {
    return installMcp(item, agents, scope, method, force, cwd);
  },

  async uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean> {
    return uninstallMcp(slug, agent, scope, cwd);
  },

  async listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]> {
    return getInstalledMcpServers(agent, scope, cwd);
  },
};
