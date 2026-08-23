import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";

const DARK_THEME = "dark-theme";
const EDITOR_SETTINGS = "editor-settings";
const LOCAL_SETTINGS = "local-settings";
const LOCAL_SETTINGS_FILE = "/my/project/.claude/settings.local.json";
const THEME_SETTINGS = "theme-settings";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// Mock the registry module
vi.mock("../config/registry.js", () => ({
  getItem: vi.fn(),
  getItemContent: vi.fn(),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const PROJECT = "/my/project";
const CLAUDE_DIR = "/my/project/.claude";
const SETTINGS = "/my/project/.claude/settings.json";
const DARK = "dark";

function settingsItem(slug: string, name = slug): RegistryItem {
  return { slug, name, type: "settings", description: `${name} settings`, compatibility: ["claude"] };
}

describe("settings handler", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("installSettings", () => {
    it("should merge settings into settings.json", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({
          theme: DARK,
          fontSize: 14,
        })
      );

      const { installSettings } = await import("./settings.js");

      const item: RegistryItem = {
        slug: DARK_THEME,
        name: "Dark Theme Settings",
        type: "settings",
        description: "Dark theme configuration",
        compatibility: ["claude"],
      };

      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      vol.writeFileSync(SETTINGS, JSON.stringify({ existing: true }));

      const results = await installSettings(item, ["claude"], "project", "copy", true, PROJECT);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);

      const settings = JSON.parse(vol.readFileSync(SETTINGS, "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.theme).toBe(DARK);
      expect(settings.fontSize).toBe(14);
    });

    it("should deep merge nested settings", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({
          editor: {
            tabSize: 2,
          },
        })
      );

      const { installSettings } = await import("./settings.js");

      const item: RegistryItem = {
        slug: EDITOR_SETTINGS,
        name: "Editor Settings",
        type: "settings",
        description: "Editor configuration",
        compatibility: ["claude"],
      };

      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      vol.writeFileSync(
        SETTINGS,
        JSON.stringify({
          editor: {
            lineNumbers: true,
          },
        })
      );

      await installSettings(item, ["claude"], "project", "copy", true, PROJECT);

      const settings = JSON.parse(vol.readFileSync(SETTINGS, "utf-8") as string);
      expect(settings.editor.lineNumbers).toBe(true);
      expect(settings.editor.tabSize).toBe(2);
    });

    it("should fail for non-claude tools", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(JSON.stringify({ theme: DARK }));

      const { installSettings } = await import("./settings.js");

      const item: RegistryItem = {
        slug: "settings",
        name: "Settings",
        type: "settings",
        description: "Settings",
        compatibility: ["claude"],
      };

      const results = await installSettings(item, ["copilot"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toContain("only supported for Claude");
    });

    it("should use local scope path correctly", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(JSON.stringify({ local: true }));

      const { installSettings } = await import("./settings.js");

      const item: RegistryItem = {
        slug: LOCAL_SETTINGS,
        name: "Local Settings",
        type: "settings",
        description: "Local settings",
        compatibility: ["claude"],
      };

      const results = await installSettings(item, ["claude"], "local", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(results[0]?.path).toBe(LOCAL_SETTINGS_FILE);
    });
  });

  describe("settingsHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { settingsHandler } = await import("./settings.js");

      expect(settingsHandler.type).toBe("settings");
      expect(typeof settingsHandler.install).toBe("function");
      expect(typeof settingsHandler.uninstall).toBe("function");
      expect(typeof settingsHandler.listInstalled).toBe("function");
      expect(typeof settingsHandler.plan).toBe("function");
    });

    it("rejects invalid settings content", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue("{oops");
      const { installSettings } = await import("./settings.js");
      const results = await installSettings(settingsItem("broken"), ["claude"], "project", "copy", true, PROJECT);
      expect(results[0]?.error).toBe("Invalid settings: must be valid JSON");
    });
  });

  describe("getInstalledSettings", () => {
    it("cannot discover settings items and says so by returning nothing", async () => {
      const { getInstalledSettings } = await import("./settings.js");
      expect(await getInstalledSettings("claude", "project", PROJECT)).toEqual([]);
      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      vol.writeFileSync(SETTINGS, JSON.stringify({ theme: DARK }));
      expect(await getInstalledSettings("claude", "project", PROJECT)).toEqual([]);
      expect(await getInstalledSettings("copilot", "project", PROJECT)).toEqual([]);
    });
  });

  describe("planSettings", () => {
    it("lists the settings file and the top-level keys that would be merged", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(JSON.stringify({ theme: DARK, editor: { tabSize: 2 } }));
      const { planSettings } = await import("./settings.js");

      expect(await planSettings(settingsItem("theme"), ["claude"], "local", "copy", PROJECT)).toEqual([
        { agent: "claude", kind: "create", path: LOCAL_SETTINGS_FILE, detail: "deep-merge keys: theme, editor" },
      ]);
      await expect(planSettings(settingsItem("theme"), ["codex"], "project", "copy", PROJECT)).rejects.toThrow(/only supported for Claude Code/);
      expect(vol.existsSync(CLAUDE_DIR)).toBe(false);
    });
  });

  describe("uninstallSettings", () => {
    it("should remove top-level keys added by settings item", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: DARK_THEME,
        name: "Dark Theme",
        type: "settings",
        description: "Dark theme",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ theme: DARK, fontSize: 14 })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      vol.writeFileSync(
        SETTINGS,
        JSON.stringify({ existing: true, theme: DARK, fontSize: 14 })
      );

      const result = await uninstallSettings(DARK_THEME, "claude", "project", PROJECT);

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync(SETTINGS, "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.theme).toBeUndefined();
      expect(settings.fontSize).toBeUndefined();
    });

    it("should deep-unmerge nested keys", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: EDITOR_SETTINGS,
        name: "Editor Settings",
        type: "settings",
        description: "Editor settings",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ editor: { tabSize: 2 } })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      vol.writeFileSync(
        SETTINGS,
        JSON.stringify({ editor: { lineNumbers: true, tabSize: 2 } })
      );

      const result = await uninstallSettings(EDITOR_SETTINGS, "claude", "project", PROJECT);

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync(SETTINGS, "utf-8") as string);
      expect(settings.editor.lineNumbers).toBe(true);
      expect(settings.editor.tabSize).toBeUndefined();
    });

    it("should remove nested object if all its keys came from install", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "new-section",
        name: "New Section",
        type: "settings",
        description: "New section settings",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ newSection: { a: 1, b: 2 } })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      vol.writeFileSync(
        SETTINGS,
        JSON.stringify({ existing: true, newSection: { a: 1, b: 2 } })
      );

      const result = await uninstallSettings("new-section", "claude", "project", PROJECT);

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync(SETTINGS, "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.newSection).toBeUndefined();
    });

    it("should handle user modifications to installed values", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: THEME_SETTINGS,
        name: "Theme",
        type: "settings",
        description: "Theme settings",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ theme: DARK })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      // User changed DARK to "light" after install
      vol.writeFileSync(
        SETTINGS,
        JSON.stringify({ theme: "light" })
      );

      const result = await uninstallSettings(THEME_SETTINGS, "claude", "project", PROJECT);

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync(SETTINGS, "utf-8") as string);
      expect(settings.theme).toBeUndefined();
    });

    it("should return false when item not found in registry", async () => {
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue(undefined);

      const { uninstallSettings } = await import("./settings.js");

      const result = await uninstallSettings("non-existent", "claude", "project", PROJECT);
      expect(result).toBe(false);
    });

    it("should return false for non-claude tools", async () => {
      const { uninstallSettings } = await import("./settings.js");

      const result = await uninstallSettings("any-settings", "copilot", "project", PROJECT);
      expect(result).toBe(false);
    });

    it.each(["../x", "../../x", "/etc", "a/b", "a\\b", "", "%2e%2e", "ünï"])("rejects invalid slug %j before reading the registry", async (slug) => {
      const { getItem } = await import("../config/registry.js");
      const { uninstallSettings } = await import("./settings.js");
      await expect(uninstallSettings(slug, "claude", "project", PROJECT)).rejects.toThrow(/Invalid settings slug/);
      expect(getItem).not.toHaveBeenCalled();
    });

    it("returns false when the settings file is missing or the content cannot be read", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue(settingsItem(THEME_SETTINGS));
      vi.mocked(getItemContent).mockResolvedValue(JSON.stringify({ theme: DARK }));
      const { uninstallSettings } = await import("./settings.js");
      expect(await uninstallSettings(THEME_SETTINGS, "claude", "project", PROJECT)).toBe(false);

      vi.mocked(getItemContent).mockRejectedValue(new Error("offline"));
      expect(await uninstallSettings(THEME_SETTINGS, "claude", "project", PROJECT)).toBe(false);
    });

    it("should work with local scope", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: LOCAL_SETTINGS,
        name: "Local Settings",
        type: "settings",
        description: "Local settings",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ localKey: "value" })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      vol.writeFileSync(
        LOCAL_SETTINGS_FILE,
        JSON.stringify({ existing: true, localKey: "value" })
      );

      const result = await uninstallSettings(LOCAL_SETTINGS, "claude", "local", PROJECT);

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync(LOCAL_SETTINGS_FILE, "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.localKey).toBeUndefined();
    });
  });
});
