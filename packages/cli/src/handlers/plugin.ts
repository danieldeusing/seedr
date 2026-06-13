import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItemSourcePath, fetchItemToDestination } from "../config/registry.js";
import { getSettingsPath, CODING_AGENTS } from "../config/agents.js";
import { installDirectory, assertOverwritable } from "../utils/fs.js";
import { readJson, writeJson } from "../utils/json.js";
import type { ContentHandler, InstallResult } from "./types.js";

const home = homedir();
const PLUGINS_CACHE_DIR = join(home, ".claude/plugins/cache");
const INSTALLED_PLUGINS_PATH = join(home, ".claude/plugins/installed_plugins.json");
const KNOWN_MARKETPLACES_PATH = join(home, ".claude/plugins/known_marketplaces.json");
const MARKETPLACES_DIR = join(home, ".claude/plugins/marketplaces");

interface PluginInstallInfo {
  scope: InstallScope;
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha: string;
}

interface InstalledPluginsRegistry {
  version?: number;
  plugins: Record<string, PluginInstallInfo[]>;
}

interface PluginJson {
  name?: string;
  version?: string;
}

interface KnownMarketplaceEntry {
  source: { source: string; repo?: string; url?: string };
  installLocation: string;
  lastUpdated: string;
}

interface SettingsJson {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
}

/**
 * Get the cache path for a plugin.
 * Format: ~/.claude/plugins/cache/<marketplace>/<name>/<version>/
 */
function getPluginCachePath(
  marketplace: string,
  name: string,
  version: string
): string {
  return join(PLUGINS_CACHE_DIR, marketplace, name, version);
}

/**
 * Get the plugin identifier for the registry.
 * Format: <name>@<marketplace>
 */
function getPluginId(name: string, marketplace: string): string {
  return `${name}@${marketplace}`;
}

/**
 * Extract "owner/repo" from a GitHub URL.
 */
function extractGitHubRepo(url: string): string | null {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match?.[1]?.replace(/\.git$/, "") ?? null;
}

/**
 * Ensure the plugin's marketplace is registered in known_marketplaces.json
 * and cloned to ~/.claude/plugins/marketplaces/. Claude Code requires this
 * for the plugin to be recognized (otherwise it reports "orphaned").
 */
async function ensureMarketplaceRegistered(
  marketplace: string,
  item: RegistryItem
): Promise<void> {
  const known = await readJson<Record<string, KnownMarketplaceEntry>>(
    KNOWN_MARKETPLACES_PATH
  );

  if (known[marketplace]) return;

  const repo = item.externalUrl ? extractGitHubRepo(item.externalUrl) : null;
  if (!repo) return;

  const installLocation = join(MARKETPLACES_DIR, marketplace);
  const execFileAsync = promisify(execFile);

  await mkdir(MARKETPLACES_DIR, { recursive: true });

  await execFileAsync("git", [
    "clone",
    "--depth",
    "1",
    `https://github.com/${repo}.git`,
    installLocation,
  ]);

  known[marketplace] = {
    source: { source: "github", repo },
    installLocation,
    lastUpdated: new Date().toISOString(),
  };

  await writeJson(KNOWN_MARKETPLACES_PATH, known);
}

async function installPluginForAgent(
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
    if (agent !== "claude") {
      throw new Error("Plugins are only supported for Claude Code");
    }

    // Step 1: Fetch to temporary cache location
    const tmpPath = join(PLUGINS_CACHE_DIR, ".tmp", item.slug);
    const sourcePath = getItemSourcePath(item);
    if (sourcePath) {
      await installDirectory(sourcePath, tmpPath, method);
    } else {
      await fetchItemToDestination(item, tmpPath);
    }

    // Step 2: Read plugin metadata from fetched content
    const pluginJson = await readJson<PluginJson>(
      join(tmpPath, ".claude-plugin", "plugin.json")
    );

    const marketplace = item.marketplace || item.author?.name || "seedr";
    const pluginName = pluginJson.name || item.slug;
    const version = pluginJson.version || "1.0.0";
    const pluginId = getPluginId(pluginName, marketplace);

    // Step 2b: Ensure marketplace is registered (non-fatal if it fails)
    await ensureMarketplaceRegistered(marketplace, item);

    // Step 3: Move to final cache path
    const cachePath = getPluginCachePath(marketplace, pluginName, version);
    try {
      await assertOverwritable(cachePath, force);
    } catch (error) {
      await rm(tmpPath, { recursive: true, force: true });
      throw error;
    }
    await installDirectory(tmpPath, cachePath, "copy");
    await rm(tmpPath, { recursive: true, force: true });

    // Step 4: Update installed_plugins.json
    const now = new Date().toISOString();
    const registry = await readJson<InstalledPluginsRegistry>(INSTALLED_PLUGINS_PATH);
    registry.version = registry.version || 2;
    registry.plugins = registry.plugins || {};

    const installInfo: PluginInstallInfo = {
      scope,
      ...(scope !== "user" ? { projectPath: cwd } : {}),
      installPath: cachePath,
      version,
      installedAt: now,
      lastUpdated: now,
      gitCommitSha: "",
    };

    // Add or update the plugin entry
    const existingEntries = registry.plugins[pluginId] || [];
    const filteredEntries = existingEntries.filter(
      (e) =>
        !(e.scope === scope && (scope === "user" || e.projectPath === cwd))
    );
    registry.plugins[pluginId] = [...filteredEntries, installInfo];

    await writeJson(INSTALLED_PLUGINS_PATH, registry);

    // Step 5: Enable in settings.json
    const settingsPath = getSettingsPath(scope, cwd);
    const settings = await readJson<SettingsJson>(settingsPath);
    settings.enabledPlugins = settings.enabledPlugins || {};
    settings.enabledPlugins[pluginId] = true;
    await writeJson(settingsPath, settings);

    spinner.succeed(
      brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`)
    );
    return { agent, success: true, path: cachePath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(
      chalk.red(`Failed to install for ${CODING_AGENTS[agent].name}: ${errorMsg}`)
    );
    return { agent, success: false, path: "", error: errorMsg };
  }
}

export async function installPlugin(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string = process.cwd()
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  for (const agent of agents) {
    const result = await installPluginForAgent(item, agent, scope, method, force, cwd);
    results.push(result);
  }

  return results;
}

export async function uninstallPlugin(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  if (agent !== "claude") return false;

  // Find the plugin in the registry
  const registry = await readJson<InstalledPluginsRegistry>(INSTALLED_PLUGINS_PATH);
  if (!registry.plugins) return false;

  // Look for any plugin matching the slug
  const matchingKey = Object.keys(registry.plugins).find((key) =>
    key.startsWith(`${slug}@`)
  );
  if (!matchingKey) return false;

  // Remove from installed_plugins.json
  const entries = registry.plugins[matchingKey] || [];
  const filteredEntries = entries.filter(
    (e) => !(e.scope === scope && (scope === "user" || e.projectPath === cwd))
  );

  if (filteredEntries.length === 0) {
    delete registry.plugins[matchingKey];
  } else {
    registry.plugins[matchingKey] = filteredEntries;
  }

  await writeJson(INSTALLED_PLUGINS_PATH, registry);

  // Disable in settings.json
  const settingsPath = getSettingsPath(scope, cwd);
  const settings = await readJson<SettingsJson>(settingsPath);
  if (settings.enabledPlugins && matchingKey in settings.enabledPlugins) {
    delete settings.enabledPlugins[matchingKey];
    await writeJson(settingsPath, settings);
  }

  return true;
}

export async function getInstalledPlugins(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  if (agent !== "claude") return [];

  const registry = await readJson<InstalledPluginsRegistry>(INSTALLED_PLUGINS_PATH);
  if (!registry.plugins) return [];

  const installed: string[] = [];
  for (const [pluginId, entries] of Object.entries(registry.plugins)) {
    for (const entry of entries) {
      if (
        entry.scope === scope &&
        (scope === "user" || entry.projectPath === cwd)
      ) {
        // Return the slug (name part before @) so callers can match by slug
        const slug = pluginId.split("@")[0] || pluginId;
        installed.push(slug);
        break;
      }
    }
  }

  return installed;
}

/**
 * Plugin content handler implementing the ContentHandler interface.
 */
export const pluginHandler: ContentHandler = {
  type: "plugin",

  async install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]> {
    return installPlugin(item, agents, scope, method, force, cwd);
  },

  async uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean> {
    return uninstallPlugin(slug, agent, scope, cwd);
  },

  async listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]> {
    return getInstalledPlugins(agent, scope, cwd);
  },
};
