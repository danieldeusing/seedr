import { homedir } from "node:os";
import { join, relative } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import {
  getItem,
  getItemSourcePath,
  fetchItemToDestination,
  fetchItemFile,
  type FetchedItemContent,
} from "../config/registry.js";
import { getEffectiveSourceRevision, parseGitHubRepo } from "../config/source.js";
import { getSettingsPath, CODING_AGENTS } from "../config/agents.js";
import {
  assertOverwritable,
  assertSafePathSegment,
  copyDirectory,
  exists,
  moveDirectory,
  removePathEntry,
  resolveContained,
  restoreFile,
  snapshotFile,
} from "../utils/fs.js";
import { readJson, writeJson } from "../utils/json.js";
import { assertValidSlug } from "../utils/slug.js";
import type { ContentHandler, InstallResult, PlannedChange } from "./types.js";

const home = homedir();
const PLUGINS_DIR = join(home, ".claude", "plugins");
const PLUGINS_CACHE_DIR = join(PLUGINS_DIR, "cache");
const INSTALLED_PLUGINS_PATH = join(PLUGINS_DIR, "installed_plugins.json");
const KNOWN_MARKETPLACES_PATH = join(PLUGINS_DIR, "known_marketplaces.json");
const MARKETPLACES_DIR = join(PLUGINS_DIR, "marketplaces");
const PLUGIN_JSON_PATH = ".claude-plugin/plugin.json";
const CLAUDE_ONLY_ERROR = "Plugins are only supported for Claude Code";
const SLUG_LABEL = "plugin slug";

/** `owner/repo` as accepted into a `git clone` URL. */
const GITHUB_REPO_SLUG_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

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
 * Get the plugin identifier for the registry.
 * Format: <name>@<marketplace>
 */
function getPluginId(name: string, marketplace: string): string {
  return `${name}@${marketplace}`;
}

function splitPluginId(pluginId: string): { name: string; marketplace: string } | null {
  const at = pluginId.indexOf("@");
  if (at <= 0 || at === pluginId.length - 1) return null;
  return { name: pluginId.slice(0, at), marketplace: pluginId.slice(at + 1) };
}

/** The marketplace a plugin is filed under, validated as a path segment. */
function resolveMarketplaceName(item: RegistryItem): string {
  const marketplace = item.marketplace || item.author?.name || "seedr";
  assertSafePathSegment(marketplace, "plugin marketplace");
  return marketplace;
}

/** Identity read from a downloaded `plugin.json`, validated before it touches a path. */
function resolvePluginIdentity(item: RegistryItem, pluginJson: PluginJson): { name: string; version: string } {
  const name = pluginJson.name || item.slug;
  const version = pluginJson.version || "1.0.0";
  assertSafePathSegment(name, "plugin name");
  assertSafePathSegment(version, "plugin version");
  return { name, version };
}

/**
 * Extract a validated "owner/repo" from a GitHub URL; null for anything else.
 */
function extractGitHubRepo(url: string): string | null {
  const parsed = parseGitHubRepo(url);
  if (!parsed) return null;
  const slug = `${parsed.owner}/${parsed.repo}`;
  if (!GITHUB_REPO_SLUG_PATTERN.test(slug) || slug.includes("..")) return null;
  return slug;
}

function marketplaceRepoUrl(item: RegistryItem): string | undefined {
  return item.marketplaceRef?.url ?? item.externalUrl;
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

  const sourceUrl = marketplaceRepoUrl(item);
  const repo = sourceUrl ? extractGitHubRepo(sourceUrl) : null;
  if (!repo) return;

  const installLocation = await resolveContained(MARKETPLACES_DIR, marketplace);
  await mkdir(MARKETPLACES_DIR, { recursive: true });

  if (!(await exists(installLocation))) {
    const execFileAsync = promisify(execFile);
    await execFileAsync("git", [
      "clone",
      "--depth",
      "1",
      `https://github.com/${repo}.git`,
      installLocation,
    ]);
  }

  known[marketplace] = {
    source: { source: "github", repo },
    installLocation,
    lastUpdated: new Date().toISOString(),
  };

  await writeJson(KNOWN_MARKETPLACES_PATH, known);
}

/** Create the per-install staging directory under the cache's `.tmp`, proven contained. */
async function createStagingDir(slug: string): Promise<string> {
  const tmpRoot = await resolveContained(PLUGINS_CACHE_DIR, ".tmp");
  await mkdir(tmpRoot, { recursive: true });
  const staging = await mkdtemp(join(tmpRoot, `${slug}-`));
  return resolveContained(PLUGINS_CACHE_DIR, relative(PLUGINS_CACHE_DIR, staging));
}

/** Bring the plugin's files into `contentPath`: a local checkout is copied, anything else is downloaded and verified. */
async function stageContent(item: RegistryItem, contentPath: string): Promise<FetchedItemContent | null> {
  const sourcePath = getItemSourcePath(item);
  if (sourcePath) {
    await copyDirectory(sourcePath, contentPath);
    return null;
  }
  return fetchItemToDestination(item, contentPath);
}

function resolveGitCommitSha(item: RegistryItem, fetched: FetchedItemContent | null): string {
  const sha = fetched?.sourceRevision ?? getEffectiveSourceRevision(item);
  if (!sha) {
    throw new Error(
      `Cannot record a source revision for "${item.slug}": the registry entry has neither sourceRevision nor pluginSource.sha`
    );
  }
  return sha;
}

function isScopeEntry(entry: PluginInstallInfo, scope: InstallScope, cwd: string): boolean {
  return entry.scope === scope && (scope === "user" || entry.projectPath === cwd);
}

interface CommitParams {
  contentPath: string;
  cachePath: string;
  pluginId: string;
  version: string;
  gitCommitSha: string;
  scope: InstallScope;
  cwd: string;
}

/** Record the install in installed_plugins.json, replacing the entry for the same scope and project. */
async function writeInstalledEntry(params: CommitParams): Promise<void> {
  const { cachePath, pluginId, version, gitCommitSha, scope, cwd } = params;
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
    gitCommitSha,
  };
  const existingEntries = registry.plugins[pluginId] || [];
  registry.plugins[pluginId] = [
    ...existingEntries.filter((entry) => !isScopeEntry(entry, scope, cwd)),
    installInfo,
  ];
  await writeJson(INSTALLED_PLUGINS_PATH, registry);
}

async function enableInSettings(settingsPath: string, pluginId: string): Promise<void> {
  const settings = await readJson<SettingsJson>(settingsPath);
  settings.enabledPlugins = settings.enabledPlugins || {};
  settings.enabledPlugins[pluginId] = true;
  await writeJson(settingsPath, settings);
}

/** Run the undo steps in reverse; an undo that itself fails is reported, never hidden. */
async function rollback(undo: Array<() => Promise<void>>, error: unknown): Promise<never> {
  const failures: string[] = [];
  for (const step of undo.reverse()) {
    try {
      await step();
    } catch (undoError) {
      failures.push(undoError instanceof Error ? undoError.message : String(undoError));
    }
  }
  if (failures.length > 0) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message} (rollback incomplete: ${failures.join("; ")})`, { cause: error });
  }
  throw error;
}

/**
 * The three writes of a plugin install, undone in reverse order when a later
 * one fails: cache directory → installed_plugins.json → settings.json. The
 * JSON files are restored byte-for-byte from snapshots taken before each
 * write; the cache directory is removed. (A cache directory replaced under
 * `--force` is not restored — the user asked for it to be replaced.)
 */
async function commitInstall(params: CommitParams): Promise<void> {
  const { contentPath, cachePath, pluginId, scope, cwd } = params;
  const undo: Array<() => Promise<void>> = [];

  try {
    await removePathEntry(cachePath);
    await moveDirectory(contentPath, cachePath);
    undo.push(() => removePathEntry(cachePath).then(() => undefined));

    const registrySnapshot = await snapshotFile(INSTALLED_PLUGINS_PATH);
    await writeInstalledEntry(params);
    undo.push(() => restoreFile(INSTALLED_PLUGINS_PATH, registrySnapshot));

    const settingsPath = getSettingsPath(scope, cwd);
    const settingsSnapshot = await snapshotFile(settingsPath);
    await enableInSettings(settingsPath, pluginId);
    undo.push(() => restoreFile(settingsPath, settingsSnapshot));
  } catch (error) {
    await rollback(undo, error);
  }
}

async function installPluginForAgent(
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
    assertValidSlug(item.slug, SLUG_LABEL);
    const marketplace = resolveMarketplaceName(item);

    const staging = await createStagingDir(item.slug);
    try {
      const contentPath = join(staging, "content");
      const fetched = await stageContent(item, contentPath);

      const pluginJson = await readJson<PluginJson>(join(contentPath, ...PLUGIN_JSON_PATH.split("/")));
      const { name, version } = resolvePluginIdentity(item, pluginJson);
      const gitCommitSha = resolveGitCommitSha(item, fetched);
      const pluginId = getPluginId(name, marketplace);

      await ensureMarketplaceRegistered(marketplace, item);

      const cachePath = await resolveContained(PLUGINS_CACHE_DIR, marketplace, name, version);
      await assertOverwritable(cachePath, force);
      await commitInstall({ contentPath, cachePath, pluginId, version, gitCommitSha, scope, cwd });

      spinner.succeed(
        brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`)
      );
      return { agent, success: true, path: cachePath };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
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

/**
 * Find the installed plugin id for a slug by exact `name@marketplace` match.
 * The marketplace comes from the registry item; when the item is unknown the
 * name must match exactly one installed id, otherwise nothing is touched.
 */
async function findInstalledPluginId(
  registry: InstalledPluginsRegistry,
  slug: string
): Promise<string | null> {
  let registryMarketplace: string | null = null;
  try {
    const item = await getItem(slug, "plugin");
    if (item) registryMarketplace = resolveMarketplaceName(item);
  } catch {
    registryMarketplace = null;
  }

  if (registryMarketplace !== null) {
    const exact = getPluginId(slug, registryMarketplace);
    return exact in registry.plugins ? exact : null;
  }

  const candidates = Object.keys(registry.plugins).filter((id) => splitPluginId(id)?.name === slug);
  return candidates.length === 1 ? candidates[0]! : null;
}

/** Remove a cache directory nobody references any more — only when it provably lives inside the cache. */
async function removeOrphanedCache(installPath: string, registry: InstalledPluginsRegistry): Promise<void> {
  const stillReferenced = Object.values(registry.plugins).some((entries) =>
    entries.some((entry) => entry.installPath === installPath)
  );
  if (stillReferenced) return;

  let contained: string;
  try {
    contained = await resolveContained(PLUGINS_CACHE_DIR, installPath);
  } catch {
    return;
  }
  await removePathEntry(contained);
}

export async function uninstallPlugin(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  assertValidSlug(slug, SLUG_LABEL);
  if (agent !== "claude") return false;

  const registry = await readJson<InstalledPluginsRegistry>(INSTALLED_PLUGINS_PATH);
  if (!registry.plugins) return false;

  const pluginId = await findInstalledPluginId(registry, slug);
  if (!pluginId) return false;

  const entries = registry.plugins[pluginId] || [];
  const removedEntries = entries.filter((entry) => isScopeEntry(entry, scope, cwd));
  if (removedEntries.length === 0) return false;
  const remaining = entries.filter((entry) => !isScopeEntry(entry, scope, cwd));

  if (remaining.length === 0) {
    delete registry.plugins[pluginId];
  } else {
    registry.plugins[pluginId] = remaining;
  }
  await writeJson(INSTALLED_PLUGINS_PATH, registry);

  // Disable in settings.json
  const settingsPath = getSettingsPath(scope, cwd);
  const settings = await readJson<SettingsJson>(settingsPath);
  if (settings.enabledPlugins && pluginId in settings.enabledPlugins) {
    delete settings.enabledPlugins[pluginId];
    await writeJson(settingsPath, settings);
  }

  for (const installPath of new Set(removedEntries.map((entry) => entry.installPath))) {
    await removeOrphanedCache(installPath, registry);
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
    if (entries.some((entry) => isScopeEntry(entry, scope, cwd))) {
      // Return the slug (name part before @) so callers can match by slug
      installed.push(splitPluginId(pluginId)?.name ?? pluginId);
    }
  }

  return installed;
}

/** Read `plugin.json` for a plan: from the local checkout when present, otherwise a single (unverified, informational) remote read. */
async function readPluginJsonForPlan(item: RegistryItem): Promise<PluginJson> {
  const sourcePath = getItemSourcePath(item);
  if (sourcePath) {
    return readJson<PluginJson>(join(sourcePath, ...PLUGIN_JSON_PATH.split("/")));
  }
  return JSON.parse(await fetchItemFile(item, PLUGIN_JSON_PATH)) as PluginJson;
}

async function kindFor(path: string): Promise<PlannedChange["kind"]> {
  return (await exists(path)) ? "modify" : "create";
}

export async function planPlugin(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  _method: InstallMethod,
  cwd: string
): Promise<PlannedChange[]> {
  const changes: PlannedChange[] = [];
  for (const agent of agents) {
    if (agent !== "claude") throw new Error(CLAUDE_ONLY_ERROR);
    assertValidSlug(item.slug, SLUG_LABEL);
    const marketplace = resolveMarketplaceName(item);
    const { name, version } = resolvePluginIdentity(item, await readPluginJsonForPlan(item));
    const pluginId = getPluginId(name, marketplace);
    const cachePath = await resolveContained(PLUGINS_CACHE_DIR, marketplace, name, version);
    const settingsPath = getSettingsPath(scope, cwd);

    changes.push(
      { agent, kind: await kindFor(cachePath), path: cachePath, detail: "plugin files (digest-verified download)" },
      {
        agent,
        kind: await kindFor(INSTALLED_PLUGINS_PATH),
        path: INSTALLED_PLUGINS_PATH,
        detail: `plugins["${pluginId}"] entry for ${scope} scope`,
      }
    );

    const known = await readJson<Record<string, KnownMarketplaceEntry>>(KNOWN_MARKETPLACES_PATH);
    if (!known[marketplace]) {
      const sourceUrl = marketplaceRepoUrl(item);
      const repo = sourceUrl ? extractGitHubRepo(sourceUrl) : null;
      if (repo) {
        const cloneDir = await resolveContained(MARKETPLACES_DIR, marketplace);
        changes.push({ agent, kind: await kindFor(KNOWN_MARKETPLACES_PATH), path: KNOWN_MARKETPLACES_PATH, detail: `marketplace "${marketplace}"` });
        if (!(await exists(cloneDir))) {
          changes.push({ agent, kind: "create", path: cloneDir, detail: `git clone https://github.com/${repo}.git` });
        }
      }
    }

    changes.push({ agent, kind: await kindFor(settingsPath), path: settingsPath, detail: `enabledPlugins["${pluginId}"] = true` });
  }
  return changes;
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

  plan: planPlugin,
};
