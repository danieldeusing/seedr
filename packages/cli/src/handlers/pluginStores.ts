import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CodingAgent, InstallScope } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { canonicalAgent, isFirstParty } from "@seedr/registry-ops/pure";
import {
  claudeUserRoot,
  codexUserRoot,
  copilotUserRoot,
  openCodeUserConfigDir,
  getSettingsPath,
  CODING_AGENTS,
} from "../config/agents.js";
import { isTypeSupported } from "../config/compatibility.js";
import { getEffectiveSourceRevision, parseGitHubRepo } from "../config/source.js";
import { exists, removePathEntry, resolveContained } from "../utils/fs.js";
import { readJson, writeJson } from "../utils/json.js";
import { removeTomlTables, upsertTomlTables, type TomlTableSpec } from "../utils/toml.js";

const home = homedir();

/**
 * The manifest every plugin in the wild ships. Each agent prefers its own
 * `.<agent>-plugin/plugin.json` when the repository carries one and falls back
 * to this, because most plugins only ever wrote the Claude manifest — refusing
 * those everywhere but Claude would defeat the point of multi-agent support.
 */
export const CLAUDE_MANIFEST = ".claude-plugin/plugin.json";

export interface PluginJson {
  name?: string;
  version?: string;
}

/** One config file write an install performs, snapshot and undone as a unit. */
export interface PluginMutation {
  path: string;
  /** Shown by `--dry-run`; describes the edit, not the file. */
  detail: string;
  apply: () => Promise<void>;
  /**
   * A directory `apply` also brings into being — a marketplace clone. Reported
   * by the plan so a dry run names it, but not snapshotted: a cloned
   * repository is re-cloned rather than restored.
   */
  creates?: { path: string; detail: string };
}

export interface InstallContext {
  item: RegistryItem;
  marketplace: string;
  name: string;
  version: string;
  /** `<name>@<marketplace>`, the id every marketplace-style agent keys on. */
  pluginId: string;
  /** Where the tree was placed, or null for an agent that resolves the module itself. */
  cachePath: string | null;
  /**
   * The commit the content was taken from. Absent for a first-party plugin,
   * whose content is the registry's own and pinned to no repository — Claude's
   * own directory installs record none either.
   */
  gitCommitSha: string | undefined;
  scope: InstallScope;
  cwd: string;
}

/**
 * What one agent's plugin system needs, reduced to the parts that actually
 * differ. Everything before the writes — slug validation, staging, content
 * fetch, manifest read, revision resolution — is shared by the handler.
 */
export interface PluginStore {
  /** Manifest preference, most specific first; always ends in `CLAUDE_MANIFEST`. */
  manifestPaths: readonly string[];
  /**
   * Root the plugin trees live under, and where staging happens so the final
   * move stays on one filesystem. `null` for an agent that resolves the module
   * itself, which means seedr stages no tree at all.
   */
  cacheRoot: string | null;
  /**
   * Whether a first-party plugin — content held by the registry itself, with
   * no git marketplace anywhere — can be installed here. Claude and Copilot
   * both accept a marketplace that is a directory, OpenCode loads a plugin
   * from a path, Antigravity files plugins by name; Codex knows only git
   * marketplaces and is refused rather than left with a dangling entry.
   */
  firstParty: boolean;
  /**
   * Where a first-party plugin's tree is staged and lands, for a store that
   * keeps no tree otherwise because the agent resolves remote modules itself
   * (OpenCode). Ignored when `cacheRoot` is set.
   */
  firstPartyCacheRoot?: string;
  /**
   * Where the plugin tree lands. `null` means the agent installs the module
   * itself from a URL and seedr writes only configuration (OpenCode).
   */
  cachePath: (marketplace: string, name: string, version: string, item: RegistryItem) => Promise<string | null>;
  /**
   * Register the marketplace this plugin is filed under, when the agent has
   * that concept. `cachePath` is where the tree lands, which for a first-party
   * plugin is the marketplace itself.
   */
  ensureMarketplace?: (marketplace: string, item: RegistryItem, cachePath: string | null) => Promise<PluginMutation[]>;
  /**
   * Shape the staged tree before it is moved into place, for an agent whose
   * discovery needs a marker the source repository does not carry.
   */
  prepareTree?: (
    contentPath: string,
    context: { name: string; version: string; marketplace: string; item: RegistryItem }
  ) => Promise<void>;
  /** The config writes, in the order they should be applied. */
  mutations: (context: InstallContext) => PluginMutation[];
  listInstalled: (scope: InstallScope, cwd: string) => Promise<string[]>;
  remove: (pluginId: string, scope: InstallScope, cwd: string) => Promise<boolean>;
  /**
   * True when the agent keeps one global plugin store with no project-scoped
   * equivalent, so `--scope project` still writes the user-level files. The
   * plan says so out loud rather than pretending the scope was honoured.
   */
  userGlobal: boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function readTextOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text, "utf-8");
}

/** `<name>@<marketplace>`, the id Claude, Copilot and Codex all key their enable maps on. */
export function getPluginId(name: string, marketplace: string): string {
  return `${name}@${marketplace}`;
}

export function splitPluginId(pluginId: string): { name: string; marketplace: string } | null {
  const at = pluginId.indexOf("@");
  if (at <= 0 || at === pluginId.length - 1) return null;
  return { name: pluginId.slice(0, at), marketplace: pluginId.slice(at + 1) };
}

/**
 * The agent's own manifest first, the Claude one as the fallback every plugin has.
 *
 * Only name a per-agent manifest that plugins in the wild actually ship —
 * `.codex-plugin/plugin.json` is one, and superpowers carries it. Inventing
 * `.copilot-plugin/` or `.antigravity-plugin/` on the assumption the vendor
 * will one day use that spelling is the guessing this repo refuses elsewhere.
 */
function manifestsFor(ownManifest?: string): readonly string[] {
  return ownManifest ? [ownManifest, CLAUDE_MANIFEST] : [CLAUDE_MANIFEST];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface SelfMarketplace {
  name?: string;
  owner?: unknown;
  description?: string;
  plugins?: unknown[];
  [key: string]: unknown;
}

/** The marketplace manifest every agent reads. Created when the tree ships none. */
const CLAUDE_SELF_MARKETPLACE = join(".claude-plugin", "marketplace.json");

/**
 * Copilot's own marketplace manifest. It takes precedence over the Claude one
 * where a tree ships both, so it has to be aligned too — but it is never
 * created, because a tree that ships only the Claude manifest is read from that
 * one and gaining a second, sparser manifest would change which keys Copilot
 * sees (`skills`, `commands`, `hooks` live per plugin in this file).
 */
const COPILOT_SELF_MARKETPLACE = join(".github", "plugin", "marketplace.json");

/** Align one marketplace manifest: its name to `marketplace`, its list to contain `name`. */
async function alignSelfMarketplace(path: string, marketplace: string, name: string, item: RegistryItem): Promise<void> {
  const existing = (await exists(path)) ? await readJson<SelfMarketplace>(path) : {};
  const plugins = Array.isArray(existing.plugins) ? existing.plugins : [];
  const listed = plugins.some((entry) => isRecord(entry) && entry.name === name);
  const description = item.description ? { description: item.description } : {};
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, {
    ...existing,
    name: marketplace,
    owner: existing.owner ?? { name: item.author?.name ?? "seedr" },
    ...(existing.description === undefined ? description : {}),
    plugins: listed ? plugins : [...plugins, { name, source: "./", ...description }],
  });
}

/**
 * The installed tree becomes its own marketplace: the manifest names the
 * marketplace and lists the plugin at `./` — exactly the directory that `claude
 * plugin marketplace add <dir>` and `copilot plugin marketplace add <dir>`
 * accept, and the source both record as `{"source":"directory","path":…}`.
 *
 * A marketplace file the tree already ships is kept and only aligned: its name
 * to the marketplace the plugin is installed under, because that name is the
 * key both agents file the plugin by, and its list to contain the plugin.
 *
 * `alsoAlign` names further manifests to keep in step — aligned only where the
 * tree already ships them, never created.
 */
async function ensureSelfMarketplace(
  contentPath: string,
  marketplace: string,
  name: string,
  item: RegistryItem,
  alsoAlign: readonly string[] = []
): Promise<void> {
  await alignSelfMarketplace(join(contentPath, CLAUDE_SELF_MARKETPLACE), marketplace, name, item);
  for (const relative of alsoAlign) {
    const path = join(contentPath, relative);
    if (await exists(path)) await alignSelfMarketplace(path, marketplace, name, item);
  }
}

// ---------------------------------------------------------------------------
// Claude Code — ~/.claude/plugins
// ---------------------------------------------------------------------------

const CLAUDE_PLUGINS_DIR = join(claudeUserRoot(), "plugins");
export const CLAUDE_CACHE_DIR = join(CLAUDE_PLUGINS_DIR, "cache");
export const CLAUDE_INSTALLED_PATH = join(CLAUDE_PLUGINS_DIR, "installed_plugins.json");
export const CLAUDE_KNOWN_MARKETPLACES_PATH = join(CLAUDE_PLUGINS_DIR, "known_marketplaces.json");
export const CLAUDE_MARKETPLACES_DIR = join(CLAUDE_PLUGINS_DIR, "marketplaces");

export interface PluginInstallInfo {
  scope: InstallScope;
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  /** Absent for a plugin installed from a directory, as Claude itself records those. */
  gitCommitSha?: string;
}

interface KnownMarketplaceEntry {
  source: { source: string; repo?: string; url?: string; path?: string };
  installLocation: string;
  lastUpdated: string;
}

export interface InstalledPluginsRegistry {
  version?: number;
  plugins: Record<string, PluginInstallInfo[]>;
}

interface EnabledPluginsFile {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
}

export function isScopeEntry(entry: PluginInstallInfo, scope: InstallScope, cwd: string): boolean {
  return entry.scope === scope && (scope === "user" || entry.projectPath === cwd);
}

/** Set `enabledPlugins[<id>]` in a JSON settings file that may hold unrelated keys. */
async function enableInJsonSettings(path: string, pluginId: string): Promise<void> {
  const settings = await readJson<EnabledPluginsFile>(path);
  settings.enabledPlugins = settings.enabledPlugins || {};
  settings.enabledPlugins[pluginId] = true;
  await writeJson(path, settings);
}

async function disableInJsonSettings(path: string, pluginId: string): Promise<boolean> {
  const settings = await readJson<EnabledPluginsFile>(path);
  if (!settings.enabledPlugins || !(pluginId in settings.enabledPlugins)) return false;
  delete settings.enabledPlugins[pluginId];
  await writeJson(path, settings);
  return true;
}

const claudeStore: PluginStore = {
  manifestPaths: manifestsFor(),
  userGlobal: false,
  firstParty: true,
  cacheRoot: CLAUDE_CACHE_DIR,

  cachePath: (marketplace, name, version) =>
    resolveContained(CLAUDE_CACHE_DIR, marketplace, name, version),

  async prepareTree(contentPath, { name, marketplace, item }) {
    if (isFirstParty(item.sourceType)) await ensureSelfMarketplace(contentPath, marketplace, name, item);
  },

  /**
   * Claude Code reports a plugin as "orphaned" unless its marketplace is both
   * recorded and cloned, so this is the one store that fetches a second
   * repository. The other agents only record the source.
   *
   * A first-party plugin has no repository: its installed tree is the
   * marketplace (see `ensureSelfMarketplace`), recorded as the `directory`
   * source Claude writes for `claude plugin marketplace add <dir>`. Always
   * upserted, because the path carries the version and moves with it.
   */
  async ensureMarketplace(marketplace, item, cachePath) {
    if (isFirstParty(item.sourceType)) {
      if (!cachePath) return [];
      return [
        {
          path: CLAUDE_KNOWN_MARKETPLACES_PATH,
          detail: `marketplace "${marketplace}" from directory ${cachePath}`,
          apply: async () => {
            const current = await readJson<Record<string, KnownMarketplaceEntry>>(CLAUDE_KNOWN_MARKETPLACES_PATH);
            current[marketplace] = {
              source: { source: "directory", path: cachePath },
              installLocation: cachePath,
              lastUpdated: new Date().toISOString(),
            };
            await writeJson(CLAUDE_KNOWN_MARKETPLACES_PATH, current);
          },
        },
      ];
    }
    const known = await readJson<Record<string, KnownMarketplaceEntry>>(CLAUDE_KNOWN_MARKETPLACES_PATH);
    if (known[marketplace]) return [];
    const repo = marketplaceRepo(item);
    if (!repo) return [];
    const installLocation = await resolveContained(CLAUDE_MARKETPLACES_DIR, marketplace);
    const alreadyCloned = await exists(installLocation);
    return [
      {
        path: CLAUDE_KNOWN_MARKETPLACES_PATH,
        detail: `marketplace "${marketplace}"`,
        ...(alreadyCloned
          ? {}
          : {
              creates: {
                path: installLocation,
                detail: `git clone https://github.com/${repo}.git`,
              },
            }),
        apply: async () => {
          await mkdir(CLAUDE_MARKETPLACES_DIR, { recursive: true });
          if (!(await exists(installLocation))) {
            await promisify(execFile)("git", [
              "clone",
              "--depth",
              "1",
              `https://github.com/${repo}.git`,
              installLocation,
            ]);
          }
          const current = await readJson<Record<string, KnownMarketplaceEntry>>(
            CLAUDE_KNOWN_MARKETPLACES_PATH
          );
          current[marketplace] = {
            source: { source: "github", repo },
            installLocation,
            lastUpdated: new Date().toISOString(),
          };
          await writeJson(CLAUDE_KNOWN_MARKETPLACES_PATH, current);
        },
      },
    ];
  },

  mutations: (context) => [
    {
      path: CLAUDE_INSTALLED_PATH,
      detail: `plugins["${context.pluginId}"] entry for ${context.scope} scope`,
      apply: async () => {
        const now = new Date().toISOString();
        const registry = await readJson<InstalledPluginsRegistry>(CLAUDE_INSTALLED_PATH);
        registry.version = registry.version || 2;
        registry.plugins = registry.plugins || {};
        const entry: PluginInstallInfo = {
          scope: context.scope,
          ...(context.scope !== "user" ? { projectPath: context.cwd } : {}),
          installPath: context.cachePath ?? "",
          version: context.version,
          installedAt: now,
          lastUpdated: now,
          ...(context.gitCommitSha !== undefined ? { gitCommitSha: context.gitCommitSha } : {}),
        };
        const existing = registry.plugins[context.pluginId] || [];
        registry.plugins[context.pluginId] = [
          ...existing.filter((candidate) => !isScopeEntry(candidate, context.scope, context.cwd)),
          entry,
        ];
        await writeJson(CLAUDE_INSTALLED_PATH, registry);
      },
    },
    {
      path: getSettingsPath(context.scope, context.cwd),
      detail: `enabledPlugins["${context.pluginId}"] = true`,
      apply: () => enableInJsonSettings(getSettingsPath(context.scope, context.cwd), context.pluginId),
    },
  ],

  async listInstalled(scope, cwd) {
    const registry = await readJson<InstalledPluginsRegistry>(CLAUDE_INSTALLED_PATH);
    if (!registry.plugins) return [];
    return Object.entries(registry.plugins)
      .filter(([, entries]) => entries.some((entry) => isScopeEntry(entry, scope, cwd)))
      .map(([pluginId]) => pluginId);
  },

  async remove(pluginId, scope, cwd) {
    const registry = await readJson<InstalledPluginsRegistry>(CLAUDE_INSTALLED_PATH);
    if (!registry.plugins?.[pluginId]) return false;
    const entries = registry.plugins[pluginId];
    const removed = entries.filter((entry) => isScopeEntry(entry, scope, cwd));
    if (removed.length === 0) return false;
    const remaining = entries.filter((entry) => !isScopeEntry(entry, scope, cwd));
    if (remaining.length === 0) delete registry.plugins[pluginId];
    else registry.plugins[pluginId] = remaining;
    await writeJson(CLAUDE_INSTALLED_PATH, registry);
    await disableInJsonSettings(getSettingsPath(scope, cwd), pluginId);

    for (const installPath of new Set(removed.map((entry) => entry.installPath))) {
      const stillUsed = Object.values(registry.plugins).some((list) =>
        list.some((entry) => entry.installPath === installPath)
      );
      if (stillUsed || installPath === "") continue;
      try {
        await removePathEntry(await resolveContained(CLAUDE_CACHE_DIR, installPath));
      } catch {
        // Outside the cache: not ours to delete.
        continue;
      }
      // A first-party plugin's marketplace IS that directory; with the tree
      // gone the entry would point at nothing and Claude would report it broken.
      const marketplace = splitPluginId(pluginId)?.marketplace;
      const known = await readJson<Record<string, KnownMarketplaceEntry>>(CLAUDE_KNOWN_MARKETPLACES_PATH);
      if (marketplace && known[marketplace]?.source.source === "directory" && known[marketplace].source.path === installPath) {
        delete known[marketplace];
        await writeJson(CLAUDE_KNOWN_MARKETPLACES_PATH, known);
      }
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// GitHub Copilot CLI — ~/.copilot
// ---------------------------------------------------------------------------

const COPILOT_DIR = copilotUserRoot();
export const COPILOT_SETTINGS_PATH = join(COPILOT_DIR, "settings.json");
export const COPILOT_PLUGINS_DIR = join(COPILOT_DIR, "installed-plugins");

interface CopilotSettings extends EnabledPluginsFile {
  extraKnownMarketplaces?: Record<string, { source: { source: string; repo?: string; url?: string; path?: string } }>;
}

const copilotStore: PluginStore = {
  manifestPaths: manifestsFor(),
  userGlobal: true,
  firstParty: true,
  cacheRoot: COPILOT_PLUGINS_DIR,

  cachePath: (marketplace, name) => resolveContained(COPILOT_PLUGINS_DIR, marketplace, name),

  /**
   * Every plugin's installed tree becomes its own marketplace here, not just a
   * first-party one — see `ensureMarketplace` for why. Copilot's own manifest
   * wins over the Claude one where a tree ships both, so both are aligned.
   */
  async prepareTree(contentPath, { name, marketplace, item }) {
    await ensureSelfMarketplace(contentPath, marketplace, name, item, [COPILOT_SELF_MARKETPLACE]);
  },

  /**
   * The installed tree is the marketplace, recorded the way `copilot plugin
   * marketplace add <dir>` records one: a `directory` source. Direct installs
   * from a path exist too, but Copilot 1.0.80 announces them as deprecated in
   * favour of `plugin@marketplace`, which this is.
   *
   * This is not only the first-party path. Pointing Copilot at the upstream
   * repository instead leaves the plugin uninstalled and says nothing: Copilot
   * fetches that marketplace and validates it whole, and Anthropic's
   * marketplaces — which every mirrored item names — fail that validation
   * outright (object-form `source` values, descriptions past 1024 characters),
   * so no plugin from them can be installed. The tree seedr has already
   * downloaded and digest-verified is a marketplace of exactly one plugin at
   * the pinned revision, which sidesteps the upstream file and is the only
   * shape that carries the pin into Copilot at all.
   */
  async ensureMarketplace(marketplace, item, cachePath) {
    if (cachePath) {
      return [
        {
          path: COPILOT_SETTINGS_PATH,
          detail: `extraKnownMarketplaces["${marketplace}"] = directory ${cachePath}`,
          apply: async () => {
            const current = await readJson<CopilotSettings>(COPILOT_SETTINGS_PATH);
            current.extraKnownMarketplaces = current.extraKnownMarketplaces || {};
            current.extraKnownMarketplaces[marketplace] = { source: { source: "directory", path: cachePath } };
            await writeJson(COPILOT_SETTINGS_PATH, current);
          },
        },
      ];
    }
    // No tree to point at (a plugin installed by reference only): the
    // repository is all Copilot can be told about.
    const repo = marketplaceRepo(item);
    if (!repo) return [];
    const settings = await readJson<CopilotSettings>(COPILOT_SETTINGS_PATH);
    if (settings.extraKnownMarketplaces?.[marketplace]) return [];
    return [
      {
        path: COPILOT_SETTINGS_PATH,
        detail: `extraKnownMarketplaces["${marketplace}"] = ${repo}`,
        apply: async () => {
          const current = await readJson<CopilotSettings>(COPILOT_SETTINGS_PATH);
          current.extraKnownMarketplaces = current.extraKnownMarketplaces || {};
          current.extraKnownMarketplaces[marketplace] = { source: { source: "github", repo } };
          await writeJson(COPILOT_SETTINGS_PATH, current);
        },
      },
    ];
  },

  mutations: (context) => [
    {
      path: COPILOT_SETTINGS_PATH,
      detail: `enabledPlugins["${context.pluginId}"] = true`,
      apply: () => enableInJsonSettings(COPILOT_SETTINGS_PATH, context.pluginId),
    },
  ],

  async listInstalled() {
    const settings = await readJson<CopilotSettings>(COPILOT_SETTINGS_PATH);
    return Object.entries(settings.enabledPlugins || {})
      .filter(([, enabled]) => enabled)
      .map(([pluginId]) => pluginId);
  },

  async remove(pluginId) {
    const disabled = await disableInJsonSettings(COPILOT_SETTINGS_PATH, pluginId);
    if (!disabled) return false;
    const split = splitPluginId(pluginId);
    if (split) {
      let tree: string;
      try {
        tree = await resolveContained(COPILOT_PLUGINS_DIR, split.marketplace, split.name);
        await removePathEntry(tree);
      } catch {
        // Outside the store: not ours to delete.
        return true;
      }
      // A first-party plugin's marketplace IS that tree; drop the entry with it.
      const settings = await readJson<CopilotSettings>(COPILOT_SETTINGS_PATH);
      const marketplace = settings.extraKnownMarketplaces?.[split.marketplace];
      if (marketplace?.source.source === "directory" && marketplace.source.path === tree) {
        delete settings.extraKnownMarketplaces![split.marketplace];
        await writeJson(COPILOT_SETTINGS_PATH, settings);
      }
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// OpenAI Codex CLI — ~/.codex/config.toml
// ---------------------------------------------------------------------------

const CODEX_DIR = codexUserRoot();
export const CODEX_CONFIG_PATH = join(CODEX_DIR, "config.toml");
export const CODEX_CACHE_DIR = join(CODEX_DIR, "plugins", "cache");

/** Codex `config.toml` → `[marketplaces.<name>]`, git-sourced. */
export function toCodexMarketplaceTable(marketplace: string, url: string, revision?: string): TomlTableSpec {
  return {
    keyPath: ["marketplaces", marketplace],
    entries: {
      source_type: "git",
      source: url,
      ...(revision ? { last_revision: revision } : {}),
      last_updated: new Date().toISOString(),
    },
  };
}

/** Codex `config.toml` → `[plugins."<name>@<marketplace>"]`. */
export function toCodexPluginTable(pluginId: string): TomlTableSpec {
  return { keyPath: ["plugins", pluginId], entries: { enabled: true } };
}

/**
 * `upsertTomlTables` replaces everything at or below `prefix`, so the prefix
 * must be the table's own key path — an empty one would match the whole
 * document and drop every other table in it.
 */
async function upsertCodex(table: TomlTableSpec): Promise<void> {
  const text = await readTextOrEmpty(CODEX_CONFIG_PATH);
  await writeText(CODEX_CONFIG_PATH, upsertTomlTables(text, table.keyPath, [table]));
}

const codexStore: PluginStore = {
  manifestPaths: manifestsFor(".codex-plugin/plugin.json"),
  userGlobal: true,
  // `[marketplaces.<name>]` is git-sourced and nothing else has been observed.
  firstParty: false,
  cacheRoot: CODEX_CACHE_DIR,

  // Real cache entries on disk are <marketplace>/<name>/<version> — e.g.
  // claude-plugins-official/claude-code-setup/1.0.0. Dropping the version
  // segment writes a tree Codex does not look in.
  cachePath: (marketplace, name, version) =>
    resolveContained(CODEX_CACHE_DIR, marketplace, name, version),

  async ensureMarketplace(marketplace, item) {
    const repo = marketplaceRepo(item);
    if (!repo) return [];
    const url = `https://github.com/${repo}.git`;
    return [
      {
        path: CODEX_CONFIG_PATH,
        detail: `[marketplaces.${marketplace}] source = "${url}"`,
        apply: () =>
          upsertCodex(toCodexMarketplaceTable(marketplace, url, getEffectiveSourceRevision(item) ?? undefined)),
      },
    ];
  },

  mutations: (context) => [
    {
      path: CODEX_CONFIG_PATH,
      detail: `[plugins."${context.pluginId}"] enabled = true`,
      apply: () => upsertCodex(toCodexPluginTable(context.pluginId)),
    },
  ],

  async listInstalled() {
    const text = await readTextOrEmpty(CODEX_CONFIG_PATH);
    const ids: string[] = [];
    for (const match of text.matchAll(/^\[plugins\."([^"]+)"\]/gm)) {
      if (match[1]) ids.push(match[1]);
    }
    return ids;
  },

  async remove(pluginId) {
    const text = await readTextOrEmpty(CODEX_CONFIG_PATH);
    const { text: next, removed } = removeTomlTables(text, ["plugins", pluginId]);
    if (!removed) return false;
    await writeText(CODEX_CONFIG_PATH, next);
    const split = splitPluginId(pluginId);
    if (split) {
      try {
        await removePathEntry(await resolveContained(CODEX_CACHE_DIR, split.marketplace, split.name));
      } catch {
        // Outside the cache: not ours to delete.
      }
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// OpenCode — opencode.json `plugin` array
// ---------------------------------------------------------------------------

interface OpenCodeConfig {
  $schema?: string;
  plugin?: string[];
  [key: string]: unknown;
}

export function openCodeConfigPath(scope: InstallScope, cwd: string): string {
  return scope === "user"
    ? join(openCodeUserConfigDir(), "opencode.json")
    : join(cwd, "opencode.json");
}

/**
 * Where a first-party plugin's tree is copied for OpenCode. A subdirectory
 * here is inert on its own — OpenCode auto-loads only `plugins/*.{js,ts}`, one
 * level deep — so the tree is loaded solely through the `plugin` entry that
 * names its path.
 */
export const OPENCODE_PLUGINS_DIR = join(openCodeUserConfigDir(), "plugins");

/**
 * OpenCode resolves the module itself, so the entry is a spec rather than a
 * path: an npm name, or `name@git+<url>#<sha>` for a repository.
 *
 * The repository has to be the one holding the plugin's own content
 * (`pluginSource.url`), never the marketplace it was indexed in — most
 * marketplace entries point at a monorepo, and handing OpenCode that root
 * installs something else entirely under this plugin's name.
 *
 * A first-party plugin has no repository at all; OpenCode accepts a file path
 * in the same array, so the entry is the directory the tree was copied to.
 */
export function toOpenCodePluginSpec(item: RegistryItem, name: string, cachePath: string | null): string {
  if (isFirstParty(item.sourceType)) {
    if (!cachePath) throw new Error(`OpenCode cannot install "${name}": a first-party plugin needs a directory to load from`);
    return cachePath;
  }
  const source = item.pluginSource;

  // A plugin living in a subdirectory cannot be expressed as a git spec — the
  // npm-style syntax OpenCode resolves has no subpath — and the repository root
  // is a different module. Refusing is the honest answer; writing the root is
  // the bug this replaced.
  if (source?.path) {
    throw new Error(
      `OpenCode cannot install "${name}": its content is the subdirectory "${source.path}" of ${source.url ?? "its repository"}, and an OpenCode plugin spec cannot name a subdirectory`
    );
  }

  const repo = githubRepoOf(source?.url) ?? githubRepoOf(item.externalUrl);
  if (!repo) return name;
  const pinned = source?.sha ?? item.sourceRevision;
  return `${name}@git+https://github.com/${repo}.git${pinned ? `#${pinned}` : ""}`;
}

/** A `plugin` entry that names a directory rather than a module: absolute, home-relative or dot-relative. */
const isPathSpec = (spec: string): boolean => isAbsolute(spec) || spec.startsWith("~") || spec.startsWith(".");

/** The name an entry stands for: the part before `@` of a spec, or the directory's own name for a path. */
function specName(spec: string): string {
  if (isPathSpec(spec)) return basename(spec);
  const at = spec.indexOf("@", 1);
  return at > 0 ? spec.slice(0, at) : spec;
}

const openCodeStore: PluginStore = {
  manifestPaths: manifestsFor(),
  userGlobal: false,
  firstParty: true,
  cacheRoot: null,
  firstPartyCacheRoot: OPENCODE_PLUGINS_DIR,

  // OpenCode installs a remote module from its spec, so seedr writes no tree;
  // only a first-party plugin, which has no spec, is copied to a directory
  // OpenCode can load by path.
  cachePath: (_marketplace, name, _version, item) =>
    isFirstParty(item.sourceType) ? resolveContained(OPENCODE_PLUGINS_DIR, name) : Promise.resolve(null),

  mutations: (context) => {
    const path = openCodeConfigPath(context.scope, context.cwd);
    const spec = toOpenCodePluginSpec(context.item, context.name, context.cachePath);
    return [
      {
        path,
        detail: `plugin[] += "${spec}"`,
        apply: async () => {
          const config = await readJson<OpenCodeConfig>(path);
          config.$schema = config.$schema || "https://opencode.ai/config.json";
          const plugins = config.plugin || [];
          config.plugin = [...plugins.filter((entry) => specName(entry) !== context.name), spec];
          await writeJson(path, config);
        },
      },
    ];
  },

  async listInstalled(scope, cwd) {
    const config = await readJson<OpenCodeConfig>(openCodeConfigPath(scope, cwd));
    return (config.plugin || []).map(specName);
  },

  async remove(pluginId, scope, cwd) {
    const path = openCodeConfigPath(scope, cwd);
    const config = await readJson<OpenCodeConfig>(path);
    const name = splitPluginId(pluginId)?.name ?? pluginId;
    const plugins = config.plugin || [];
    const remaining = plugins.filter((entry) => specName(entry) !== name);
    if (remaining.length === plugins.length) return false;
    config.plugin = remaining;
    await writeJson(path, config);
    // A path entry names a tree seedr copied; a module OpenCode fetched is its own to keep.
    if (plugins.some((entry) => specName(entry) === name && isPathSpec(entry))) {
      try {
        await removePathEntry(await resolveContained(OPENCODE_PLUGINS_DIR, name));
      } catch {
        // Outside the store: not ours to delete.
      }
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// Google Antigravity — ~/.gemini/config
// ---------------------------------------------------------------------------

export const GEMINI_CONFIG_DIR = join(home, ".gemini", "config");
export const GEMINI_PLUGINS_DIR = join(GEMINI_CONFIG_DIR, "plugins");
export const GEMINI_IMPORT_MANIFEST_PATH = join(GEMINI_CONFIG_DIR, "import_manifest.json");

interface ImportManifest {
  imports?: Array<{ name: string; source: string; importedAt: string; components: string[] }>;
}

const antigravityStore: PluginStore = {
  manifestPaths: manifestsFor(),
  userGlobal: true,
  // Filed by name from a tree, so a first-party copy is as good as any other.
  firstParty: true,
  cacheRoot: GEMINI_PLUGINS_DIR,

  // Antigravity files plugins by name only — it has no marketplace dimension.
  cachePath: (_marketplace, name) => resolveContained(GEMINI_PLUGINS_DIR, name),

  /**
   * Antigravity discovers a plugin by a `plugin.json` at the tree ROOT, and
   * `.claude-plugin/plugin.json` is not a substitute: the cross-tool matrix
   * marks it a migration path (`agy plugin import claude`), never a reader.
   * `agy plugin validate` on a Claude-manifest-only tree answers
   * "missing plugin.json"; with a root manifest it answers "skills: 1 processed".
   *
   * Most plugins in the wild ship only the Claude manifest, so without this the
   * install lands a directory Antigravity refuses — reporting success while the
   * plugin does nothing. A tree that already carries its own root manifest
   * (compound-engineering does) is left exactly as it is.
   */
  async prepareTree(contentPath, { name, version, item }) {
    const manifestPath = join(contentPath, "plugin.json");
    if (await exists(manifestPath)) return;
    await writeJson(manifestPath, {
      name,
      version,
      ...(item.description ? { description: item.description } : {}),
    });
  },

  mutations: (context) => [
    {
      path: GEMINI_IMPORT_MANIFEST_PATH,
      detail: `imports[] += "${context.name}"`,
      apply: async () => {
        const manifest = await readJson<ImportManifest>(GEMINI_IMPORT_MANIFEST_PATH);
        const imports = manifest.imports || [];
        manifest.imports = [
          ...imports.filter((entry) => entry.name !== context.name),
          {
            name: context.name,
            source: "seedr",
            importedAt: new Date().toISOString(),
            components: ["skills", "hooks"],
          },
        ];
        await writeJson(GEMINI_IMPORT_MANIFEST_PATH, manifest);
      },
    },
  ],

  async listInstalled() {
    const manifest = await readJson<ImportManifest>(GEMINI_IMPORT_MANIFEST_PATH);
    return (manifest.imports || []).map((entry) => entry.name);
  },

  async remove(pluginId) {
    const name = splitPluginId(pluginId)?.name ?? pluginId;
    const manifest = await readJson<ImportManifest>(GEMINI_IMPORT_MANIFEST_PATH);
    const imports = manifest.imports || [];
    const remaining = imports.filter((entry) => entry.name !== name);
    if (remaining.length === imports.length) return false;
    manifest.imports = remaining;
    await writeJson(GEMINI_IMPORT_MANIFEST_PATH, manifest);
    try {
      await removePathEntry(await resolveContained(GEMINI_PLUGINS_DIR, name));
    } catch {
      // Outside the store: not ours to delete.
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** `owner/repo` as accepted into a `git clone` URL. */
const GITHUB_REPO_SLUG_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function githubRepoOf(url: string | undefined): string | null {
  if (!url) return null;
  const parsed = parseGitHubRepo(url);
  if (!parsed) return null;
  const repo = `${parsed.owner}/${parsed.repo}`;
  if (!GITHUB_REPO_SLUG_PATTERN.test(repo) || repo.includes("..")) return null;
  return repo;
}

function marketplaceRepo(item: RegistryItem): string | null {
  return githubRepoOf(item.marketplaceRef?.url ?? item.externalUrl);
}

const STORES: Partial<Record<CodingAgent, PluginStore>> = {
  claude: claudeStore,
  copilot: copilotStore,
  codex: codexStore,
  opencode: openCodeStore,
  antigravity: antigravityStore,
  gemini: antigravityStore,
};

export function pluginStoreFor(agent: CodingAgent): PluginStore {
  const store = STORES[canonicalAgent(agent) ?? agent];
  if (!store || !isTypeSupported("plugin", agent)) {
    // `CODING_AGENTS[agent]` is undefined for an id outside the vocabulary, so
    // naming it directly crashed the guard while it was building its own message.
    throw new Error(`Plugins are not supported for ${CODING_AGENTS[agent]?.name ?? agent}`);
  }
  return store;
}
