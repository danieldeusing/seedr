import { relative, dirname } from "node:path";
import { homedir } from "node:os";
import { readdir, symlink } from "node:fs/promises";
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
  ensureDir,
  getAgentsPath,
  assertOverwritable,
  removePathEntry,
  resolveContained,
} from "../utils/fs.js";
import { assertValidSlug } from "../utils/slug.js";
import type { ContentHandler, InstallResult, PlannedChange } from "./types.js";

const SLUG_LABEL = "skill slug";

/** Agents that read `.agents/skills/` directly and need no per-agent link. */
const READS_CENTRAL_DIR: ReadonlySet<CodingAgent> = new Set(["gemini", "codex", "opencode"]);

function getScopeRoot(scope: InstallScope, cwd: string): string {
  return scope === "user" ? homedir() : cwd;
}

/** `<scopeRoot>/.agents/skills/<slug>`, proven contained. */
async function resolveCentralPath(slug: string, scope: InstallScope, cwd: string): Promise<string> {
  const central = getAgentsPath("skill", slug, scope, cwd);
  return resolveContained(dirname(central), slug);
}

/** `<agent skills dir>/<slug>`, proven contained in the scope root. */
async function resolveAgentSkillPath(
  agent: CodingAgent,
  slug: string,
  scope: InstallScope,
  cwd: string
): Promise<string | null> {
  const destDir = getContentPath(agent, "skill", scope, cwd);
  if (!destDir) return null;
  const scopeRoot = getScopeRoot(scope, cwd);
  return resolveContained(scopeRoot, relative(scopeRoot, destDir), slug);
}

/**
 * Install skill to the central .agents/skills/<name> location.
 * Returns the path to the central location and whether it was newly created.
 */
async function installToCentralLocation(
  item: RegistryItem,
  sourcePath: string | null,
  scope: InstallScope,
  force: boolean,
  cwd: string
): Promise<{ centralPath: string; created: boolean }> {
  const centralPath = await resolveCentralPath(item.slug, scope, cwd);
  await assertOverwritable(centralPath, force);
  const existed = await exists(centralPath);

  // Copy from local or fetch from remote
  if (sourcePath && (await exists(sourcePath))) {
    await installDirectory(sourcePath, centralPath, "copy");
  } else {
    await fetchItemToDestination(item, centralPath);
  }

  return { centralPath, created: !existed };
}

/**
 * Create a symlink from the agent's skill directory to the central location.
 */
async function createAgentSymlink(
  centralPath: string,
  destPath: string
): Promise<void> {
  await ensureDir(dirname(destPath));
  await removePathEntry(destPath);

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
    const destPath = await resolveAgentSkillPath(agent, item.slug, scope, cwd);
    if (!destPath) {
      throw new Error(`${CODING_AGENTS[agent].name} does not support skills`);
    }

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
  assertValidSlug(item.slug, SLUG_LABEL);
  const results: InstallResult[] = [];
  const sourcePath = getItemSourcePath(item);

  // For symlink mode, first install to central .agents location
  let central: { centralPath: string; created: boolean } | undefined;
  if (method === "symlink") {
    central = await installToCentralLocation(item, sourcePath, scope, force, cwd);
  }

  for (const agent of agents) {
    // Gemini, Codex, and OpenCode already read .agents/skills/, so skip
    // the symlink when content is installed centrally. For single-agent
    // installs, copy directly to the agent's own directory instead.
    if (READS_CENTRAL_DIR.has(agent) && central) {
      results.push({ agent, success: true, path: central.centralPath });
      continue;
    }

    const result = await installSkillForAgent(
      item,
      agent,
      scope,
      method,
      force,
      cwd,
      central?.centralPath
    );
    results.push(result);
  }

  // A central copy nobody links to is an orphan; remove it if this install created it.
  if (central?.created && !results.some((result) => result.success)) {
    await removePathEntry(central.centralPath);
  }

  return results;
}

export async function uninstallSkill(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  assertValidSlug(slug, SLUG_LABEL);
  const destPath = await resolveAgentSkillPath(agent, slug, scope, cwd);
  if (!destPath) return false;

  // A symlink entry (symlink installs) is unlinked, never followed.
  return removePathEntry(destPath);
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

  // Slugs never start with a dot, so hidden entries (a leftover staging
  // directory, editor files) are never reported as installed skills.
  const entries = await readdir(destDir, { withFileTypes: true });
  return entries
    .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith("."))
    .map((entry) => entry.name);
}

export async function planSkill(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  cwd: string
): Promise<PlannedChange[]> {
  assertValidSlug(item.slug, SLUG_LABEL);
  const changes: PlannedChange[] = [];
  const kindFor = async (path: string): Promise<PlannedChange["kind"]> =>
    (await exists(path)) ? "modify" : "create";

  let centralPath: string | undefined;
  if (method === "symlink") {
    centralPath = await resolveCentralPath(item.slug, scope, cwd);
    const sharedBy = agents.filter((agent) => READS_CENTRAL_DIR.has(agent));
    changes.push({
      agent: "shared",
      kind: await kindFor(centralPath),
      path: centralPath,
      detail: sharedBy.length > 0 ? `central copy, read directly by ${sharedBy.join(", ")}` : "central copy",
    });
  }

  for (const agent of agents) {
    if (centralPath && READS_CENTRAL_DIR.has(agent)) continue;
    const destPath = await resolveAgentSkillPath(agent, item.slug, scope, cwd);
    if (!destPath) throw new Error(`${CODING_AGENTS[agent].name} does not support skills`);
    changes.push({
      agent,
      kind: await kindFor(destPath),
      path: destPath,
      detail: centralPath ? `symlink → ${centralPath}` : "skill directory",
    });
  }
  return changes;
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

  plan: planSkill,
};

// Re-export types for backward compatibility
export type { InstallResult } from "./types.js";
