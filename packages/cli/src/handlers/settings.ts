import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItem, getItemContent } from "../config/registry.js";
import { getSettingsPath, CODING_AGENTS } from "../config/agents.js";
import { exists } from "../utils/fs.js";
import { readJson, writeJson, deepMerge } from "../utils/json.js";
import type { ContentHandler, InstallResult } from "./types.js";

type SettingsJson = Record<string, unknown>;

/**
 * Parse settings content from registry item.
 * Expected format is valid JSON.
 */
function parseSettings(content: string): SettingsJson {
  try {
    return JSON.parse(content) as SettingsJson;
  } catch {
    throw new Error("Invalid settings: must be valid JSON");
  }
}

async function installSettingsForAgent(
  item: RegistryItem,
  agent: CodingAgent,
  scope: InstallScope,
  _method: InstallMethod,
  _force: boolean,
  cwd: string
): Promise<InstallResult> {
  const spinner = ora(
    `Installing ${item.name} for ${CODING_AGENTS[agent].name}...`
  ).start();

  try {
    if (agent !== "claude") {
      throw new Error("Settings are only supported for Claude Code");
    }

    const content = await getItemContent(item);
    const newSettings = parseSettings(content);

    const settingsPath = getSettingsPath(scope, cwd);
    const existingSettings = await readJson<SettingsJson>(settingsPath);

    // Deep merge new settings into existing
    const merged = deepMerge(existingSettings, newSettings);

    await writeJson(settingsPath, merged);

    spinner.succeed(
      brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`)
    );
    return { agent, success: true, path: settingsPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(
      chalk.red(`Failed to install for ${CODING_AGENTS[agent].name}: ${errorMsg}`)
    );
    return { agent, success: false, path: "", error: errorMsg };
  }
}

export async function installSettings(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string = process.cwd()
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  for (const agent of agents) {
    const result = await installSettingsForAgent(item, agent, scope, method, force, cwd);
    results.push(result);
  }

  return results;
}

/**
 * Remove keys from target that were added by source.
 * For nested objects, recursively removes leaf keys. If a nested object
 * becomes empty after removal, the parent key is removed too.
 */
function deepUnmerge(
  target: SettingsJson,
  source: SettingsJson
): { result: SettingsJson; changed: boolean } {
  let changed = false;
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (!(key in result)) continue;

    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      // Recurse into nested objects
      const nested = deepUnmerge(
        targetValue as SettingsJson,
        sourceValue as SettingsJson
      );
      if (nested.changed) {
        changed = true;
        if (Object.keys(nested.result).length === 0) {
          delete result[key];
        } else {
          result[key] = nested.result;
        }
      }
    } else {
      // Leaf value — remove it
      delete result[key];
      changed = true;
    }
  }

  return { result, changed };
}

export async function uninstallSettings(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  if (agent !== "claude") return false;

  // Look up the registry item to get the settings content
  const item = await getItem(slug, "settings");
  if (!item) return false;

  let content: string;
  try {
    content = await getItemContent(item);
  } catch {
    return false;
  }

  const itemSettings = parseSettings(content);

  const settingsPath = getSettingsPath(scope, cwd);
  if (!(await exists(settingsPath))) return false;

  const currentSettings = await readJson<SettingsJson>(settingsPath);
  const { result, changed } = deepUnmerge(currentSettings, itemSettings);

  if (changed) {
    await writeJson(settingsPath, result);
  }

  return changed;
}

export async function getInstalledSettings(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  if (agent !== "claude") return [];

  const settingsPath = getSettingsPath(scope, cwd);
  if (!(await exists(settingsPath))) return [];

  // Settings don't have discrete "installed" items — can't detect by slug
  return [];
}

/**
 * Settings content handler implementing the ContentHandler interface.
 */
export const settingsHandler: ContentHandler = {
  type: "settings",

  async install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]> {
    return installSettings(item, agents, scope, method, force, cwd);
  },

  async uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean> {
    return uninstallSettings(slug, agent, scope, cwd);
  },

  async listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]> {
    return getInstalledSettings(agent, scope, cwd);
  },
};
