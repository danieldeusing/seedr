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
  getItemSourcePath: vi.fn((item: RegistryItem) => `/registry/${item.type}s/${item.slug}`),
  fetchItemToDestination: vi.fn(),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

describe("hook handler", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("installHook", () => {
    it("should merge hook into settings.json", async () => {
      const { installHook } = await import("./hook.js");

      const item: RegistryItem = {
        slug: "lint-hook",
        name: "Lint Hook",
        type: "hook",
        description: "Pre-commit lint hook",
        compatibility: ["claude"],
        contents: {
          files: [{ name: "lint-hook.sh", type: "file" }],
          triggers: [{ event: "PreCommit" }],
        },
      };

      // Create existing settings file and script source
      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync("/my/project/.claude/settings.json", JSON.stringify({ existing: true }));
      vol.mkdirSync("/registry/hooks/lint-hook", { recursive: true });
      vol.writeFileSync("/registry/hooks/lint-hook/lint-hook.sh", "#!/bin/bash\npnpm lint");

      const results = await installHook(item, ["claude"], "project", "copy", true, "/my/project");

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.existing).toBe(true);
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PreCommit).toEqual([{ hooks: [{ type: "command", command: ".claude/hooks/lint-hook.sh" }] }]);
    });

    it("should append to existing hooks array with same matcher", async () => {
      const { installHook } = await import("./hook.js");

      const item: RegistryItem = {
        slug: "test-hook",
        name: "Test Hook",
        type: "hook",
        description: "Pre-commit test hook",
        compatibility: ["claude"],
        contents: {
          files: [{ name: "test-hook.sh", type: "file" }],
          triggers: [{ event: "PreCommit" }],
        },
      };

      // Create settings with existing hook entry (same event, no matcher) and script source
      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          hooks: {
            PreCommit: [{ hooks: [{ type: "command", command: "pnpm lint" }] }],
          },
        })
      );
      vol.mkdirSync("/registry/hooks/test-hook", { recursive: true });
      vol.writeFileSync("/registry/hooks/test-hook/test-hook.sh", "#!/bin/bash\npnpm test");

      await installHook(item, ["claude"], "project", "copy", true, "/my/project");

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      // Same matcher (undefined) — appends to existing entry's hooks array
      expect(settings.hooks.PreCommit).toHaveLength(1);
      expect(settings.hooks.PreCommit[0].hooks).toHaveLength(2);
      expect(settings.hooks.PreCommit[0].hooks[0]).toEqual({ type: "command", command: "pnpm lint" });
      expect(settings.hooks.PreCommit[0].hooks[1]).toEqual({ type: "command", command: ".claude/hooks/test-hook.sh" });
    });

    it("should fail for non-claude tools", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({
          event: "PreCommit",
          hooks: [{ type: "command", command: "pnpm lint" }],
        })
      );

      const { installHook } = await import("./hook.js");

      const item: RegistryItem = {
        slug: "lint-hook",
        name: "Lint Hook",
        type: "hook",
        description: "Pre-commit lint hook",
        compatibility: ["claude"],
      };

      const results = await installHook(item, ["copilot"], "project", "copy", true, "/my/project");

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toContain("only supported for Claude");
    });

    it("should use hook key with matcher when provided", async () => {
      const { installHook } = await import("./hook.js");

      const item: RegistryItem = {
        slug: "ts-check-hook",
        name: "TS Check Hook",
        type: "hook",
        description: "TypeScript check hook",
        compatibility: ["claude"],
        contents: {
          files: [{ name: "ts-check-hook.sh", type: "file" }],
          triggers: [{ event: "PreCommit", matcher: "*.ts" }],
        },
      };

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync("/my/project/.claude/settings.json", "{}");
      vol.mkdirSync("/registry/hooks/ts-check-hook", { recursive: true });
      vol.writeFileSync("/registry/hooks/ts-check-hook/ts-check-hook.sh", "#!/bin/bash\ntsc --noEmit");

      await installHook(item, ["claude"], "project", "copy", true, "/my/project");

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.hooks.PreCommit).toBeDefined();
      expect(settings.hooks.PreCommit[0].matcher).toBe("*.ts");
      expect(settings.hooks.PreCommit[0].hooks[0].command).toBe(".claude/hooks/ts-check-hook.sh");
    });
  });

  describe("hookHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { hookHandler } = await import("./hook.js");

      expect(hookHandler.type).toBe("hook");
      expect(typeof hookHandler.install).toBe("function");
      expect(typeof hookHandler.uninstall).toBe("function");
      expect(typeof hookHandler.listInstalled).toBe("function");
    });
  });

  describe("uninstallHook", () => {
    it("should remove hook entries from settings.json and delete script file", async () => {
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "lint-hook",
        name: "Lint Hook",
        type: "hook",
        description: "Pre-commit lint hook",
        compatibility: ["claude"],
        contents: {
          files: [{ name: "lint-hook.sh", type: "file" }],
          triggers: [{ event: "PreToolUse", matcher: "Bash" }],
        },
      });

      const { uninstallHook } = await import("./hook.js");

      // Set up installed state: settings + script file
      vol.mkdirSync("/my/project/.claude/hooks", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          hooks: {
            PreToolUse: [
              { matcher: "Bash", hooks: [{ type: "command", command: ".claude/hooks/lint-hook.sh" }] },
            ],
          },
        })
      );
      vol.writeFileSync("/my/project/.claude/hooks/lint-hook.sh", "#!/bin/bash\npnpm lint");

      const result = await uninstallHook("lint-hook", "claude", "project", "/my/project");

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.hooks).toBeUndefined();

      expect(vol.existsSync("/my/project/.claude/hooks/lint-hook.sh")).toBe(false);
    });

    it("should preserve unrelated hooks in same event", async () => {
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "hook-a",
        name: "Hook A",
        type: "hook",
        description: "Hook A",
        compatibility: ["claude"],
        contents: {
          files: [{ name: "hook-a.sh", type: "file" }],
          triggers: [{ event: "PreToolUse", matcher: "Bash" }],
        },
      });

      const { uninstallHook } = await import("./hook.js");

      vol.mkdirSync("/my/project/.claude/hooks", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: ".claude/hooks/hook-a.sh" },
                  { type: "command", command: ".claude/hooks/hook-b.sh" },
                ],
              },
            ],
          },
        })
      );
      vol.writeFileSync("/my/project/.claude/hooks/hook-a.sh", "#!/bin/bash\necho a");

      await uninstallHook("hook-a", "claude", "project", "/my/project");

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0].hooks).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(".claude/hooks/hook-b.sh");
    });

    it("should remove hook from multiple events", async () => {
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "security-guard",
        name: "Security Guard",
        type: "hook",
        description: "Security guard hook",
        compatibility: ["claude"],
        contents: {
          files: [{ name: "security-guard.sh", type: "file" }],
          triggers: [
            { event: "PreToolUse", matcher: "Bash" },
            { event: "PreToolUse", matcher: "Write" },
          ],
        },
      });

      const { uninstallHook } = await import("./hook.js");

      vol.mkdirSync("/my/project/.claude/hooks", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          hooks: {
            PreToolUse: [
              { matcher: "Bash", hooks: [{ type: "command", command: ".claude/hooks/security-guard.sh" }] },
              { matcher: "Write", hooks: [{ type: "command", command: ".claude/hooks/security-guard.sh" }] },
            ],
          },
        })
      );
      vol.writeFileSync("/my/project/.claude/hooks/security-guard.sh", "#!/bin/bash\necho guard");

      const result = await uninstallHook("security-guard", "claude", "project", "/my/project");

      expect(result).toBe(true);

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.hooks).toBeUndefined();
    });

    it("should clean up empty events and hooks key", async () => {
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "solo-hook",
        name: "Solo Hook",
        type: "hook",
        description: "Only hook",
        compatibility: ["claude"],
        contents: {
          files: [{ name: "solo-hook.sh", type: "file" }],
          triggers: [{ event: "PreCommit" }],
        },
      });

      const { uninstallHook } = await import("./hook.js");

      vol.mkdirSync("/my/project/.claude/hooks", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          hooks: {
            PreCommit: [{ hooks: [{ type: "command", command: ".claude/hooks/solo-hook.sh" }] }],
          },
        })
      );
      vol.writeFileSync("/my/project/.claude/hooks/solo-hook.sh", "#!/bin/bash\necho solo");

      await uninstallHook("solo-hook", "claude", "project", "/my/project");

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.hooks).toBeUndefined();
      expect(Object.keys(settings)).toHaveLength(0);
    });

    it("should handle user-modified settings around hooks", async () => {
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue({
        slug: "my-hook",
        name: "My Hook",
        type: "hook",
        description: "A hook",
        compatibility: ["claude"],
        contents: {
          files: [{ name: "my-hook.sh", type: "file" }],
          triggers: [{ event: "PreCommit" }],
        },
      });

      const { uninstallHook } = await import("./hook.js");

      vol.mkdirSync("/my/project/.claude/hooks", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          customSetting: "keep-me",
          hooks: {
            PreCommit: [{ hooks: [{ type: "command", command: ".claude/hooks/my-hook.sh" }] }],
          },
          anotherSetting: 42,
        })
      );
      vol.writeFileSync("/my/project/.claude/hooks/my-hook.sh", "#!/bin/bash\necho hook");

      await uninstallHook("my-hook", "claude", "project", "/my/project");

      const settings = JSON.parse(vol.readFileSync("/my/project/.claude/settings.json", "utf-8") as string);
      expect(settings.customSetting).toBe("keep-me");
      expect(settings.anotherSetting).toBe(42);
      expect(settings.hooks).toBeUndefined();
    });

    it("should return false for non-existent hook", async () => {
      const { getItem } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue(undefined);

      const { uninstallHook } = await import("./hook.js");

      const result = await uninstallHook("non-existent", "claude", "project", "/my/project");
      expect(result).toBe(false);
    });

    it("should return false for non-claude tools", async () => {
      const { uninstallHook } = await import("./hook.js");

      const result = await uninstallHook("any-hook", "copilot", "project", "/my/project");
      expect(result).toBe(false);
    });
  });

  describe("getInstalledHooks", () => {
    it("should return slugs from hook command paths", async () => {
      const { getInstalledHooks } = await import("./hook.js");

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          hooks: {
            PreCommit: [{ hooks: [{ type: "command", command: ".claude/hooks/my-hook.sh" }] }],
          },
        })
      );

      const slugs = await getInstalledHooks("claude", "project", "/my/project");
      expect(slugs).toEqual(["my-hook"]);
    });

    it("should return empty for no hooks", async () => {
      const { getInstalledHooks } = await import("./hook.js");

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync("/my/project/.claude/settings.json", JSON.stringify({}));

      const slugs = await getInstalledHooks("claude", "project", "/my/project");
      expect(slugs).toEqual([]);
    });

    it("should deduplicate slugs across events", async () => {
      const { getInstalledHooks } = await import("./hook.js");

      vol.mkdirSync("/my/project/.claude", { recursive: true });
      vol.writeFileSync(
        "/my/project/.claude/settings.json",
        JSON.stringify({
          hooks: {
            PreToolUse: [
              { matcher: "Bash", hooks: [{ type: "command", command: ".claude/hooks/guard.sh" }] },
              { matcher: "Write", hooks: [{ type: "command", command: ".claude/hooks/guard.sh" }] },
            ],
          },
        })
      );

      const slugs = await getInstalledHooks("claude", "project", "/my/project");
      expect(slugs).toEqual(["guard"]);
    });
  });
});
