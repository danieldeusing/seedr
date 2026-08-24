import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";

const PROJECT_A = "/project-a";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

const execFileMock = vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => cb(null));
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...(args as [string, string[], (err: Error | null) => void])),
}));

// Mock the registry module
vi.mock("../config/registry.js", () => ({
  getItem: vi.fn(async () => undefined),
  getItemSourcePath: vi.fn(() => null),
  fetchItemToDestination: vi.fn(),
  fetchItemFile: vi.fn(),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const HOME = "/home/testuser";
const PLUGINS_DIR = `${HOME}/.claude/plugins`;
const CACHE_DIR = `${PLUGINS_DIR}/cache`;
const INSTALLED_PATH = `${PLUGINS_DIR}/installed_plugins.json`;
const KNOWN_MARKETPLACES_PATH = `${PLUGINS_DIR}/known_marketplaces.json`;
const MARKETPLACES_DIR = `${PLUGINS_DIR}/marketplaces`;
const PROJECT = "/my/project";
const PROJECT_SETTINGS = `${PROJECT}/.claude/settings.json`;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const ISO_DATE = "2025-01-01T00:00:00.000Z";
const MARKETPLACE = "marketplace";
const OFFICIAL = "claude-plugins-official";

interface EntryOverrides {
  scope?: "project" | "user" | "local";
  projectPath?: string;
  installPath?: string;
}

function entry(overrides: EntryOverrides = {}) {
  return {
    scope: "project",
    projectPath: PROJECT,
    installPath: `${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`,
    version: "1.0.0",
    installedAt: ISO_DATE,
    lastUpdated: ISO_DATE,
    gitCommitSha: "",
    ...overrides,
  };
}

function writeInstalled(plugins: Record<string, unknown[]>): void {
  vol.mkdirSync(PLUGINS_DIR, { recursive: true });
  vol.writeFileSync(INSTALLED_PATH, JSON.stringify({ version: 2, plugins }));
}

function writeProjectSettings(settings: unknown, projectPath = PROJECT): void {
  vol.mkdirSync(`${projectPath}/.claude`, { recursive: true });
  vol.writeFileSync(`${projectPath}/.claude/settings.json`, JSON.stringify(settings));
}

// Inferred from JSON.parse on purpose: fixtures are free-form documents.
function readJsonFile(path: string) {
  return JSON.parse(vol.readFileSync(path, "utf-8") as string);
}

function pluginItem(overrides: Partial<RegistryItem> = {}): RegistryItem {
  return {
    slug: "my-plugin",
    name: "My Plugin",
    type: "plugin",
    description: "A plugin",
    compatibility: ["claude"],
    sourceType: "community",
    externalUrl: "https://github.com/owner/my-plugin",
    marketplace: MARKETPLACE,
    sourceRevision: SHA,
    ...overrides,
  };
}

/** Make the mocked download produce a plugin.json with the given identity. */
async function serveDownload(pluginJson: Record<string, unknown> | string): Promise<void> {
  const { fetchItemToDestination } = await import("../config/registry.js");
  vi.mocked(fetchItemToDestination).mockImplementation(async (_item: RegistryItem, dest: string) => {
    vol.mkdirSync(`${dest}/.claude-plugin`, { recursive: true });
    vol.writeFileSync(`${dest}/.claude-plugin/plugin.json`, typeof pluginJson === "string" ? pluginJson : JSON.stringify(pluginJson));
    vol.writeFileSync(`${dest}/README.md`, "readme");
    return { sourceRevision: SHA, contentDigest: "f".repeat(64), files: [".claude-plugin/plugin.json", "README.md"] };
  });
}

function cacheTempEntries(): string[] {
  const tmp = `${CACHE_DIR}/.tmp`;
  return vol.existsSync(tmp) ? (vol.readdirSync(tmp) as string[]) : [];
}

describe("plugin handler", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(KNOWN_MARKETPLACES_PATH.replace("/known_marketplaces.json", ""), { recursive: true });
    vol.writeFileSync(KNOWN_MARKETPLACES_PATH, JSON.stringify({ [MARKETPLACE]: { source: { source: "github", repo: "owner/my-plugin" }, installLocation: `${MARKETPLACES_DIR}/${MARKETPLACE}`, lastUpdated: ISO_DATE } }));
  });

  afterEach(() => {
    vol.reset();
    vi.resetAllMocks();
  });

  describe("installPlugin", () => {
    it("copies verified content into the cache, records the revision and enables the plugin", async () => {
      await serveDownload({ name: "my-plugin", version: "2.1.0" });
      const { installPlugin } = await import("./plugin.js");

      const results = await installPlugin(pluginItem(), ["claude"], "project", "copy", true, PROJECT);

      const cachePath = `${CACHE_DIR}/${MARKETPLACE}/my-plugin/2.1.0`;
      expect(results[0]).toEqual({ agent: "claude", success: true, path: cachePath });
      expect(vol.readFileSync(`${cachePath}/README.md`, "utf-8")).toBe("readme");
      const registry = readJsonFile(INSTALLED_PATH);
      expect(registry.version).toBe(2);
      expect(registry.plugins["my-plugin@marketplace"]).toHaveLength(1);
      expect(registry.plugins["my-plugin@marketplace"][0]).toMatchObject({ scope: "project", projectPath: PROJECT, installPath: cachePath, version: "2.1.0", gitCommitSha: SHA });
      expect(readJsonFile(PROJECT_SETTINGS).enabledPlugins["my-plugin@marketplace"]).toBe(true);
      expect(cacheTempEntries()).toEqual([]);
    });

    it("fails for non-claude agents without touching the filesystem", async () => {
      const { installPlugin } = await import("./plugin.js");
      const results = await installPlugin(pluginItem(), ["copilot"], "project", "copy", true, PROJECT);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toBe("Plugins are only supported for Claude Code");
      expect(vol.existsSync(CACHE_DIR)).toBe(false);
    });

    it.each([
      ["name", "../../x"],
      ["name", "/etc"],
      ["name", "C:\\x"],
      ["name", "a/b"],
      ["name", ".."],
      ["name", "-rf"],
      ["name", "bad\u0000name"],
      ["name", "a".repeat(101)],
      ["version", "../../x"],
      ["version", "/etc"],
      ["version", "a/b"],
      ["version", ".."],
      ["version", "-rf"],
      ["version", "1.0\n0"],
      ["version", "v".repeat(101)],
    ])("refuses a malicious plugin.json %s %j and writes nothing outside the staging dir", async (field, value) => {
      await serveDownload({ name: "my-plugin", version: "1.0.0", [field]: value });
      const { installPlugin } = await import("./plugin.js");

      const results = await installPlugin(pluginItem(), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toMatch(new RegExp(`plugin ${field}`));
      expect(vol.existsSync(INSTALLED_PATH)).toBe(false);
      expect(vol.existsSync(PROJECT_SETTINGS)).toBe(false);
      expect(vol.existsSync("/etc")).toBe(false);
      expect(vol.existsSync("/x")).toBe(false);
      expect(cacheTempEntries()).toEqual([]);
      const cacheEntries = vol.existsSync(CACHE_DIR) ? (vol.readdirSync(CACHE_DIR) as string[]) : [];
      expect(cacheEntries.filter((name) => name !== ".tmp")).toEqual([]);
    });

    it.each(["../../x", "/etc", "a/b", "..", "-rf", "C:\\x", "mar ket"])("refuses a malicious marketplace %j before downloading", async (marketplace) => {
      await serveDownload({ name: "my-plugin" });
      const { installPlugin } = await import("./plugin.js");
      const { fetchItemToDestination } = await import("../config/registry.js");

      const results = await installPlugin(pluginItem({ marketplace }), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toMatch(/plugin marketplace/);
      expect(fetchItemToDestination).not.toHaveBeenCalled();
      expect(vol.existsSync(CACHE_DIR)).toBe(false);
    });

    it("falls back to the author name as marketplace and validates it too", async () => {
      await serveDownload({ name: "my-plugin" });
      const { installPlugin } = await import("./plugin.js");
      const item = pluginItem({ marketplace: undefined, author: { name: "../escape" } });
      const results = await installPlugin(item, ["claude"], "project", "copy", true, PROJECT);
      expect(results[0]?.error).toMatch(/Unsafe plugin marketplace/);
    });

    it.each([
      ["a.b", "1.0.0"],
      ["my-plugin", "1.0.0-beta.1"],
      ["Plugin_1", "v2"],
    ])("accepts the boundary identity %s@%s", async (name, version) => {
      await serveDownload({ name, version });
      const { installPlugin } = await import("./plugin.js");
      const results = await installPlugin(pluginItem(), ["claude"], "project", "copy", true, PROJECT);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.path).toBe(`${CACHE_DIR}/${MARKETPLACE}/${name}/${version}`);
    });

    it("defaults name and version when plugin.json omits them", async () => {
      await serveDownload({});
      const { installPlugin } = await import("./plugin.js");
      const results = await installPlugin(pluginItem(), ["claude"], "project", "copy", true, PROJECT);
      expect(results[0]?.path).toBe(`${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`);
    });

    it("refuses a cache path whose parent is a symlink escaping the cache root", async () => {
      await serveDownload({ name: "my-plugin", version: "1.0.0" });
      vol.mkdirSync(CACHE_DIR, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.symlinkSync("/outside", `${CACHE_DIR}/${MARKETPLACE}`);
      const { installPlugin } = await import("./plugin.js");

      const results = await installPlugin(pluginItem(), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toMatch(/Refusing path outside .*cache/);
      expect(vol.readdirSync("/outside")).toEqual([]);
      expect(vol.existsSync(INSTALLED_PATH)).toBe(false);
    });

    it("refuses to overwrite an existing cache directory without force", async () => {
      await serveDownload({ name: "my-plugin", version: "1.0.0" });
      vol.mkdirSync(`${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`, { recursive: true });
      vol.writeFileSync(`${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0/keep`, "keep");
      const { installPlugin } = await import("./plugin.js");

      const results = await installPlugin(pluginItem(), ["claude"], "project", "copy", false, PROJECT);

      expect(results[0]?.error).toMatch(/already exists; pass --force/);
      expect(vol.existsSync(`${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0/keep`)).toBe(true);
      expect(cacheTempEntries()).toEqual([]);
    });

    it("fails when no source revision can be recorded (never an empty gitCommitSha)", async () => {
      const { fetchItemToDestination } = await import("../config/registry.js");
      vi.mocked(fetchItemToDestination).mockImplementation(async (_item: RegistryItem, dest: string) => {
        vol.mkdirSync(`${dest}/.claude-plugin`, { recursive: true });
        vol.writeFileSync(`${dest}/.claude-plugin/plugin.json`, "{}");
        return { sourceRevision: null, contentDigest: null, files: [] };
      });
      const { installPlugin } = await import("./plugin.js");

      const results = await installPlugin(pluginItem({ sourceRevision: undefined }), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.error).toMatch(/Cannot record a source revision for "my-plugin"/);
      expect(vol.existsSync(INSTALLED_PATH)).toBe(false);
    });

    it("uses pluginSource.sha for a locally sourced plugin", async () => {
      const { getItemSourcePath } = await import("../config/registry.js");
      vi.mocked(getItemSourcePath).mockReturnValue("/registry/plugins/my-plugin");
      vol.mkdirSync("/registry/plugins/my-plugin/.claude-plugin", { recursive: true });
      vol.writeFileSync("/registry/plugins/my-plugin/.claude-plugin/plugin.json", JSON.stringify({ name: "my-plugin", version: "3.0.0" }));
      const { installPlugin } = await import("./plugin.js");
      const item = pluginItem({ sourceType: "toolr", sourceRevision: undefined, pluginSource: { kind: "github", url: "https://github.com/owner/my-plugin", sha: SHA } });

      const results = await installPlugin(item, ["claude"], "user", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      const registry = readJsonFile(INSTALLED_PATH);
      expect(registry.plugins["my-plugin@marketplace"][0]).toMatchObject({ scope: "user", gitCommitSha: SHA, version: "3.0.0" });
      expect(registry.plugins["my-plugin@marketplace"][0].projectPath).toBeUndefined();
      expect(readJsonFile(`${HOME}/.claude/settings.json`).enabledPlugins["my-plugin@marketplace"]).toBe(true);
    });

    it("replaces the entry for the same scope and project, keeping others", async () => {
      await serveDownload({ name: "my-plugin", version: "1.0.0" });
      writeInstalled({ "my-plugin@marketplace": [entry({ projectPath: "/other" }), entry()] });
      const { installPlugin } = await import("./plugin.js");

      await installPlugin(pluginItem(), ["claude"], "project", "copy", true, PROJECT);

      const entries = readJsonFile(INSTALLED_PATH).plugins["my-plugin@marketplace"];
      expect(entries).toHaveLength(2);
      expect(entries.map((e: { projectPath: string }) => e.projectPath)).toEqual(["/other", PROJECT]);
      expect(entries[1].gitCommitSha).toBe(SHA);
    });
  });

  describe("marketplace registration", () => {
    it("clones the marketplace into a contained directory and records it", async () => {
      await serveDownload({ name: "my-plugin" });
      vol.writeFileSync(KNOWN_MARKETPLACES_PATH, "{}");
      const { installPlugin } = await import("./plugin.js");

      const results = await installPlugin(pluginItem({ marketplace: OFFICIAL, externalUrl: `https://github.com/anthropics/${OFFICIAL}/tree/main/plugins/x` }), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(execFileMock).toHaveBeenCalledTimes(1);
      expect(execFileMock.mock.calls[0]![0]).toBe("git");
      expect(execFileMock.mock.calls[0]![1]).toEqual(["clone", "--depth", "1", `https://github.com/anthropics/${OFFICIAL}.git`, `${MARKETPLACES_DIR}/${OFFICIAL}`]);
      expect(readJsonFile(KNOWN_MARKETPLACES_PATH)[OFFICIAL]).toMatchObject({ source: { source: "github", repo: `anthropics/${OFFICIAL}` }, installLocation: `${MARKETPLACES_DIR}/${OFFICIAL}` });
    });

    it("prefers the pinned marketplaceRef url and skips the clone when the directory exists", async () => {
      await serveDownload({ name: "my-plugin" });
      vol.writeFileSync(KNOWN_MARKETPLACES_PATH, "{}");
      vol.mkdirSync(`${MARKETPLACES_DIR}/${MARKETPLACE}`, { recursive: true });
      const { installPlugin } = await import("./plugin.js");

      await installPlugin(pluginItem({ marketplaceRef: { name: MARKETPLACE, url: "https://github.com/pinned/repo.git", sha: SHA } }), ["claude"], "project", "copy", true, PROJECT);

      expect(execFileMock).not.toHaveBeenCalled();
      expect(readJsonFile(KNOWN_MARKETPLACES_PATH)[MARKETPLACE].source.repo).toBe("pinned/repo");
    });

    it.each([
      "https://github.com/../evil",
      "https://github.com/owner/..",
      "https://gitlab.com/owner/repo",
      "https://github.com/owner",
      "https://github.com/ow ner/repo",
    ])("never clones from %s", async (url) => {
      await serveDownload({ name: "my-plugin" });
      vol.writeFileSync(KNOWN_MARKETPLACES_PATH, "{}");
      const { installPlugin } = await import("./plugin.js");

      const results = await installPlugin(pluginItem({ externalUrl: url }), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(execFileMock).not.toHaveBeenCalled();
      expect(readJsonFile(KNOWN_MARKETPLACES_PATH)).toEqual({});
    });

    it("does not clone a marketplace that is already known", async () => {
      await serveDownload({ name: "my-plugin" });
      const { installPlugin } = await import("./plugin.js");
      await installPlugin(pluginItem(), ["claude"], "project", "copy", true, PROJECT);
      expect(execFileMock).not.toHaveBeenCalled();
    });
  });

  describe("rollback", () => {
    async function installAndExpectFailure(): Promise<string> {
      const { installPlugin } = await import("./plugin.js");
      const results = await installPlugin(pluginItem(), ["claude"], "project", "copy", true, PROJECT);
      expect(results[0]?.success).toBe(false);
      return results[0]!.error!;
    }

    it("removes the cache copy when installed_plugins.json cannot be written", async () => {
      await serveDownload({ name: "my-plugin", version: "1.0.0" });
      const json = await import("../utils/json.js");
      const writeSpy = vi.spyOn(json, "writeJson").mockImplementation(async (path: string) => {
        if (path === INSTALLED_PATH) throw new Error("disk full");
      });

      const error = await installAndExpectFailure();
      writeSpy.mockRestore();

      expect(error).toBe("disk full");
      expect(vol.existsSync(`${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`)).toBe(false);
      expect(vol.existsSync(INSTALLED_PATH)).toBe(false);
      expect(vol.existsSync(PROJECT_SETTINGS)).toBe(false);
      expect(cacheTempEntries()).toEqual([]);
    });

    it("restores installed_plugins.json and removes the cache copy when settings.json cannot be written", async () => {
      await serveDownload({ name: "my-plugin", version: "1.0.0" });
      const previousRegistry = JSON.stringify({ version: 2, plugins: { "other@m": [entry()] } });
      vol.mkdirSync(PLUGINS_DIR, { recursive: true });
      vol.writeFileSync(INSTALLED_PATH, previousRegistry);
      writeProjectSettings({ existing: true });
      const fsp = await import("node:fs/promises");
      const originalRename = fsp.rename;
      const renameSpy = vi.spyOn(fsp, "rename").mockImplementation(async (from, to) => {
        if (String(to) === PROJECT_SETTINGS) throw new Error("EACCES: settings locked");
        return originalRename.call(fsp, from, to);
      });

      const error = await installAndExpectFailure();
      renameSpy.mockRestore();

      expect(error).toMatch(/EACCES/);
      expect(vol.readFileSync(INSTALLED_PATH, "utf-8")).toBe(previousRegistry);
      expect(readJsonFile(PROJECT_SETTINGS)).toEqual({ existing: true });
      expect(vol.existsSync(`${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`)).toBe(false);
      expect(cacheTempEntries()).toEqual([]);
    });

    it("leaves nothing behind when the download itself fails", async () => {
      const { fetchItemToDestination } = await import("../config/registry.js");
      vi.mocked(fetchItemToDestination).mockRejectedValue(new Error("Registry integrity error: boom"));

      const error = await installAndExpectFailure();

      expect(error).toMatch(/Registry integrity error/);
      expect(cacheTempEntries()).toEqual([]);
      expect(vol.existsSync(INSTALLED_PATH)).toBe(false);
    });

    it("reports an incomplete rollback instead of hiding it", async () => {
      await serveDownload({ name: "my-plugin", version: "1.0.0" });
      const json = await import("../utils/json.js");
      const writeSpy = vi.spyOn(json, "writeJson").mockRejectedValue(new Error("disk full"));
      const fsUtils = await import("../utils/fs.js");
      const originalRemove = fsUtils.removePathEntry;
      let cacheRemovals = 0;
      const removeSpy = vi.spyOn(fsUtils, "removePathEntry").mockImplementation(async (path: string) => {
        // The first call clears the destination before the move; the second is the rollback.
        if (path.includes("/cache/marketplace/") && ++cacheRemovals === 2) throw new Error("EBUSY");
        return originalRemove(path);
      });

      const error = await installAndExpectFailure();
      writeSpy.mockRestore();
      removeSpy.mockRestore();

      expect(error).toBe("disk full (rollback incomplete: EBUSY)");
    });
  });

  describe("uninstallPlugin", () => {
    it("should remove plugin from installed_plugins.json and settings.json", async () => {
      const { uninstallPlugin } = await import("./plugin.js");

      writeInstalled({ [`skill-creator@${OFFICIAL}`]: [entry({ installPath: `${CACHE_DIR}/${OFFICIAL}/skill-creator/1.0.0` })] });
      writeProjectSettings({ enabledPlugins: { [`skill-creator@${OFFICIAL}`]: true } });

      const result = await uninstallPlugin("skill-creator", "claude", "project", PROJECT);

      expect(result).toBe(true);
      expect(readJsonFile(INSTALLED_PATH).plugins[`skill-creator@${OFFICIAL}`]).toBeUndefined();
      expect(readJsonFile(PROJECT_SETTINGS).enabledPlugins[`skill-creator@${OFFICIAL}`]).toBeUndefined();
    });

    it("should only remove matching scope/projectPath entry and keep the shared cache", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      const installPath = `${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`;
      vol.mkdirSync(installPath, { recursive: true });
      vol.writeFileSync(`${installPath}/f`, "f");
      writeInstalled({ "my-plugin@marketplace": [entry({ projectPath: PROJECT_A }), entry({ projectPath: "/project-b" })] });
      writeProjectSettings({ enabledPlugins: { "my-plugin@marketplace": true } }, PROJECT_A);

      const result = await uninstallPlugin("my-plugin", "claude", "project", PROJECT_A);

      expect(result).toBe(true);
      const registry = readJsonFile(INSTALLED_PATH);
      expect(registry.plugins["my-plugin@marketplace"]).toHaveLength(1);
      expect(registry.plugins["my-plugin@marketplace"][0].projectPath).toBe("/project-b");
      expect(vol.existsSync(`${installPath}/f`)).toBe(true);
    });

    it("removes the cache directory once no entry references it (item 39)", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      const installPath = `${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`;
      vol.mkdirSync(installPath, { recursive: true });
      vol.writeFileSync(`${installPath}/f`, "f");
      writeInstalled({ "my-plugin@marketplace": [entry({ installPath })] });
      writeProjectSettings({ enabledPlugins: { "my-plugin@marketplace": true } });

      expect(await uninstallPlugin("my-plugin", "claude", "project", PROJECT)).toBe(true);

      expect(vol.existsSync(installPath)).toBe(false);
      expect(readJsonFile(INSTALLED_PATH).plugins["my-plugin@marketplace"]).toBeUndefined();
    });

    it("never removes an installPath outside the cache, even when unreferenced", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      vol.mkdirSync("/outside/victim", { recursive: true });
      vol.writeFileSync("/outside/victim/f", "f");
      vol.mkdirSync(CACHE_DIR, { recursive: true });
      vol.symlinkSync("/outside", `${CACHE_DIR}/escape`);
      writeInstalled({
        "a@m": [entry({ installPath: "/outside/victim" })],
        "b@m": [entry({ installPath: `${CACHE_DIR}/../../evil` })],
        "c@m": [entry({ installPath: `${CACHE_DIR}/escape/victim` })],
      });

      expect(await uninstallPlugin("a", "claude", "project", PROJECT)).toBe(true);
      expect(await uninstallPlugin("b", "claude", "project", PROJECT)).toBe(true);
      expect(await uninstallPlugin("c", "claude", "project", PROJECT)).toBe(true);

      expect(vol.existsSync("/outside/victim/f")).toBe(true);
    });

    it("matches the installed id exactly and never by prefix", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      writeInstalled({ "my-plugin-extra@marketplace": [entry()], "my-plugin@other": [entry()], "my-plugin@marketplace": [entry()] });
      writeProjectSettings({ enabledPlugins: { "my-plugin-extra@marketplace": true } });

      // Ambiguous without registry knowledge: two marketplaces carry "my-plugin"
      expect(await uninstallPlugin("my-plugin", "claude", "project", PROJECT)).toBe(false);
      expect(Object.keys(readJsonFile(INSTALLED_PATH).plugins)).toHaveLength(3);

      // With the registry item, the exact name@marketplace is removed
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue(pluginItem());
      expect(await uninstallPlugin("my-plugin", "claude", "project", PROJECT)).toBe(true);
      const plugins = readJsonFile(INSTALLED_PATH).plugins;
      expect(Object.keys(plugins).sort()).toEqual(["my-plugin-extra@marketplace", "my-plugin@other"]);
      expect(readJsonFile(PROJECT_SETTINGS).enabledPlugins["my-plugin-extra@marketplace"]).toBe(true);
    });

    it("returns false when the registry knows a different marketplace than the installed one", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue(pluginItem({ marketplace: "elsewhere" }));
      writeInstalled({ "my-plugin@marketplace": [entry()] });
      expect(await uninstallPlugin("my-plugin", "claude", "project", PROJECT)).toBe(false);
    });

    it("returns false when no entry matches the scope", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      writeInstalled({ "my-plugin@marketplace": [entry({ scope: "user", projectPath: undefined })] });
      expect(await uninstallPlugin("my-plugin", "claude", "project", PROJECT)).toBe(false);
      expect(readJsonFile(INSTALLED_PATH).plugins["my-plugin@marketplace"]).toHaveLength(1);
    });

    it("should handle user having changed enabledPlugins to false", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      writeInstalled({ "disabled-plugin@marketplace": [entry()] });
      writeProjectSettings({ enabledPlugins: { "disabled-plugin@marketplace": false } });

      expect(await uninstallPlugin("disabled-plugin", "claude", "project", PROJECT)).toBe(true);
      expect(readJsonFile(PROJECT_SETTINGS).enabledPlugins["disabled-plugin@marketplace"]).toBeUndefined();
    });

    it("should return false for non-existent plugin slug or missing registry file", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      expect(await uninstallPlugin("non-existent", "claude", "project", PROJECT)).toBe(false);
      writeInstalled({});
      expect(await uninstallPlugin("non-existent", "claude", "project", PROJECT)).toBe(false);
    });

    it("should return false for non-claude tools", async () => {
      const { uninstallPlugin } = await import("./plugin.js");
      expect(await uninstallPlugin("any-plugin", "copilot", "project", PROJECT)).toBe(false);
    });

    it.each(["../x", "../../x", "/etc", "a/b", "a\\b", "", "%2e%2e", "ünï", "a".repeat(101)])("rejects invalid slug %j before reading anything", async (slug) => {
      const { uninstallPlugin } = await import("./plugin.js");
      writeInstalled({ "my-plugin@marketplace": [entry()] });
      await expect(uninstallPlugin(slug, "claude", "project", PROJECT)).rejects.toThrow(/Invalid plugin slug/);
      expect(readJsonFile(INSTALLED_PATH).plugins["my-plugin@marketplace"]).toHaveLength(1);
    });
  });

  describe("getInstalledPlugins", () => {
    it("should list plugins matching scope and project", async () => {
      const { getInstalledPlugins } = await import("./plugin.js");
      writeInstalled({ "plugin-a@marketplace": [entry({ installPath: "/cache/a" })], "plugin-b@marketplace": [entry({ installPath: "/cache/b" })] });

      expect(await getInstalledPlugins("claude", "project", PROJECT)).toEqual(["plugin-a", "plugin-b"]);
    });

    it("should return empty for no plugins", async () => {
      const { getInstalledPlugins } = await import("./plugin.js");
      writeInstalled({});
      expect(await getInstalledPlugins("claude", "project", PROJECT)).toEqual([]);
      expect(await getInstalledPlugins("copilot", "project", PROJECT)).toEqual([]);
    });

    it("should filter by scope correctly", async () => {
      const { getInstalledPlugins } = await import("./plugin.js");
      writeInstalled({
        "user-plugin@marketplace": [entry({ scope: "user", projectPath: undefined, installPath: "/cache/user-plugin" })],
        "project-plugin@marketplace": [entry({ installPath: "/cache/project-plugin" })],
      });

      expect(await getInstalledPlugins("claude", "project", PROJECT)).toEqual(["project-plugin"]);
      expect(await getInstalledPlugins("claude", "user")).toEqual(["user-plugin"]);
    });
  });

  describe("planPlugin", () => {
    it("describes the exact cache path, registry file, marketplace clone and settings key without writing", async () => {
      const { fetchItemFile } = await import("../config/registry.js");
      vi.mocked(fetchItemFile).mockResolvedValue(JSON.stringify({ name: "my-plugin", version: "4.0.0" }));
      vol.writeFileSync(KNOWN_MARKETPLACES_PATH, "{}");
      const { planPlugin } = await import("./plugin.js");

      const plan = await planPlugin(pluginItem(), ["claude"], "project", "copy", PROJECT);

      expect(plan).toEqual([
        { agent: "claude", kind: "create", path: `${CACHE_DIR}/${MARKETPLACE}/my-plugin/4.0.0`, detail: "plugin files (digest-verified download)" },
        { agent: "claude", kind: "create", path: INSTALLED_PATH, detail: 'plugins["my-plugin@marketplace"] entry for project scope' },
        { agent: "claude", kind: "modify", path: KNOWN_MARKETPLACES_PATH, detail: 'marketplace "marketplace"' },
        { agent: "claude", kind: "create", path: `${MARKETPLACES_DIR}/${MARKETPLACE}`, detail: "git clone https://github.com/owner/my-plugin.git" },
        { agent: "claude", kind: "create", path: PROJECT_SETTINGS, detail: 'enabledPlugins["my-plugin@marketplace"] = true' },
      ]);
      expect(vol.existsSync(CACHE_DIR)).toBe(false);
      expect(vol.existsSync(INSTALLED_PATH)).toBe(false);
      expect(fetchItemFile).toHaveBeenCalledWith(pluginItem(), ".claude-plugin/plugin.json");
    });

    it("reads plugin.json from a local checkout and reports modifications of existing files", async () => {
      const { getItemSourcePath } = await import("../config/registry.js");
      vi.mocked(getItemSourcePath).mockReturnValue("/registry/plugins/my-plugin");
      vol.mkdirSync("/registry/plugins/my-plugin/.claude-plugin", { recursive: true });
      vol.writeFileSync("/registry/plugins/my-plugin/.claude-plugin/plugin.json", JSON.stringify({ version: "1.0.0" }));
      vol.mkdirSync(`${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`, { recursive: true });
      writeInstalled({});
      const { planPlugin } = await import("./plugin.js");

      const plan = await planPlugin(pluginItem(), ["claude"], "project", "copy", PROJECT);

      expect(plan.map((change) => [change.kind, change.path])).toEqual([
        ["modify", `${CACHE_DIR}/${MARKETPLACE}/my-plugin/1.0.0`],
        ["modify", INSTALLED_PATH],
        ["create", PROJECT_SETTINGS],
      ]);
    });

    it("rejects non-claude agents and unsafe identities", async () => {
      const { fetchItemFile } = await import("../config/registry.js");
      vi.mocked(fetchItemFile).mockResolvedValue(JSON.stringify({ name: "../evil" }));
      const { planPlugin } = await import("./plugin.js");
      await expect(planPlugin(pluginItem(), ["copilot"], "project", "copy", PROJECT)).rejects.toThrow(/only supported for Claude Code/);
      await expect(planPlugin(pluginItem(), ["claude"], "project", "copy", PROJECT)).rejects.toThrow(/Unsafe plugin name/);
    });
  });

  describe("pluginHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { pluginHandler } = await import("./plugin.js");

      expect(pluginHandler.type).toBe("plugin");
      expect(typeof pluginHandler.install).toBe("function");
      expect(typeof pluginHandler.uninstall).toBe("function");
      expect(typeof pluginHandler.listInstalled).toBe("function");
      expect(typeof pluginHandler.plan).toBe("function");
    });
  });
});
