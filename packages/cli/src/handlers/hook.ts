import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, unlink } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { HookTrigger, RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItem, getItemSourcePath, fetchItemToDestination } from "../config/registry.js";
import { getSettingsPath, CODING_AGENTS } from "../config/agents.js";
import {
  assertDirectoryWithin,
  assertOverwritable,
  assertSafePathSegment,
  exists,
  resolveContained,
  restoreFile,
  snapshotFile,
  writeFileAtomic,
} from "../utils/fs.js";
import { readJson, writeJson } from "../utils/json.js";
import { assertValidSlug } from "../utils/slug.js";
import type { ContentHandler, InstallResult, PlannedChange } from "./types.js";

interface HookCommand {
  type: "command";
  command: string;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

type HooksByEvent = Record<string, HookEntry[]>;

interface SettingsJson {
  hooks?: HooksByEvent;
  [key: string]: unknown;
}

const CLAUDE_ONLY_ERROR = "Hooks are only supported for Claude Code";
const SCRIPT_NAME_LABEL = "hook script name";
const SCRIPT_MODE = 0o755;

/** The directory every hook path must stay inside: the project for project/local scope, home for user scope. */
function getScopeRoot(scope: InstallScope, cwd: string): string {
  return scope === "user" ? homedir() : cwd;
}

/**
 * Get the hooks directory path based on scope.
 */
function getHooksDir(scope: InstallScope, cwd: string): string {
  return join(getScopeRoot(scope, cwd), ".claude", "hooks");
}

/**
 * Get the script path to use in settings.json based on scope.
 */
function getScriptPath(scope: InstallScope, scriptName: string): string {
  switch (scope) {
    case "user":
      return `~/.claude/hooks/${scriptName}`;
    case "project":
    case "local":
      return `.claude/hooks/${scriptName}`;
  }
}

/**
 * Find the main script file from the item's files.
 */
function findScriptFile(item: RegistryItem): string | null {
  const files = item.contents?.files;
  if (!files) return null;

  // Look for .sh files at the top level
  for (const file of files) {
    if (file.type === "file" && file.name.endsWith(".sh")) {
      return file.name;
    }
  }

  return null;
}

/**
 * Create the hooks directory and prove it physically lives inside the scope
 * root — neither `.claude` nor `.claude/hooks` may be a symlink escaping it.
 * Returns the physical (realpath) directory so every write lands where the
 * check looked.
 */
async function prepareHooksDir(scope: InstallScope, cwd: string): Promise<string> {
  const scopeRoot = getScopeRoot(scope, cwd);
  const hooksDir = await resolveContained(scopeRoot, ".claude", "hooks");
  await mkdir(hooksDir, { recursive: true });
  await assertDirectoryWithin(hooksDir, scopeRoot, "hooks directory");
  return realpath(hooksDir);
}

/** Refuse to write through anything that is not a plain file: symlinks, directories, sockets. */
async function assertRegularFileOrMissing(path: string): Promise<void> {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`${path} is a symbolic link; refusing to write through it — remove it first`);
  }
  if (!stats.isFile()) {
    throw new Error(`${path} exists and is not a regular file; refusing to replace it`);
  }
}

/** Read the hook script bytes from the local checkout or a verified download into a throwaway directory. */
async function loadScriptBytes(item: RegistryItem, scriptFile: string, hooksDir: string): Promise<Buffer> {
  const sourcePath = getItemSourcePath(item);
  if (sourcePath && (await exists(sourcePath))) {
    return readFile(join(sourcePath, scriptFile));
  }

  const fetchDir = await mkdtemp(join(dirname(hooksDir), ".seedr-hook-"));
  try {
    const contentDir = join(fetchDir, "content");
    await fetchItemToDestination(item, contentDir);
    return await readFile(join(contentDir, scriptFile));
  } finally {
    await rm(fetchDir, { recursive: true, force: true });
  }
}

/** Register `command` under every trigger, reusing an entry with the same matcher. */
function mergeTriggers(hooks: HooksByEvent, triggers: HookTrigger[], command: string): void {
  for (const trigger of triggers) {
    const entries = (hooks[trigger.event] ??= []);
    const existingEntry = entries.find((entry) => entry.matcher === trigger.matcher);
    const hookCommand: HookCommand = { type: "command", command };

    if (existingEntry) {
      if (!existingEntry.hooks.some((hook) => hook.command === command)) {
        existingEntry.hooks.push(hookCommand);
      }
      continue;
    }

    const newEntry: HookEntry = { hooks: [hookCommand] };
    if (trigger.matcher) newEntry.matcher = trigger.matcher;
    entries.push(newEntry);
  }
}

async function installHookForAgent(
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
    if (agent !== "claude") {
      throw new Error(CLAUDE_ONLY_ERROR);
    }

    const triggers = item.contents?.triggers;
    if (!triggers || triggers.length === 0) {
      throw new Error("No triggers defined for this hook");
    }

    const scriptFile = findScriptFile(item);
    if (!scriptFile) {
      throw new Error("No script file found in hook");
    }
    assertSafePathSegment(scriptFile, SCRIPT_NAME_LABEL);

    // Step 1: the script, written atomically next to its destination
    const hooksDir = await prepareHooksDir(scope, cwd);
    const destScriptPath = await resolveContained(hooksDir, scriptFile);
    await assertRegularFileOrMissing(destScriptPath);
    await assertOverwritable(destScriptPath, force);

    const scriptBytes = await loadScriptBytes(item, scriptFile, hooksDir);
    const previousScript = await snapshotFile(destScriptPath);
    await writeFileAtomic(destScriptPath, scriptBytes, { mode: SCRIPT_MODE });

    // Step 2: the triggers; the script is put back the way it was if this fails
    try {
      const settingsPath = getSettingsPath(scope, cwd);
      const settings = await readJson<SettingsJson>(settingsPath);
      settings.hooks = settings.hooks || {};
      mergeTriggers(settings.hooks, triggers, getScriptPath(scope, scriptFile));
      await writeJson(settingsPath, settings);
    } catch (error) {
      await restoreFile(destScriptPath, previousScript);
      throw error;
    }

    spinner.succeed(
      brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`)
    );
    return { agent, success: true, path: destScriptPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(
      chalk.red(`Failed to install for ${CODING_AGENTS[agent].name}: ${errorMsg}`)
    );
    return { agent, success: false, path: "", error: errorMsg };
  }
}

export async function installHook(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string = process.cwd()
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  for (const agent of agents) {
    const result = await installHookForAgent(item, agent, scope, method, force, cwd);
    results.push(result);
  }

  return results;
}

/** Drop every command belonging to the hook from all events. Returns whether anything changed. */
function removeHookCommands(hooks: HooksByEvent, slug: string, expectedPath: string | null): boolean {
  let removed = false;

  const belongsToHook = (hook: HookCommand): boolean =>
    (expectedPath !== null && hook.command === expectedPath) || basename(hook.command, ".sh") === slug;

  for (const event of Object.keys(hooks)) {
    const entries = hooks[event] ?? [];
    const keptEntries: HookEntry[] = [];
    for (const entry of entries) {
      const keptHooks = entry.hooks.filter((hook) => !belongsToHook(hook));
      if (keptHooks.length < entry.hooks.length) removed = true;
      if (keptHooks.length > 0) keptEntries.push({ ...entry, hooks: keptHooks });
    }
    if (keptEntries.length === 0) {
      delete hooks[event];
    } else {
      hooks[event] = keptEntries;
    }
  }

  return removed;
}

/**
 * Delete the hook's script, but only a file (or symlink entry) that sits
 * directly inside a hooks directory that itself resolves inside the scope
 * root. Directories and anything outside are left alone.
 */
async function removeScriptFile(scope: InstallScope, cwd: string, scriptFileName: string): Promise<boolean> {
  const scopeRoot = getScopeRoot(scope, cwd);
  const hooksDir = getHooksDir(scope, cwd);
  if (!(await exists(hooksDir))) return false;

  await assertDirectoryWithin(hooksDir, scopeRoot, "hooks directory");
  assertSafePathSegment(scriptFileName, SCRIPT_NAME_LABEL);
  const scriptFilePath = await resolveContained(hooksDir, scriptFileName);

  let stats;
  try {
    stats = await lstat(scriptFilePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (stats.isDirectory()) {
    throw new Error(`${scriptFilePath} is a directory; refusing to remove it`);
  }
  await unlink(scriptFilePath);
  return true;
}

export async function uninstallHook(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  assertValidSlug(slug, "hook slug");
  if (agent !== "claude") return false;

  const settingsPath = getSettingsPath(scope, cwd);
  if (!(await exists(settingsPath))) return false;

  // Look up the registry item to find the script file name
  const item = await getItem(slug, "hook");
  const scriptFile = item ? findScriptFile(item) : null;
  const expectedPath = scriptFile ? getScriptPath(scope, scriptFile) : null;

  const settings = await readJson<SettingsJson>(settingsPath);
  if (!settings.hooks) return false;

  let removed = removeHookCommands(settings.hooks, slug, expectedPath);
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  if (removed) {
    await writeJson(settingsPath, settings);
  }

  if (await removeScriptFile(scope, cwd, scriptFile || `${slug}.sh`)) {
    removed = true;
  }

  return removed;
}

export async function getInstalledHooks(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  if (agent !== "claude") return [];

  const settingsPath = getSettingsPath(scope, cwd);
  if (!(await exists(settingsPath))) return [];

  const settings = await readJson<SettingsJson>(settingsPath);
  if (!settings.hooks) return [];

  // Extract slugs from hook command paths (e.g. ".claude/hooks/my-hook.sh" -> "my-hook")
  const slugs = new Set<string>();
  for (const entries of Object.values(settings.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        slugs.add(basename(hook.command, ".sh"));
      }
    }
  }

  return Array.from(slugs);
}

export async function planHook(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  _method: InstallMethod,
  cwd: string
): Promise<PlannedChange[]> {
  const changes: PlannedChange[] = [];
  for (const agent of agents) {
    if (agent !== "claude") throw new Error(CLAUDE_ONLY_ERROR);
    const scriptFile = findScriptFile(item);
    if (!scriptFile) throw new Error("No script file found in hook");
    assertSafePathSegment(scriptFile, SCRIPT_NAME_LABEL);

    const scopeRoot = getScopeRoot(scope, cwd);
    const scriptPath = await resolveContained(scopeRoot, ".claude", "hooks", scriptFile);
    const settingsPath = getSettingsPath(scope, cwd);
    const events = (item.contents?.triggers ?? [])
      .map((trigger) => (trigger.matcher ? `${trigger.event}[${trigger.matcher}]` : trigger.event))
      .join(", ");

    changes.push(
      { agent, kind: (await exists(scriptPath)) ? "modify" : "create", path: scriptPath, detail: "executable hook script" },
      {
        agent,
        kind: (await exists(settingsPath)) ? "modify" : "create",
        path: settingsPath,
        detail: `hooks: ${events || "(no triggers)"} → ${getScriptPath(scope, scriptFile)}`,
      }
    );
  }
  return changes;
}

/**
 * Hook content handler implementing the ContentHandler interface.
 */
export const hookHandler: ContentHandler = {
  type: "hook",
  honoursMethod: false,

  async install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]> {
    return installHook(item, agents, scope, method, force, cwd);
  },

  async uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean> {
    return uninstallHook(slug, agent, scope, cwd);
  },

  async listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]> {
    return getInstalledHooks(agent, scope, cwd);
  },

  plan: planHook,
};
