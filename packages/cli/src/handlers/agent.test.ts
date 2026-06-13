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
      return `/registry/agents/${item.slug}`;
    }
    return null;
  }),
  getItemContent: vi.fn(async () => "---\nname: Test Agent\n---\n\n# Test Agent\n\nInstructions here."),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

describe("agent handler", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("installAgent", () => {
    it("should install agent as single file", async () => {
      const { installAgent } = await import("./agent.js");

      const item: RegistryItem = {
        slug: "test-agent",
        name: "Test Agent",
        type: "agent",
        description: "A test agent",
        compatibility: ["claude"],
        sourceType: "toolr",
      };

      const results = await installAgent(item, ["claude"], "project", "copy", true, "/my/project");

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.path).toBe("/my/project/.claude/agents/test-agent.md");

      expect(vol.existsSync("/my/project/.claude/agents/test-agent.md")).toBe(true);
    });

    it("should fail for non-claude tools", async () => {
      const { installAgent } = await import("./agent.js");

      const item: RegistryItem = {
        slug: "test-agent",
        name: "Test Agent",
        type: "agent",
        description: "A test agent",
        compatibility: ["claude"],
      };

      const results = await installAgent(item, ["copilot"], "project", "copy", true, "/my/project");

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toContain("does not support agents");
    });
  });

  describe("uninstallAgent", () => {
    it("should remove installed agent", async () => {
      const { uninstallAgent } = await import("./agent.js");

      vol.mkdirSync("/my/project/.claude/agents", { recursive: true });
      vol.writeFileSync("/my/project/.claude/agents/test-agent.md", "# Agent");

      const result = await uninstallAgent("test-agent", "claude", "project", "/my/project");

      expect(result).toBe(true);
      expect(vol.existsSync("/my/project/.claude/agents/test-agent.md")).toBe(false);
    });

    it("should return false for non-existent agent", async () => {
      const { uninstallAgent } = await import("./agent.js");

      const result = await uninstallAgent("nonexistent", "claude", "project", "/my/project");

      expect(result).toBe(false);
    });
  });

  describe("getInstalledAgents", () => {
    it("should list installed agents", async () => {
      const { getInstalledAgents } = await import("./agent.js");

      vol.mkdirSync("/my/project/.claude/agents", { recursive: true });
      vol.writeFileSync("/my/project/.claude/agents/agent-a.md", "# A");
      vol.writeFileSync("/my/project/.claude/agents/agent-b.md", "# B");

      const agents = await getInstalledAgents("claude", "project", "/my/project");

      expect(agents).toContain("agent-a");
      expect(agents).toContain("agent-b");
      expect(agents).toHaveLength(2);
    });

    it("should return empty array for unsupported tool", async () => {
      const { getInstalledAgents } = await import("./agent.js");

      const agents = await getInstalledAgents("copilot", "project", "/my/project");

      expect(agents).toEqual([]);
    });
  });

  describe("agentHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { agentHandler } = await import("./agent.js");

      expect(agentHandler.type).toBe("agent");
      expect(typeof agentHandler.install).toBe("function");
      expect(typeof agentHandler.uninstall).toBe("function");
      expect(typeof agentHandler.listInstalled).toBe("function");
    });
  });
});
