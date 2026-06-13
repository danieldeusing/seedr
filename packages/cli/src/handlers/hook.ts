import { join, basename } from "node:path";
import { homedir } from "node:os";
import { mkdir, copyFile, chmod, rm } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItem, getItemSourcePath, fetchItemToDestination } from "../config/registry.js";
import { getSettingsPath, CODING_AGENTS } from "../config/agents.js";
import { exists, assertOverwritable } from "../utils/fs.js";
import { readJson, writeJson } from "../utils/json.js";
import type { ContentHandler, InstallResult } from "./types.js";

interface HookEntry {
  matcher?: string;
  hooks: Array<{
    type: "command";
    command: string;
  }>;
}

interface SettingsJson {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Get the hooks directory path based on scope.
 */
function getHooksDir(scope: InstallScope, cwd: string): string {
  switch (scope) {
    case "user":
      return join(homedir(), ".claude", "hooks");
    case "project":
    case "local":
      return join(cwd, ".claude", "hooks");
  }
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
      throw new Error("Hooks are only supported for Claude Code");
    }

    // Get triggers from manifest
    const triggers = item.contents?.triggers;
    if (!triggers || triggers.length === 0) {
      throw new Error("No triggers defined for this hook");
    }

    // Find the script file
    const scriptFile = findScriptFile(item);
    if (!scriptFile) {
      throw new Error("No script file found in hook");
    }

    // Step 1: Copy script to hooks directory
    const hooksDir = getHooksDir(scope, cwd);
    await mkdir(hooksDir, { recursive: true });

    const sourcePath = getItemSourcePath(item);
    const destScriptPath = join(hooksDir, scriptFile);
    await assertOverwritable(destScriptPath, force);

    if (sourcePath && (await exists(sourcePath))) {
      // Local registry - copy or symlink based on method
      const sourceScriptPath = join(sourcePath, scriptFile);
      await copyFile(sourceScriptPath, destScriptPath);
    } else {
      // Remote - fetch to temp then copy script
      const tempDir = join(cwd, ".claude", ".tmp", item.slug);
      await fetchItemToDestination(item, tempDir);
      await copyFile(join(tempDir, scriptFile), destScriptPath);
      // Clean up temp dir
      await rm(tempDir, { recursive: true, force: true });
    }

    // Make script executable
    await chmod(destScriptPath, 0o755);

    // Step 2: Update settings with triggers
    const settingsPath = getSettingsPath(scope, cwd);
    const settings = await readJson<SettingsJson>(settingsPath);
    settings.hooks = settings.hooks || {};

    const scriptPath = getScriptPath(scope, scriptFile);

    for (const trigger of triggers) {
      const event = trigger.event;
      const matcher = trigger.matcher;

      // Initialize event array if needed
      if (!settings.hooks[event]) {
        settings.hooks[event] = [];
      }

      // Check if there's already an entry with this matcher
      const existingEntry = settings.hooks[event].find(
        (e) => e.matcher === matcher
      );

      const hookCommand = { type: "command" as const, command: scriptPath };

      if (existingEntry) {
        // Add to existing entry if not already present
        const alreadyExists = existingEntry.hooks.some(
          (h) => h.command === scriptPath
        );
        if (!alreadyExists) {
          existingEntry.hooks.push(hookCommand);
        }
      } else {
        // Create new entry
        const newEntry: HookEntry = {
          hooks: [hookCommand],
        };
        if (matcher) {
          newEntry.matcher = matcher;
        }
        settings.hooks[event].push(newEntry);
      }
    }

    await writeJson(settingsPath, settings);

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

export async function uninstallHook(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  if (agent !== "claude") return false;

  const settingsPath = getSettingsPath(scope, cwd);
  if (!(await exists(settingsPath))) return false;

  // Look up the registry item to find the script file name
  const item = await getItem(slug, "hook");
  const scriptFile = item ? findScriptFile(item) : null;

  // Build the script path we'd expect in settings
  const expectedPath = scriptFile ? getScriptPath(scope, scriptFile) : null;

  const settings = await readJson<SettingsJson>(settingsPath);
  if (!settings.hooks) return false;

  let removed = false;

  // Remove hook commands matching the script path from all events
  for (const event of Object.keys(settings.hooks)) {
    const entries = settings.hooks[event];
    if (!entries) continue;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;

      // Filter out hooks whose command matches the script path or slug
      const originalLength = entry.hooks.length;
      entry.hooks = entry.hooks.filter((h) => {
        if (expectedPath && h.command === expectedPath) return false;
        // Fallback: match by slug in the path (e.g. ".claude/hooks/my-hook.sh" contains "my-hook")
        const cmdBasename = basename(h.command, ".sh");
        return cmdBasename !== slug;
      });

      if (entry.hooks.length < originalLength) {
        removed = true;
      }

      // Remove the entry entirely if no hooks remain
      if (entry.hooks.length === 0) {
        entries.splice(i, 1);
      }
    }

    // Remove the event key if no entries remain
    if (entries.length === 0) {
      delete settings.hooks[event];
    }
  }

  // Remove the hooks key entirely if empty
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  if (removed) {
    await writeJson(settingsPath, settings);
  }

  // Delete the script file
  const hooksDir = getHooksDir(scope, cwd);
  const scriptFileName = scriptFile || `${slug}.sh`;
  const scriptFilePath = join(hooksDir, scriptFileName);
  try {
    await rm(scriptFilePath);
    removed = true;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
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
        const slug = basename(hook.command, ".sh");
        slugs.add(slug);
      }
    }
  }

  return Array.from(slugs);
}

/**
 * Hook content handler implementing the ContentHandler interface.
 */
export const hookHandler: ContentHandler = {
  type: "hook",

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
};
