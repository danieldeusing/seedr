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
  getItemSourcePath: vi.fn((item: RegistryItem) => {
    if (item.sourceType === "toolr") {
      return `/registry/skills/${item.slug}`;
    }
    return null;
  }),
  getItemContent: vi.fn(async () => "# Test Skill\n\nThis is a test skill."),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

describe("skill handler", () => {
  beforeEach(() => {
    vol.reset();
    // Set up a mock skill source directory
    vol.fromJSON({
      "/registry/skills/test-skill/SKILL.md": "# Test Skill\n\nContent here.",
      "/registry/skills/test-skill/examples/example.md": "# Example",
    });
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("installSkill", () => {
    it("should install skill to project scope", async () => {
      // Import after mocks are set up
      const { installSkill } = await import("./skill.js");

      const item: RegistryItem = {
        slug: "test-skill",
        name: "Test Skill",
        type: "skill",
        description: "A test skill",
        compatibility: ["claude"],
        sourceType: "toolr",
      };

      const results = await installSkill(item, ["claude"], "project", "copy", true, "/my/project");

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.agent).toBe("claude");
      expect(results[0]?.path).toBe("/my/project/.claude/skills/test-skill");
    });

    it("should install skill for multiple tools", async () => {
      const { installSkill } = await import("./skill.js");

      const item: RegistryItem = {
        slug: "test-skill",
        name: "Test Skill",
        type: "skill",
        description: "A test skill",
        compatibility: ["claude", "copilot"],
        sourceType: "toolr",
      };

      const results = await installSkill(
        item,
        ["claude", "copilot"],
        "project",
        "copy",
        true,
        "/my/project"
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it("should use symlink when method is symlink and source is toolr", async () => {
      const { installSkill } = await import("./skill.js");

      const item: RegistryItem = {
        slug: "test-skill",
        name: "Test Skill",
        type: "skill",
        description: "A test skill",
        compatibility: ["claude"],
        sourceType: "toolr",
      };

      const results = await installSkill(item, ["claude"], "project", "symlink", true, "/my/project");

      expect(results[0]?.success).toBe(true);

      // Check that content was copied to central .agents location
      expect(vol.existsSync("/my/project/.agents/skills/test-skill/SKILL.md")).toBe(true);

      // Check that tool folder contains a symlink to central location
      const stats = vol.lstatSync("/my/project/.claude/skills/test-skill");
      expect(stats.isSymbolicLink()).toBe(true);
    });

    it("should create symlinks for multiple tools pointing to central location", async () => {
      const { installSkill } = await import("./skill.js");

      const item: RegistryItem = {
        slug: "test-skill",
        name: "Test Skill",
        type: "skill",
        description: "A test skill",
        compatibility: ["claude", "copilot"],
        sourceType: "toolr",
      };

      const results = await installSkill(
        item,
        ["claude", "copilot"],
        "project",
        "symlink",
        true,
        "/my/project"
      );

      expect(results.every((r) => r.success)).toBe(true);

      // Central location should exist with content
      expect(vol.existsSync("/my/project/.agents/skills/test-skill/SKILL.md")).toBe(true);

      // Both tool folders should be symlinks
      const claudeStats = vol.lstatSync("/my/project/.claude/skills/test-skill");
      expect(claudeStats.isSymbolicLink()).toBe(true);

      const copilotStats = vol.lstatSync("/my/project/.github/skills/test-skill");
      expect(copilotStats.isSymbolicLink()).toBe(true);
    });

    it("should skip symlink for tools that read .agents/ directly", async () => {
      const { installSkill } = await import("./skill.js");

      const item: RegistryItem = {
        slug: "test-skill",
        name: "Test Skill",
        type: "skill",
        description: "A test skill",
        compatibility: ["claude", "gemini", "codex", "opencode"],
        sourceType: "toolr",
      };

      const results = await installSkill(
        item,
        ["claude", "gemini", "codex", "opencode"],
        "project",
        "symlink",
        true,
        "/my/project"
      );

      expect(results.every((r) => r.success)).toBe(true);

      // Central location should exist with content
      expect(vol.existsSync("/my/project/.agents/skills/test-skill/SKILL.md")).toBe(true);

      // Claude should have a symlink
      const claudeStats = vol.lstatSync("/my/project/.claude/skills/test-skill");
      expect(claudeStats.isSymbolicLink()).toBe(true);

      // Gemini, Codex, OpenCode should NOT have symlinks (they read .agents/skills/ directly)
      expect(vol.existsSync("/my/project/.gemini/skills/test-skill")).toBe(false);
      expect(vol.existsSync("/my/project/.codex/skills/test-skill")).toBe(false);
      expect(vol.existsSync("/my/project/.opencode/skills/test-skill")).toBe(false);

      // Their results should point to the central path
      for (const tool of ["gemini", "codex", "opencode"] as const) {
        const result = results.find((r) => r.agent === tool);
        expect(result?.path).toBe("/my/project/.agents/skills/test-skill");
      }
    });
  });

  describe("uninstallSkill", () => {
    it("should remove installed skill", async () => {
      const { uninstallSkill } = await import("./skill.js");

      // Create an installed skill
      vol.mkdirSync("/my/project/.claude/skills/test-skill", { recursive: true });
      vol.writeFileSync("/my/project/.claude/skills/test-skill/SKILL.md", "# Test");

      const result = await uninstallSkill("test-skill", "claude", "project", "/my/project");

      expect(result).toBe(true);
      expect(vol.existsSync("/my/project/.claude/skills/test-skill")).toBe(false);
    });

    it("should return false for non-existent skill", async () => {
      const { uninstallSkill } = await import("./skill.js");

      const result = await uninstallSkill("nonexistent", "claude", "project", "/my/project");

      expect(result).toBe(false);
    });
  });

  describe("getInstalledSkills", () => {
    it("should list installed skills", async () => {
      const { getInstalledSkills } = await import("./skill.js");

      // Create some installed skills
      vol.mkdirSync("/my/project/.claude/skills/skill-a", { recursive: true });
      vol.mkdirSync("/my/project/.claude/skills/skill-b", { recursive: true });

      const skills = await getInstalledSkills("claude", "project", "/my/project");

      expect(skills).toContain("skill-a");
      expect(skills).toContain("skill-b");
      expect(skills).toHaveLength(2);
    });

    it("should return empty array for no skills", async () => {
      const { getInstalledSkills } = await import("./skill.js");

      const skills = await getInstalledSkills("claude", "project", "/my/project");

      expect(skills).toEqual([]);
    });
  });

  describe("skillHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { skillHandler } = await import("./skill.js");

      expect(skillHandler.type).toBe("skill");
      expect(typeof skillHandler.install).toBe("function");
      expect(typeof skillHandler.uninstall).toBe("function");
      expect(typeof skillHandler.listInstalled).toBe("function");
    });
  });
});
