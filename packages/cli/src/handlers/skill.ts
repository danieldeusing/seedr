import { relative, dirname, join } from "node:path";
import { homedir } from "node:os";
import { readdir, symlink } from "node:fs/promises";
import type { Dirent } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { canonicalAgent } from "@seedr/registry-ops/pure";
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
import { readJson, writeJson } from "../utils/json.js";
import { assertValidSlug } from "../utils/slug.js";
import type { ContentHandler, InstallResult, PlannedChange } from "./types.js";

const SLUG_LABEL = "skill slug";

/**
 * Agents that read the shared `.agents/skills/` tree directly and need no
 * per-agent link.
 *
 * Antigravity is scope-dependent and the others are not. `.agents/` IS
 * Antigravity's project root, so the central copy is its own directory there;
 * at user scope it reads `~/.gemini/config/skills` and the vendor
 * documentation states that `~/.agents` does not exist for it. Codex and
 * OpenCode read the shared tree at both scopes.
 */
function readsCentralDir(agent: CodingAgent, scope: InstallScope): boolean {
  const canonical = canonicalAgent(agent) ?? agent;
  if (canonical === "antigravity") return scope !== "user";
  return canonical === "codex" || canonical === "opencode";
}

/**
 * Which agents a shared central copy was installed for.
 *
 * Agents that read the shared tree get no per-agent file, so nothing on disk
 * says who a central copy belongs to. Without that record, removing a skill for
 * one of them deletes the copy every other agent is still reading. The record
 * lives beside the skills rather than inside one, so it never appears to an
 * agent scanning for `<name>/SKILL.md`.
 */
const OWNERS_FILE = ".seedr-central-owners.json";

async function readOwners(scope: InstallScope, cwd: string): Promise<Record<string, string[]>> {
  return readJson<Record<string, string[]>>(join(centralSkillsDir(scope, cwd), OWNERS_FILE));
}

async function writeOwners(
  owners: Record<string, string[]>,
  scope: InstallScope,
  cwd: string
): Promise<void> {
  await writeJson(join(centralSkillsDir(scope, cwd), OWNERS_FILE), owners);
}

/** Record that `agents` now read the central copy of `slug`. */
async function addOwners(
  slug: string,
  agents: CodingAgent[],
  scope: InstallScope,
  cwd: string
): Promise<void> {
  if (agents.length === 0) return;
  const owners = await readOwners(scope, cwd);
  owners[slug] = [...new Set([...(owners[slug] ?? []), ...agents])];
  await writeOwners(owners, scope, cwd);
}

/**
 * Drop one agent from a central copy's owners. Returns the agents still
 * reading it — a non-empty result means the copy must stay on disk.
 */
async function dropOwner(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string
): Promise<string[]> {
  const owners = await readOwners(scope, cwd);
  const recorded = owners[slug];
  if (!recorded) return [];
  const remaining = recorded.filter((owner) => owner !== (canonicalAgent(agent) ?? agent));
  if (remaining.length > 0) owners[slug] = remaining;
  else delete owners[slug];
  await writeOwners(owners, scope, cwd);
  return remaining;
}

function getScopeRoot(scope: InstallScope, cwd: string): string {
  return scope === "user" ? homedir() : cwd;
}

/** The shared `<scopeRoot>/.agents/skills` directory the central install lives in. */
function centralSkillsDir(scope: InstallScope, cwd: string): string {
  return dirname(getAgentsPath("skill", "any-slug", scope, cwd));
}

/**
 * `<scopeRoot>/.agents/skills/<slug>`, proven contained in the SCOPE ROOT —
 * not merely in `.agents/skills`, which is itself a path a symlink could point
 * outside the project (`resolveContained` deliberately allows a symlinked root).
 */
async function resolveCentralPath(slug: string, scope: InstallScope, cwd: string): Promise<string> {
  const scopeRoot = getScopeRoot(scope, cwd);
  const centralDir = centralSkillsDir(scope, cwd);
  return resolveContained(scopeRoot, relative(scopeRoot, centralDir), slug);
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
    // Antigravity, Codex and OpenCode already read .agents/skills/, so skip
    // the symlink when content is installed centrally. For single-agent
    // installs, copy directly to the agent's own directory instead.
    if (readsCentralDir(agent, scope) && central) {
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
    return results;
  }

  // Agents that read the shared tree leave no per-agent file, so record them.
  // Without this, removing the skill for one of them deletes the copy the
  // others are still reading.
  if (central) {
    const centralReaders = agents.filter(
      (agent) =>
        readsCentralDir(agent, scope) &&
        results.some((result) => result.agent === agent && result.success)
    );
    await addOwners(item.slug, centralReaders, scope, cwd);
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
  const central = await resolveCentralPath(slug, scope, cwd);
  const destPath = await resolveAgentSkillPath(agent, slug, scope, cwd);

  // The shared copy is only this agent's to delete once no other agent reads
  // it. Antigravity's project skills directory IS the shared one, so a plain
  // `removePathEntry(destPath)` there would take everyone else's copy with it.
  if (readsCentralDir(agent, scope) || destPath === central) {
    const remaining = await dropOwner(slug, agent, scope, cwd);
    if (remaining.length > 0) {
      // Still read by another agent: the record is updated, the tree is not.
      return true;
    }
    return removePathEntry(central);
  }

  // A symlink entry (symlink installs) is unlinked, never followed.
  if (destPath && (await removePathEntry(destPath))) {
    // The agent's own entry is gone; it may also have been recorded as a
    // central reader under a different scope's install. Keep the record honest.
    await dropOwner(slug, agent, scope, cwd);
    return true;
  }
  return false;
}

export async function getInstalledSkills(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  // Symlink installs put the content only in the shared `.agents/skills` for
  // agents that read it directly, so both directories are "installed" for them.
  const dirs = new Set<string>();
  const own = getContentPath(agent, "skill", scope, cwd);
  if (own) dirs.add(own);
  if (readsCentralDir(agent, scope)) dirs.add(centralSkillsDir(scope, cwd));

  // A shared copy can outlive this agent's interest in it: another agent may
  // still read it. Where the owners record has an entry for a slug it is
  // authoritative, so a skill removed for this agent stops being reported even
  // though the directory is still on disk for the others.
  const owners = await readOwners(scope, cwd);
  const centralDir = centralSkillsDir(scope, cwd);
  const canonical = canonicalAgent(agent) ?? agent;

  /**
   * Slugs never start with a dot, so hidden entries (a leftover staging
   * directory, the owners record, editor files) are never reported. In the
   * shared directory the owners record is authoritative where it has an entry,
   * so a skill removed for this agent stops being reported even though the
   * directory is still there for the others.
   */
  const isInstalledHere = (entry: Dirent, dir: string): boolean => {
    if (entry.name.startsWith(".")) return false;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) return false;
    const recorded = dir === centralDir ? owners[entry.name] : undefined;
    return !recorded || recorded.includes(canonical);
  };

  const slugs = new Set<string>();
  for (const dir of dirs) {
    if (!(await exists(dir))) continue;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (isInstalledHere(entry, dir)) slugs.add(entry.name);
    }
  }
  return [...slugs];
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
    const sharedBy = agents.filter((agent) => readsCentralDir(agent, scope));
    changes.push({
      agent: "shared",
      kind: await kindFor(centralPath),
      path: centralPath,
      detail: sharedBy.length > 0 ? `central copy, read directly by ${sharedBy.join(", ")}` : "central copy",
    });
  }

  for (const agent of agents) {
    if (centralPath && readsCentralDir(agent, scope)) continue;
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
