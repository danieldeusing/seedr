import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import { isFirstParty } from "@seedr/registry-ops/pure";
import type { RegistryItem } from "@seedr/shared";

const TEST_AGENT = "test-agent";
const OUTSIDE_AGENT = "/outside/AGENT.md";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// Mock the registry module
vi.mock("../config/registry.js", () => ({
  getItemSourcePath: vi.fn((item: RegistryItem) => {
    if (isFirstParty(item.sourceType)) {
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

const PROJECT = "/my/project";
const AGENTS_DIR = `${PROJECT}/.claude/agents`;
const AGENT_FILE = `${AGENTS_DIR}/test-agent.md`;

function agentItem(overrides: Partial<RegistryItem> = {}): RegistryItem {
  return {
    slug: TEST_AGENT,
    name: "Test Agent",
    type: "agent",
    description: "A test agent",
    compatibility: ["claude"],
    sourceType: "seedr",
    ...overrides,
  };
}

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

      const results = await installAgent(agentItem(), ["claude"], "project", "copy", true, PROJECT);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.path).toBe(AGENT_FILE);
      expect(vol.readFileSync(AGENT_FILE, "utf-8")).toContain("# Test Agent");
    });

    it("symlinks a local AGENT.md when asked to", async () => {
      vol.fromJSON({ "/registry/agents/test-agent/AGENT.md": "# local" });
      const { installAgent } = await import("./agent.js");

      const results = await installAgent(agentItem(), ["claude"], "project", "symlink", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(vol.lstatSync(AGENT_FILE).isSymbolicLink()).toBe(true);
      expect(vol.readlinkSync(AGENT_FILE)).toBe("../../../../registry/agents/test-agent/AGENT.md");
    });

    it("falls back to content when symlink is requested but no local file exists", async () => {
      const { installAgent } = await import("./agent.js");
      const results = await installAgent(agentItem({ sourceType: "official" }), ["claude"], "user", "symlink", true, PROJECT);
      expect(results[0]?.path).toBe("/home/testuser/.claude/agents/test-agent.md");
      expect(vol.lstatSync("/home/testuser/.claude/agents/test-agent.md").isSymbolicLink()).toBe(false);
    });

    it("should fail for non-claude tools", async () => {
      const { installAgent } = await import("./agent.js");
      const results = await installAgent(agentItem(), ["copilot"], "project", "copy", true, PROJECT);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toContain("does not support agents");
    });

    it("refuses to overwrite without force", async () => {
      const { installAgent } = await import("./agent.js");
      vol.mkdirSync(AGENTS_DIR, { recursive: true });
      vol.writeFileSync(AGENT_FILE, "mine");
      const results = await installAgent(agentItem(), ["claude"], "project", "copy", false, PROJECT);
      expect(results[0]?.error).toMatch(/already exists; pass --force/);
      expect(vol.readFileSync(AGENT_FILE, "utf-8")).toBe("mine");
    });

    it("rejects invalid slugs and escaping agent directories", async () => {
      const { installAgent } = await import("./agent.js");
      expect((await installAgent(agentItem({ slug: "../x" }), ["claude"], "project", "copy", true, PROJECT))[0]?.error).toMatch(/Invalid agent slug/);

      vol.mkdirSync(`${PROJECT}/.claude`, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.symlinkSync("/outside", AGENTS_DIR);
      expect((await installAgent(agentItem(), ["claude"], "project", "copy", true, PROJECT))[0]?.error).toMatch(/Refusing path outside/);
      expect(vol.readdirSync("/outside")).toEqual([]);
    });
  });

  describe("uninstallAgent", () => {
    it("should remove installed agent", async () => {
      const { uninstallAgent } = await import("./agent.js");
      vol.mkdirSync(AGENTS_DIR, { recursive: true });
      vol.writeFileSync(AGENT_FILE, "# Agent");

      expect(await uninstallAgent(TEST_AGENT, "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync(AGENT_FILE)).toBe(false);
    });

    it("should return false for non-existent agent or unsupported tool", async () => {
      const { uninstallAgent } = await import("./agent.js");
      expect(await uninstallAgent("nonexistent", "claude", "project", PROJECT)).toBe(false);
      expect(await uninstallAgent(TEST_AGENT, "copilot", "project", PROJECT)).toBe(false);
    });

    it("unlinks a symlink entry without following it and refuses directories", async () => {
      const { uninstallAgent } = await import("./agent.js");
      vol.mkdirSync(AGENTS_DIR, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.writeFileSync(OUTSIDE_AGENT, "target");
      vol.symlinkSync(OUTSIDE_AGENT, AGENT_FILE);

      expect(await uninstallAgent(TEST_AGENT, "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync(AGENT_FILE)).toBe(false);
      expect(vol.readFileSync(OUTSIDE_AGENT, "utf-8")).toBe("target");

      vol.mkdirSync(`${AGENTS_DIR}/dir-agent.md`);
      await expect(uninstallAgent("dir-agent", "claude", "project", PROJECT)).rejects.toThrow(/is a directory; refusing/);
    });

    it.each(["../x", "../../x", "/etc", "a/b", "a\\b", "", "%2e%2e", "ünï", "a".repeat(101)])("rejects invalid slug %j", async (slug) => {
      const { uninstallAgent } = await import("./agent.js");
      await expect(uninstallAgent(slug, "claude", "project", PROJECT)).rejects.toThrow(/Invalid agent slug/);
    });

    it("refuses an agents directory resolving outside the scope root", async () => {
      const { uninstallAgent } = await import("./agent.js");
      vol.mkdirSync("/outside", { recursive: true });
      vol.writeFileSync("/outside/test-agent.md", "victim");
      vol.mkdirSync(`${PROJECT}/.claude`, { recursive: true });
      vol.symlinkSync("/outside", AGENTS_DIR);

      await expect(uninstallAgent(TEST_AGENT, "claude", "project", PROJECT)).rejects.toThrow(/Refusing path outside/);
      expect(vol.existsSync("/outside/test-agent.md")).toBe(true);
    });
  });

  describe("getInstalledAgents", () => {
    it("should list installed agents", async () => {
      const { getInstalledAgents } = await import("./agent.js");
      vol.mkdirSync(AGENTS_DIR, { recursive: true });
      vol.writeFileSync(`${AGENTS_DIR}/agent-a.md`, "# A");
      vol.writeFileSync(`${AGENTS_DIR}/agent-b.md`, "# B");
      vol.writeFileSync(`${AGENTS_DIR}/notes.txt`, "x");

      expect((await getInstalledAgents("claude", "project", PROJECT)).sort()).toEqual(["agent-a", "agent-b"]);
    });

    it("should return empty array for unsupported tool", async () => {
      const { getInstalledAgents } = await import("./agent.js");
      expect(await getInstalledAgents("copilot", "project", PROJECT)).toEqual([]);
    });
  });

  describe("planAgent", () => {
    it("describes the file that would be written", async () => {
      const { planAgent } = await import("./agent.js");
      vol.fromJSON({ "/registry/agents/test-agent/AGENT.md": "# local" });
      expect(await planAgent(agentItem(), ["claude"], "project", "symlink", PROJECT)).toEqual([
        { agent: "claude", kind: "create", path: AGENT_FILE, detail: "symlink → /registry/agents/test-agent/AGENT.md" },
      ]);
      vol.mkdirSync(AGENTS_DIR, { recursive: true });
      vol.writeFileSync(AGENT_FILE, "x");
      expect(await planAgent(agentItem({ sourceType: "official" }), ["claude"], "project", "copy", PROJECT)).toEqual([
        { agent: "claude", kind: "modify", path: AGENT_FILE, detail: "agent definition file" },
      ]);
      await expect(planAgent(agentItem(), ["gemini"], "project", "copy", PROJECT)).rejects.toThrow(/does not support agents/);
    });
  });

  describe("agentHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { agentHandler } = await import("./agent.js");

      expect(agentHandler.type).toBe("agent");
      expect(typeof agentHandler.install).toBe("function");
      expect(typeof agentHandler.uninstall).toBe("function");
      expect(typeof agentHandler.listInstalled).toBe("function");
      expect(typeof agentHandler.plan).toBe("function");
    });
  });
});
