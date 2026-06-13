import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// Mock the registry module
vi.mock("../config/registry.js", () => ({
  getItemSourcePath: vi.fn(),
  fetchItemToDestination: vi.fn(),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

describe("plugin handler", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("uninstallPlugin", () => {
    it("should remove plugin from installed_plugins.json and settings.json", async () => {
      const { uninstallPlugin } = await import("./plugin.js");

      vol.mkdirSync("/home/testuser/.claude/plugins", { recursive: true });
      vol.writeFileSync(
        "/home/testuser/.claude/plugins/installed_plugins.json",
        JSON.stringify({
          version: 2,
          plugins: {
            "skill-creator@claude-plugins-official": [
              {
                scope: "project",
                projectPath: "/my/project",
                installPath: "/home/testuser/.claude/plugins/cache/claude-plugins-official/skill-creator/1.0.0",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
            ],
          },
        })
      );

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          enabledPlugins: { "skill-creator@claude-plugins-official": true },
        })
      );

      const result = await uninstallPlugin("skill-creator", "claude", "project", "/my/project");

      expect(result).toBe(true);

      const registry = JSON.parse(
        vol.readFileSync("/home/testuser/.claude/plugins/installed_plugins.json", "utf-8") as string
      );
      expect(registry.plugins["skill-creator@claude-plugins-official"]).toBeUndefined();

      const settings = JSON.parse(
        vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string
      );
      expect(settings.enabledPlugins["skill-creator@claude-plugins-official"]).toBeUndefined();
    });

    it("should only remove matching scope/projectPath entry", async () => {
      const { uninstallPlugin } = await import("./plugin.js");

      vol.mkdirSync("/home/testuser/.claude/plugins", { recursive: true });
      vol.writeFileSync(
        "/home/testuser/.claude/plugins/installed_plugins.json",
        JSON.stringify({
          version: 2,
          plugins: {
            "my-plugin@marketplace": [
              {
                scope: "project",
                projectPath: "/project-a",
                installPath: "/home/testuser/.claude/plugins/cache/marketplace/my-plugin/1.0.0",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
              {
                scope: "project",
                projectPath: "/project-b",
                installPath: "/home/testuser/.claude/plugins/cache/marketplace/my-plugin/1.0.0",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
            ],
          },
        })
      );

      vol.mkdirSync("/project-a/.claude", { recursive: true });
      vol.writeFileSync(
        "/project-a/.claude/settings.json",
        JSON.stringify({
          enabledPlugins: { "my-plugin@marketplace": true },
        })
      );

      const result = await uninstallPlugin("my-plugin", "claude", "project", "/project-a");

      expect(result).toBe(true);

      const registry = JSON.parse(
        vol.readFileSync("/home/testuser/.claude/plugins/installed_plugins.json", "utf-8") as string
      );
      // Plugin key should still exist with one entry for project-b
      expect(registry.plugins["my-plugin@marketplace"]).toHaveLength(1);
      expect(registry.plugins["my-plugin@marketplace"][0].projectPath).toBe("/project-b");
    });

    it("should remove entire plugin key when last entry removed", async () => {
      const { uninstallPlugin } = await import("./plugin.js");

      vol.mkdirSync("/home/testuser/.claude/plugins", { recursive: true });
      vol.writeFileSync(
        "/home/testuser/.claude/plugins/installed_plugins.json",
        JSON.stringify({
          version: 2,
          plugins: {
            "solo-plugin@marketplace": [
              {
                scope: "project",
                projectPath: "/my/project",
                installPath: "/home/testuser/.claude/plugins/cache/marketplace/solo-plugin/1.0.0",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
            ],
          },
        })
      );

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          enabledPlugins: { "solo-plugin@marketplace": true },
        })
      );

      await uninstallPlugin("solo-plugin", "claude", "project", "/my/project");

      const registry = JSON.parse(
        vol.readFileSync("/home/testuser/.claude/plugins/installed_plugins.json", "utf-8") as string
      );
      expect(registry.plugins["solo-plugin@marketplace"]).toBeUndefined();
    });

    it("should handle user having changed enabledPlugins to false", async () => {
      const { uninstallPlugin } = await import("./plugin.js");

      vol.mkdirSync("/home/testuser/.claude/plugins", { recursive: true });
      vol.writeFileSync(
        "/home/testuser/.claude/plugins/installed_plugins.json",
        JSON.stringify({
          version: 2,
          plugins: {
            "disabled-plugin@marketplace": [
              {
                scope: "project",
                projectPath: "/my/project",
                installPath: "/home/testuser/.claude/plugins/cache/marketplace/disabled-plugin/1.0.0",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
            ],
          },
        })
      );

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          enabledPlugins: { "disabled-plugin@marketplace": false },
        })
      );

      const result = await uninstallPlugin("disabled-plugin", "claude", "project", "/my/project");

      expect(result).toBe(true);

      const settings = JSON.parse(
        vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string
      );
      expect(settings.enabledPlugins["disabled-plugin@marketplace"]).toBeUndefined();
    });

    it("should return false for non-existent plugin slug", async () => {
      const { uninstallPlugin } = await import("./plugin.js");

      vol.mkdirSync("/home/testuser/.claude/plugins", { recursive: true });
      vol.writeFileSync(
        "/home/testuser/.claude/plugins/installed_plugins.json",
        JSON.stringify({ version: 2, plugins: {} })
      );

      const result = await uninstallPlugin("non-existent", "claude", "project", "/my/project");
      expect(result).toBe(false);
    });

    it("should return false for non-claude tools", async () => {
      const { uninstallPlugin } = await import("./plugin.js");

      const result = await uninstallPlugin("any-plugin", "copilot", "project", "/my/project");
      expect(result).toBe(false);
    });
  });

  describe("getInstalledPlugins", () => {
    it("should list plugins matching scope and project", async () => {
      const { getInstalledPlugins } = await import("./plugin.js");

      vol.mkdirSync("/home/testuser/.claude/plugins", { recursive: true });
      vol.writeFileSync(
        "/home/testuser/.claude/plugins/installed_plugins.json",
        JSON.stringify({
          version: 2,
          plugins: {
            "plugin-a@marketplace": [
              {
                scope: "project",
                projectPath: "/my/project",
                installPath: "/cache/a",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
            ],
            "plugin-b@marketplace": [
              {
                scope: "project",
                projectPath: "/my/project",
                installPath: "/cache/b",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
            ],
          },
        })
      );

      const installed = await getInstalledPlugins("claude", "project", "/my/project");
      expect(installed).toEqual(["plugin-a", "plugin-b"]);
    });

    it("should return empty for no plugins", async () => {
      const { getInstalledPlugins } = await import("./plugin.js");

      vol.mkdirSync("/home/testuser/.claude/plugins", { recursive: true });
      vol.writeFileSync(
        "/home/testuser/.claude/plugins/installed_plugins.json",
        JSON.stringify({ version: 2, plugins: {} })
      );

      const installed = await getInstalledPlugins("claude", "project", "/my/project");
      expect(installed).toEqual([]);
    });

    it("should filter by scope correctly", async () => {
      const { getInstalledPlugins } = await import("./plugin.js");

      vol.mkdirSync("/home/testuser/.claude/plugins", { recursive: true });
      vol.writeFileSync(
        "/home/testuser/.claude/plugins/installed_plugins.json",
        JSON.stringify({
          version: 2,
          plugins: {
            "user-plugin@marketplace": [
              {
                scope: "user",
                installPath: "/cache/user-plugin",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
            ],
            "project-plugin@marketplace": [
              {
                scope: "project",
                projectPath: "/my/project",
                installPath: "/cache/project-plugin",
                version: "1.0.0",
                installedAt: "2025-01-01T00:00:00.000Z",
                lastUpdated: "2025-01-01T00:00:00.000Z",
                gitCommitSha: "",
              },
            ],
          },
        })
      );

      const projectPlugins = await getInstalledPlugins("claude", "project", "/my/project");
      expect(projectPlugins).toEqual(["project-plugin"]);

      const userPlugins = await getInstalledPlugins("claude", "user");
      expect(userPlugins).toEqual(["user-plugin"]);
    });
  });

  describe("pluginHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { pluginHandler } = await import("./plugin.js");

      expect(pluginHandler.type).toBe("plugin");
      expect(typeof pluginHandler.install).toBe("function");
      expect(typeof pluginHandler.uninstall).toBe("function");
      expect(typeof pluginHandler.listInstalled).toBe("function");
    });
  });
});
