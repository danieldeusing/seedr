import { join, relative } from "node:path";
import { homedir } from "node:os";
import { lstat, readdir, unlink } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItemContent, getItemSourcePath } from "../config/registry.js";
import { getContentPath, CODING_AGENTS } from "../config/agents.js";
import { exists, ensureDir, writeTextFile, installFile, assertOverwritable, resolveContained } from "../utils/fs.js";
import { assertValidSlug } from "../utils/slug.js";
import type { ContentHandler, InstallResult, PlannedChange } from "./types.js";

const SLUG_LABEL = "agent slug";

/** `<agent agents dir>/<slug>.md`, proven contained in the scope root. */
async function resolveAgentFilePath(
  agent: CodingAgent,
  slug: string,
  scope: InstallScope,
  cwd: string
): Promise<string | null> {
  const destDir = getContentPath(agent, "agent", scope, cwd);
  if (!destDir) return null;
  const scopeRoot = scope === "user" ? homedir() : cwd;
  return resolveContained(scopeRoot, relative(scopeRoot, destDir), `${slug}.md`);
}

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
    assertValidSlug(item.slug, SLUG_LABEL);
    const destPath = await resolveAgentFilePath(agent, item.slug, scope, cwd);
    if (!destPath) {
      throw new Error(`${CODING_AGENTS[agent].name} does not support agents`);
    }

    await assertOverwritable(destPath, force);
    const sourcePath = getItemSourcePath(item);
    const sourceFile = sourcePath ? join(sourcePath, "AGENT.md") : null;

    if (method === "symlink" && sourceFile && (await exists(sourceFile))) {
      // Symlink for local toolr items
      await installFile(sourceFile, destPath, "symlink");
    } else {
      const content = await getItemContent(item);
      await ensureDir(getContentPath(agent, "agent", scope, cwd)!);
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

/**
 * Remove the agent's single `.md` entry: a regular file, or the symlink a
 * symlink install created (unlinked, never followed). Directories are refused.
 */
export async function uninstallAgent(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  assertValidSlug(slug, SLUG_LABEL);
  const destPath = await resolveAgentFilePath(agent, slug, scope, cwd);
  if (!destPath) return false;

  let stats;
  try {
    stats = await lstat(destPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (stats.isDirectory()) {
    throw new Error(`${destPath} is a directory; refusing to remove it`);
  }
  await unlink(destPath);
  return true;
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

export async function planAgent(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  cwd: string
): Promise<PlannedChange[]> {
  assertValidSlug(item.slug, SLUG_LABEL);
  const changes: PlannedChange[] = [];
  for (const agent of agents) {
    const destPath = await resolveAgentFilePath(agent, item.slug, scope, cwd);
    if (!destPath) throw new Error(`${CODING_AGENTS[agent].name} does not support agents`);
    const sourcePath = getItemSourcePath(item);
    const linked = method === "symlink" && sourcePath !== null && (await exists(join(sourcePath, "AGENT.md")));
    changes.push({
      agent,
      kind: (await exists(destPath)) ? "modify" : "create",
      path: destPath,
      detail: linked ? `symlink → ${join(sourcePath!, "AGENT.md")}` : "agent definition file",
    });
  }
  return changes;
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

  plan: planAgent,
};
