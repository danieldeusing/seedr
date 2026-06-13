import { join, relative, dirname } from "node:path";
import { readdir, symlink, rm } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import {
  getItemSourcePath,
  fetchItemToDestination,
} from "../config/registry.js";
import { getContentPath, CODING_AGENTS } from "../config/agents.js";
import {
  exists,
  installDirectory,
  copyDirectory,
  ensureDir,
  getAgentsPath,
  assertOverwritable,
} from "../utils/fs.js";
import type { ContentHandler, InstallResult } from "./types.js";

/**
 * Install skill to the central .agents/skills/<name> location.
 * Returns the path to the central location.
 */
async function installToCentralLocation(
  item: RegistryItem,
  sourcePath: string | null,
  scope: InstallScope,
  force: boolean,
  cwd: string
): Promise<string> {
  const centralPath = getAgentsPath("skill", item.slug, scope, cwd);

  await assertOverwritable(centralPath, force);
  await rm(centralPath, { recursive: true, force: true });

  // Copy from local or fetch from remote
  if (sourcePath && (await exists(sourcePath))) {
    await copyDirectory(sourcePath, centralPath);
  } else {
    await fetchItemToDestination(item, centralPath);
  }

  return centralPath;
}

/**
 * Create a symlink from the agent's skill directory to the central location.
 */
async function createAgentSymlink(
  centralPath: string,
  destPath: string
): Promise<void> {
  await ensureDir(dirname(destPath));

  await rm(destPath, { recursive: true, force: true });

  // Create relative symlink for portability
  const relPath = relative(dirname(destPath), centralPath);
  await symlink(relPath, destPath);
}

async function installSkillForAgent(
  item: RegistryItem,
  agent: CodingAgent,
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string,
  centralPath?: string
): Promise<InstallResult> {
  const spinner = ora(
    `Installing ${item.name} for ${CODING_AGENTS[agent].name}...`
  ).start();

  try {
    const destDir = getContentPath(agent, "skill", scope, cwd);
    if (!destDir) {
      throw new Error(`${CODING_AGENTS[agent].name} does not support skills`);
    }

    const destPath = join(destDir, item.slug);
    await assertOverwritable(destPath, force);
    const sourcePath = getItemSourcePath(item);

    if (method === "symlink" && centralPath) {
      // Symlink mode: link from agent folder to central .agents location
      await createAgentSymlink(centralPath, destPath);
    } else if (sourcePath && (await exists(sourcePath))) {
      // Copy mode: copy directly from local registry
      await installDirectory(sourcePath, destPath, "copy");
    } else {
      // Fetch from remote (when running via npx or for external items)
      await fetchItemToDestination(item, destPath);
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

export async function installSkill(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string = process.cwd()
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  const sourcePath = getItemSourcePath(item);

  // For symlink mode, first install to central .agents location
  let centralPath: string | undefined;
  if (method === "symlink") {
    centralPath = await installToCentralLocation(item, sourcePath, scope, force, cwd);
  }

  for (const agent of agents) {
    // Gemini, Codex, and OpenCode already read .agents/skills/, so skip
    // the symlink when content is installed centrally. For single-agent
    // installs, copy directly to the agent's own directory instead.
    const readsAgentsDir = agent === "gemini" || agent === "codex" || agent === "opencode";
    if (readsAgentsDir && method === "symlink" && centralPath) {
      results.push({ agent, success: true, path: centralPath });
      continue;
    }

    const result = await installSkillForAgent(
      item,
      agent,
      scope,
      method,
      force,
      cwd,
      centralPath
    );
    results.push(result);
  }

  return results;
}

export async function uninstallSkill(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  const destDir = getContentPath(agent, "skill", scope, cwd);
  if (!destDir) return false;

  const destPath = join(destDir, slug);

  if (!(await exists(destPath))) {
    return false;
  }

  await rm(destPath, { recursive: true });
  return true;
}

export async function getInstalledSkills(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  const destDir = getContentPath(agent, "skill", scope, cwd);
  if (!destDir || !(await exists(destDir))) {
    return [];
  }

  const entries = await readdir(destDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Skill content handler implementing the ContentHandler interface.
 */
export const skillHandler: ContentHandler = {
  type: "skill",

  async install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]> {
    return installSkill(item, agents, scope, method, force, cwd);
  },

  async uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean> {
    return uninstallSkill(slug, agent, scope, cwd);
  },

  async listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]> {
    return getInstalledSkills(agent, scope, cwd);
  },
};

// Re-export types for backward compatibility
export type { InstallResult } from "./types.js";
