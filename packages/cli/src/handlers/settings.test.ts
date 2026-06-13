import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";

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
          theme: "dark",
          fontSize: 14,
        })
      );

      const { installSettings } = await import("./settings.js");

      const item: RegistryItem = {
        slug: "dark-theme",
        name: "Dark Theme Settings",
        type: "settings",
        description: "Dark theme configuration",
        compatibility: ["claude"],
      };

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync("/my/project/.claude/settings.json", JSON.stringify({ existing: true }));

      const results = await installSettings(item, ["claude"], "project", "copy", true, "/my/project");

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.theme).toBe("dark");
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
        slug: "editor-settings",
        name: "Editor Settings",
        type: "settings",
        description: "Editor configuration",
        compatibility: ["claude"],
      };

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          editor: {
            lineNumbers: true,
          },
        })
      );

      await installSettings(item, ["claude"], "project", "copy", true, "/my/project");

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.editor.lineNumbers).toBe(true);
      expect(settings.editor.tabSize).toBe(2);
    });

    it("should fail for non-claude tools", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(JSON.stringify({ theme: "dark" }));

      const { installSettings } = await import("./settings.js");

      const item: RegistryItem = {
        slug: "settings",
        name: "Settings",
        type: "settings",
        description: "Settings",
        compatibility: ["claude"],
      };

      const results = await installSettings(item, ["copilot"], "project", "copy", true, "/my/project");

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toContain("only supported for Claude");
    });

    it("should use local scope path correctly", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(JSON.stringify({ local: true }));

      const { installSettings } = await import("./settings.js");

      const item: RegistryItem = {
        slug: "local-settings",
        name: "Local Settings",
        type: "settings",
        description: "Local settings",
        compatibility: ["claude"],
      };

      const results = await installSettings(item, ["claude"], "local", "copy", true, "/my/project");

      expect(results[0]?.success).toBe(true);
      expect(results[0]?.path).toBe("/my/project/.claude/settings.local.json");
    });
  });

  describe("settingsHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { settingsHandler } = await import("./settings.js");

      expect(settingsHandler.type).toBe("settings");
      expect(typeof settingsHandler.install).toBe("function");
      expect(typeof settingsHandler.uninstall).toBe("function");
      expect(typeof settingsHandler.listInstalled).toBe("function");
    });
  });

  describe("uninstallSettings", () => {
    it("should remove top-level keys added by settings item", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "dark-theme",
        name: "Dark Theme",
        type: "settings",
        description: "Dark theme",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ theme: "dark", fontSize: 14 })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({ existing: true, theme: "dark", fontSize: 14 })
      );

      const result = await uninstallSettings("dark-theme", "claude", "project", "/my/project");

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.theme).toBeUndefined();
      expect(settings.fontSize).toBeUndefined();
    });

    it("should deep-unmerge nested keys", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "editor-settings",
        name: "Editor Settings",
        type: "settings",
        description: "Editor settings",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ editor: { tabSize: 2 } })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({ editor: { lineNumbers: true, tabSize: 2 } })
      );

      const result = await uninstallSettings("editor-settings", "claude", "project", "/my/project");

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
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

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({ existing: true, newSection: { a: 1, b: 2 } })
      );

      const result = await uninstallSettings("new-section", "claude", "project", "/my/project");

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.newSection).toBeUndefined();
    });

    it("should handle user modifications to installed values", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "theme-settings",
        name: "Theme",
        type: "settings",
        description: "Theme settings",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ theme: "dark" })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      // User changed "dark" to "light" after install
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({ theme: "light" })
      );

      const result = await uninstallSettings("theme-settings", "claude", "project", "/my/project");

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.theme).toBeUndefined();
    });

    it("should return false when item not found in registry", async () => {
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue(undefined);

      const { uninstallSettings } = await import("./settings.js");

      const result = await uninstallSettings("non-existent", "claude", "project", "/my/project");
      expect(result).toBe(false);
    });

    it("should return false for non-claude tools", async () => {
      const { uninstallSettings } = await import("./settings.js");

      const result = await uninstallSettings("any-settings", "copilot", "project", "/my/project");
      expect(result).toBe(false);
    });

    it("should work with local scope", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "local-settings",
        name: "Local Settings",
        type: "settings",
        description: "Local settings",
        compatibility: ["claude"],
      });
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({ localKey: "value" })
      );

      const { uninstallSettings } = await import("./settings.js");

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.local.json",
        JSON.stringify({ existing: true, localKey: "value" })
      );

      const result = await uninstallSettings("local-settings", "claude", "local", "/my/project");

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.local.json", "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.localKey).toBeUndefined();
    });
  });
});
