import { join } from "node:path";
import { readdir } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItemContent, getItemSourcePath } from "../config/registry.js";
import { getContentPath, CODING_AGENTS } from "../config/agents.js";
import { exists, ensureDir, writeTextFile, installFile, removeFile, assertOverwritable } from "../utils/fs.js";
import type { ContentHandler, InstallResult } from "./types.js";

async function installAgentForCodingAgent(
  item: RegistryItem,
  agent: CodingAgent,
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string
): Promise<InstallResult> {
  const spinner = ora(
    `Installing ${item.name} for ${CODING_AGENTS[agent].name}...`
  ).start();

  try {
    const destDir = getContentPath(agent, "agent", scope, cwd);
    if (!destDir) {
      throw new Error(`${CODING_AGENTS[agent].name} does not support agents`);
    }

    const destPath = join(destDir, `${item.slug}.md`);
    await assertOverwritable(destPath, force);
    const sourcePath = getItemSourcePath(item);

    // Try symlink for local toolr items, otherwise copy
    if (sourcePath && method === "symlink") {
      const sourceFile = join(sourcePath, "AGENT.md");
      if (await exists(sourceFile)) {
        await installFile(sourceFile, destPath, "symlink");
      } else {
        // Fall back to content copy
        const content = await getItemContent(item);
        await ensureDir(destDir);
        await writeTextFile(destPath, content);
      }
    } else {
      const content = await getItemContent(item);
      await ensureDir(destDir);
      await writeTextFile(destPath, content);
    }

    spinner.succeed(
      brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`)
    );
    return { agent, success: true, path: destPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(
      chalk.red(`Failed to install for ${CODING_AGENTS[agent].name}: ${errorMsg}`)
    );
    return { agent, success: false, path: "", error: errorMsg };
  }
}

export async function installAgent(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string = process.cwd()
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  for (const agent of agents) {
    const result = await installAgentForCodingAgent(item, agent, scope, method, force, cwd);
    results.push(result);
  }

  return results;
}

export async function uninstallAgent(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  const destDir = getContentPath(agent, "agent", scope, cwd);
  if (!destDir) return false;

  const destPath = join(destDir, `${slug}.md`);

  if (!(await exists(destPath))) {
    return false;
  }

  return removeFile(destPath);
}

export async function getInstalledAgents(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  const destDir = getContentPath(agent, "agent", scope, cwd);
  if (!destDir || !(await exists(destDir))) {
    return [];
  }

  const files = await readdir(destDir);
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(".md", ""));
}

/**
 * Agent content handler implementing the ContentHandler interface.
 */
export const agentHandler: ContentHandler = {
  type: "agent",

  async install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]> {
    return installAgent(item, agents, scope, method, force, cwd);
  },

  async uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean> {
    return uninstallAgent(slug, agent, scope, cwd);
  },

  async listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]> {
    return getInstalledAgents(agent, scope, cwd);
  },
};
