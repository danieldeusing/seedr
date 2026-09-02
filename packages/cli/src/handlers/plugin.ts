import { join, relative } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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
import { getEffectiveSourceRevision } from "../config/source.js";
import { CODING_AGENTS } from "../config/agents.js";
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
import { readJson } from "../utils/json.js";
import { assertValidSlug } from "../utils/slug.js";
import {
  getPluginId,
  pluginStoreFor,
  splitPluginId,
  type PluginJson,
  type PluginMutation,
  type PluginStore,
} from "./pluginStores.js";
import type { ContentHandler, InstallResult, PlannedChange } from "./types.js";

const SLUG_LABEL = "plugin slug";

/** The marketplace a plugin is filed under, validated as a path segment. */
function resolveMarketplaceName(item: RegistryItem): string {
  const marketplace = item.marketplace || item.author?.name || "seedr";
  assertSafePathSegment(marketplace, "plugin marketplace");
  return marketplace;
}

/** Identity read from a downloaded manifest, validated before it touches a path. */
function resolvePluginIdentity(
  item: RegistryItem,
  pluginJson: PluginJson
): { name: string; version: string } {
  const name = pluginJson.name || item.slug;
  const version = pluginJson.version || "1.0.0";
  assertSafePathSegment(name, "plugin name");
  assertSafePathSegment(version, "plugin version");
  return { name, version };
}

// ---------------------------------------------------------------------------
// Manifest resolution
// ---------------------------------------------------------------------------

/**
 * The agent's own `.<agent>-plugin/plugin.json` when the repository ships one,
 * otherwise `.claude-plugin/plugin.json`. Most plugins in the wild only ever
 * wrote the Claude manifest, so the fallback is what makes them installable
 * anywhere else at all.
 */
async function readManifestFromDir(dir: string, manifestPaths: readonly string[]): Promise<PluginJson> {
  for (const manifest of manifestPaths) {
    const path = join(dir, ...manifest.split("/"));
    if (await exists(path)) return readJson<PluginJson>(path);
  }
  // No manifest at all is not fatal: the identity then comes from the registry
  // entry's own slug and a default version, as it always has.
  return {};
}

/** The same preference order, but reading remotely one file at a time. */
async function readManifestForPlan(
  item: RegistryItem,
  manifestPaths: readonly string[]
): Promise<PluginJson> {
  const sourcePath = getItemSourcePath(item);
  if (sourcePath) return readManifestFromDir(sourcePath, manifestPaths);

  for (const manifest of manifestPaths) {
    try {
      return JSON.parse(await fetchItemFile(item, manifest)) as PluginJson;
    } catch {
      // Try the next manifest in the preference order.
    }
  }
  throw new Error(`No plugin manifest for "${item.slug}" (looked for ${manifestPaths.join(", ")})`);
}

// ---------------------------------------------------------------------------
// Staging and commit
// ---------------------------------------------------------------------------

/**
 * The per-install staging directory, inside the agent's own cache so the final
 * move is a same-filesystem rename. Only called for a store that keeps a tree.
 */
async function createStagingDir(cacheRoot: string, slug: string): Promise<string> {
  const tmpRoot = await resolveContained(cacheRoot, ".tmp");
  await mkdir(tmpRoot, { recursive: true });
  const staging = await mkdtemp(join(tmpRoot, `${slug}-`));
  return resolveContained(cacheRoot, relative(cacheRoot, staging));
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
 * The writes of a plugin install, undone in reverse order when a later one
 * fails: cache directory first, then each of the store's config mutations.
 * Every config file is restored byte-for-byte from a snapshot taken before its
 * write; the cache directory is removed. (A cache directory replaced under
 * `--force` is not restored — the user asked for it to be replaced.)
 */
async function commitInstall(
  contentPath: string | null,
  cachePath: string | null,
  mutations: PluginMutation[]
): Promise<void> {
  const undo: Array<() => Promise<void>> = [];

  try {
    if (contentPath && cachePath) {
      await removePathEntry(cachePath);
      await moveDirectory(contentPath, cachePath);
      undo.push(() => removePathEntry(cachePath).then(() => undefined));
    }

    for (const mutation of mutations) {
      const snapshot = await snapshotFile(mutation.path);
      await mutation.apply();
      undo.push(() => restoreFile(mutation.path, snapshot));
    }
  } catch (error) {
    await rollback(undo, error);
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

async function installPluginForAgent(
  item: RegistryItem,
  agent: CodingAgent,
  scope: InstallScope,
  _method: InstallMethod,
  force: boolean,
  cwd: string
): Promise<InstallResult> {
  const spinner = ora(`Installing ${item.name} for ${CODING_AGENTS[agent].name}...`).start();

  try {
    const store = pluginStoreFor(agent);
    assertValidSlug(item.slug, SLUG_LABEL);
    const marketplace = resolveMarketplaceName(item);

    // An agent that resolves the module itself gets no staged tree at all; its
    // identity still has to come from the manifest, read on its own.
    const cacheRoot = store.cacheRoot;
    const staging = cacheRoot ? await createStagingDir(cacheRoot, item.slug) : null;
    try {
      const contentPath = staging ? join(staging, "content") : null;
      const fetched = contentPath ? await stageContent(item, contentPath) : null;
      const pluginJson = contentPath
        ? await readManifestFromDir(contentPath, store.manifestPaths)
        : await readManifestForPlan(item, store.manifestPaths);

      const { name, version } = resolvePluginIdentity(item, pluginJson);
      if (contentPath && store.prepareTree) {
        await store.prepareTree(contentPath, { name, version, item });
      }
      const gitCommitSha = resolveGitCommitSha(item, fetched);
      const pluginId = getPluginId(name, marketplace);
      const cachePath = await store.cachePath(marketplace, name, version);

      const marketplaceMutations = store.ensureMarketplace
        ? await store.ensureMarketplace(marketplace, item)
        : [];
      const context = {
        item, marketplace, name, version, pluginId, cachePath, gitCommitSha, scope, cwd,
      };

      if (cachePath) await assertOverwritable(cachePath, force);
      await commitInstall(contentPath, cachePath, [
        ...marketplaceMutations,
        ...store.mutations(context),
      ]);

      spinner.succeed(brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`));
      return { agent, success: true, path: cachePath ?? "" };
    } finally {
      if (staging) await rm(staging, { recursive: true, force: true });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(chalk.red(`Failed to install for ${CODING_AGENTS[agent].name}: ${errorMsg}`));
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
    results.push(await installPluginForAgent(item, agent, scope, method, force, cwd));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Uninstall and listing
// ---------------------------------------------------------------------------

/**
 * Find the installed plugin id for a slug by exact `name@marketplace` match.
 * The marketplace comes from the registry item; when the item is unknown the
 * name must match exactly one installed id, otherwise nothing is touched.
 */
async function findInstalledPluginId(installed: string[], slug: string): Promise<string | null> {
  let registryMarketplace: string | null = null;
  try {
    const item = await getItem(slug, "plugin");
    if (item) registryMarketplace = resolveMarketplaceName(item);
  } catch {
    registryMarketplace = null;
  }

  if (registryMarketplace !== null) {
    const exact = getPluginId(slug, registryMarketplace);
    if (installed.includes(exact)) return exact;
    // Stores with no marketplace dimension record the bare name.
    return installed.includes(slug) ? slug : null;
  }

  const candidates = installed.filter((id) => (splitPluginId(id)?.name ?? id) === slug);
  return candidates.length === 1 ? candidates[0]! : null;
}

export async function uninstallPlugin(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  assertValidSlug(slug, SLUG_LABEL);

  let store: PluginStore;
  try {
    store = pluginStoreFor(agent);
  } catch {
    return false;
  }

  const installed = await store.listInstalled(scope, cwd);
  const pluginId = await findInstalledPluginId(installed, slug);
  if (!pluginId) return false;

  return store.remove(pluginId, scope, cwd);
}

export async function getInstalledPlugins(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  let store: PluginStore;
  try {
    store = pluginStoreFor(agent);
  } catch {
    return [];
  }
  // Callers match by slug, so report the name half of `name@marketplace`.
  const installed = await store.listInstalled(scope, cwd);
  return installed.map((pluginId) => splitPluginId(pluginId)?.name ?? pluginId);
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

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
    const store = pluginStoreFor(agent);
    assertValidSlug(item.slug, SLUG_LABEL);
    const marketplace = resolveMarketplaceName(item);
    const { name, version } = resolvePluginIdentity(
      item,
      await readManifestForPlan(item, store.manifestPaths)
    );
    const pluginId = getPluginId(name, marketplace);
    const cachePath = await store.cachePath(marketplace, name, version);

    // Fail here for anything the install would throw on, rather than printing a
    // plan and then throwing. A dry run that reports success for an impossible
    // install is worse than no dry run.
    resolveGitCommitSha(item, null);

    if (cachePath) {
      changes.push({
        agent,
        kind: await kindFor(cachePath),
        path: cachePath,
        detail: "plugin files (digest-verified download)",
      });
    }

    const marketplaceMutations = store.ensureMarketplace
      ? await store.ensureMarketplace(marketplace, item)
      : [];
    const context = {
      item, marketplace, name, version, pluginId, cachePath,
      gitCommitSha: resolveGitCommitSha(item, null),
      scope, cwd,
    };

    for (const mutation of [...marketplaceMutations, ...store.mutations(context)]) {
      changes.push({
        agent,
        kind: await kindFor(mutation.path),
        path: mutation.path,
        detail: store.userGlobal
          ? `${mutation.detail} — user-global, ${CODING_AGENTS[agent].name} has no project-scoped plugin store`
          : mutation.detail,
      });
      if (mutation.creates) {
        changes.push({ agent, kind: "create", ...mutation.creates });
      }
    }
  }

  return changes;
}

/**
 * Plugin content handler implementing the ContentHandler interface.
 */
export const pluginHandler: ContentHandler = {
  type: "plugin",
  honoursMethod: false,

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
