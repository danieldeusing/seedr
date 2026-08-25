import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import { isFirstParty } from "@seedr/registry-ops/pure";
import type { RegistryItem } from "@seedr/shared";

const TEST_SKILL = "test-skill";
const CENTRAL_LINK = "../../.agents/skills/test-skill";
const USER_CLAUDE_SKILL = "/home/testuser/.claude/skills/test-skill";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// Mock the registry module
vi.mock("../config/registry.js", () => ({
  getItemSourcePath: vi.fn((item: RegistryItem) => {
    if (isFirstParty(item.sourceType)) {
      return `/registry/skills/${item.slug}`;
    }
    return null;
  }),
  getItemContent: vi.fn(async () => "# Test Skill\n\nThis is a test skill."),
  fetchItemToDestination: vi.fn(),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const PROJECT = "/my/project";
const CLAUDE_SKILL = `${PROJECT}/.claude/skills/test-skill`;
const CENTRAL_SKILL = `${PROJECT}/.agents/skills/test-skill`;
const SKILL_MD = "SKILL.md";

function skillItem(overrides: Partial<RegistryItem> = {}): RegistryItem {
  return {
    slug: TEST_SKILL,
    name: "Test Skill",
    type: "skill",
    description: "A test skill",
    compatibility: ["claude"],
    sourceType: "seedr",
    ...overrides,
  };
}

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
    vi.resetAllMocks();
  });

  describe("installSkill", () => {
    it("should install skill to project scope", async () => {
      const { installSkill } = await import("./skill.js");

      const results = await installSkill(skillItem(), ["claude"], "project", "copy", true, PROJECT);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.agent).toBe("claude");
      expect(results[0]?.path).toBe(CLAUDE_SKILL);
      expect(vol.readFileSync(`${CLAUDE_SKILL}/examples/example.md`, "utf-8")).toBe("# Example");
    });

    it("should install skill for multiple tools", async () => {
      const { installSkill } = await import("./skill.js");

      const results = await installSkill(skillItem({ compatibility: ["claude", "copilot"] }), ["claude", "copilot"], "project", "copy", true, PROJECT);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(vol.existsSync(`${PROJECT}/.github/skills/test-skill/${SKILL_MD}`)).toBe(true);
    });

    it("should use symlink when method is symlink and the item is first-party", async () => {
      const { installSkill } = await import("./skill.js");

      const results = await installSkill(skillItem(), ["claude"], "project", "symlink", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(vol.existsSync(`${CENTRAL_SKILL}/${SKILL_MD}`)).toBe(true);
      expect(vol.lstatSync(CLAUDE_SKILL).isSymbolicLink()).toBe(true);
      expect(vol.readlinkSync(CLAUDE_SKILL)).toBe(CENTRAL_LINK);
    });

    it("should create symlinks for multiple tools pointing to central location", async () => {
      const { installSkill } = await import("./skill.js");

      const results = await installSkill(skillItem({ compatibility: ["claude", "copilot"] }), ["claude", "copilot"], "project", "symlink", true, PROJECT);

      expect(results.every((r) => r.success)).toBe(true);
      expect(vol.existsSync(`${CENTRAL_SKILL}/${SKILL_MD}`)).toBe(true);
      expect(vol.lstatSync(CLAUDE_SKILL).isSymbolicLink()).toBe(true);
      expect(vol.lstatSync(`${PROJECT}/.github/skills/test-skill`).isSymbolicLink()).toBe(true);
    });

    it("should skip symlink for tools that read .agents/ directly", async () => {
      const { installSkill } = await import("./skill.js");
      const agents = ["claude", "antigravity", "codex", "opencode"] as const;

      const results = await installSkill(skillItem({ compatibility: [...agents] }), [...agents], "project", "symlink", true, PROJECT);

      expect(results.every((r) => r.success)).toBe(true);
      expect(vol.existsSync(`${CENTRAL_SKILL}/${SKILL_MD}`)).toBe(true);
      expect(vol.lstatSync(CLAUDE_SKILL).isSymbolicLink()).toBe(true);
      for (const tool of ["antigravity", "codex", "opencode"] as const) {
        expect(vol.existsSync(`${PROJECT}/.${tool}/skills/test-skill`)).toBe(false);
        expect(results.find((r) => r.agent === tool)?.path).toBe(CENTRAL_SKILL);
      }
    });

    it("installs user scope under the home directory", async () => {
      const { installSkill } = await import("./skill.js");
      const results = await installSkill(skillItem(), ["claude"], "user", "symlink", true, PROJECT);
      expect(results[0]?.path).toBe(USER_CLAUDE_SKILL);
      expect(vol.readlinkSync(USER_CLAUDE_SKILL)).toBe(CENTRAL_LINK);
      expect(vol.existsSync(`/home/testuser/.agents/skills/test-skill/${SKILL_MD}`)).toBe(true);
    });

    it("refuses to overwrite an existing skill without force", async () => {
      const { installSkill } = await import("./skill.js");
      vol.mkdirSync(CLAUDE_SKILL, { recursive: true });
      vol.writeFileSync(`${CLAUDE_SKILL}/${SKILL_MD}`, "user edited");

      const results = await installSkill(skillItem(), ["claude"], "project", "copy", false, PROJECT);

      expect(results[0]?.error).toMatch(/already exists; pass --force/);
      expect(vol.readFileSync(`${CLAUDE_SKILL}/${SKILL_MD}`, "utf-8")).toBe("user edited");
    });

    it("fetches remote items through the verified download", async () => {
      const { fetchItemToDestination } = await import("../config/registry.js");
      vi.mocked(fetchItemToDestination).mockImplementation(async (_item: RegistryItem, dest: string) => {
        vol.mkdirSync(dest, { recursive: true });
        vol.writeFileSync(`${dest}/${SKILL_MD}`, "# remote");
        return { sourceRevision: "a".repeat(40), contentDigest: "b".repeat(64), files: [SKILL_MD] };
      });
      const { installSkill } = await import("./skill.js");

      const results = await installSkill(skillItem({ sourceType: "official" }), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(fetchItemToDestination).toHaveBeenCalledWith(expect.objectContaining({ slug: TEST_SKILL }), CLAUDE_SKILL);
      expect(vol.readFileSync(`${CLAUDE_SKILL}/${SKILL_MD}`, "utf-8")).toBe("# remote");
    });

    it("reports an integrity failure per agent without touching the destination", async () => {
      const { fetchItemToDestination } = await import("../config/registry.js");
      vi.mocked(fetchItemToDestination).mockRejectedValue(new Error("Registry integrity error: mismatch"));
      const { installSkill } = await import("./skill.js");

      const results = await installSkill(skillItem({ sourceType: "official" }), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toMatch(/Registry integrity error/);
      expect(vol.existsSync(CLAUDE_SKILL)).toBe(false);
    });

    it("refuses an agent skills directory that is a symlink escaping the project", async () => {
      const { installSkill } = await import("./skill.js");
      vol.mkdirSync(`${PROJECT}/.claude`, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.symlinkSync("/outside", `${PROJECT}/.claude/skills`);

      const results = await installSkill(skillItem(), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.error).toMatch(/Refusing path outside \/my\/project/);
      expect(vol.readdirSync("/outside")).toEqual([]);
    });

    it("refuses a central .agents/skills directory that is a symlink escaping the project", async () => {
      const { installSkill } = await import("./skill.js");
      vol.mkdirSync(`${PROJECT}/.agents`, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.symlinkSync("/outside", `${PROJECT}/.agents/skills`);

      // Containment must be rooted at the project, not at `.agents/skills`
      // itself — resolveContained deliberately allows a symlinked root, so
      // rooting there let a symlink install (and --force delete) outside.
      // Fails closed before anything is written, rather than per-agent.
      await expect(installSkill(skillItem(), ["codex"], "project", "symlink", true, PROJECT)).rejects.toThrow(
        /Refusing path outside \/my\/project/
      );
      expect(vol.readdirSync("/outside")).toEqual([]);
    });

    it("keeps symlink installs for agents that read .agents/skills visible to list and remove", async () => {
      const { installSkill, getInstalledSkills, uninstallSkill } = await import("./skill.js");

      const results = await installSkill(skillItem(), ["codex", "opencode"], "project", "symlink", true, PROJECT);
      expect(results.map((r) => r.success)).toEqual([true, true]);

      // The content lives only in the shared directory for these agents, so
      // that is where "installed" has to be looked for — otherwise the copy is
      // an orphan no seedr command can find or delete.
      expect(await getInstalledSkills("codex", "project", PROJECT)).toContain(TEST_SKILL);
      expect(await getInstalledSkills("opencode", "project", PROJECT)).toContain(TEST_SKILL);

      expect(await uninstallSkill(TEST_SKILL, "codex", "project", PROJECT)).toBe(true);
      expect(await getInstalledSkills("codex", "project", PROJECT)).not.toContain(TEST_SKILL);
    });

    it("rejects an invalid slug before writing anything", async () => {
      const { installSkill } = await import("./skill.js");
      await expect(installSkill(skillItem({ slug: "../escape" }), ["claude"], "project", "copy", true, PROJECT)).rejects.toThrow(/Invalid skill slug/);
      expect(vol.existsSync(`${PROJECT}/.claude`)).toBe(false);
    });

    describe("rollback", () => {
      it("removes a central copy it created when every agent link fails", async () => {
        const fsp = await import("node:fs/promises");
        const symlinkSpy = vi.spyOn(fsp, "symlink").mockRejectedValue(new Error("EPERM: symlinks disabled"));
        const { installSkill } = await import("./skill.js");

        const results = await installSkill(skillItem({ compatibility: ["claude", "copilot"] }), ["claude", "copilot"], "project", "symlink", true, PROJECT);
        symlinkSpy.mockRestore();

        expect(results.every((r) => !r.success)).toBe(true);
        expect(results[0]?.error).toMatch(/EPERM/);
        expect(vol.existsSync(CENTRAL_SKILL)).toBe(false);
        expect(vol.existsSync(CLAUDE_SKILL)).toBe(false);
      });

      it("keeps a pre-existing central copy and keeps it when at least one agent succeeded", async () => {
        vol.mkdirSync(CENTRAL_SKILL, { recursive: true });
        vol.writeFileSync(`${CENTRAL_SKILL}/${SKILL_MD}`, "old central");
        const fsp = await import("node:fs/promises");
        const symlinkSpy = vi.spyOn(fsp, "symlink").mockRejectedValue(new Error("EPERM"));
        const { installSkill } = await import("./skill.js");

        await installSkill(skillItem(), ["claude"], "project", "symlink", true, PROJECT);
        symlinkSpy.mockRestore();

        // The central copy existed before (replaced under --force), so it is not removed on failure.
        expect(vol.existsSync(`${CENTRAL_SKILL}/${SKILL_MD}`)).toBe(true);

        const results = await installSkill(skillItem({ compatibility: ["claude", "antigravity"] }), ["claude", "antigravity"], "project", "symlink", true, PROJECT);
        expect(results.map((r) => r.success)).toEqual([true, true]);
        expect(vol.existsSync(`${CENTRAL_SKILL}/${SKILL_MD}`)).toBe(true);
      });

      it("propagates a failing central download and leaves nothing behind", async () => {
        const { fetchItemToDestination } = await import("../config/registry.js");
        vi.mocked(fetchItemToDestination).mockRejectedValue(new Error("Registry integrity error: digest"));
        const { installSkill } = await import("./skill.js");

        await expect(installSkill(skillItem({ sourceType: "official" }), ["claude"], "project", "symlink", true, PROJECT)).rejects.toThrow(/Registry integrity error/);
        expect(vol.existsSync(CENTRAL_SKILL)).toBe(false);
        expect(vol.existsSync(CLAUDE_SKILL)).toBe(false);
      });
    });
  });

  describe("uninstallSkill", () => {
    it("should remove installed skill", async () => {
      const { uninstallSkill } = await import("./skill.js");
      vol.mkdirSync(CLAUDE_SKILL, { recursive: true });
      vol.writeFileSync(`${CLAUDE_SKILL}/${SKILL_MD}`, "# Test");

      expect(await uninstallSkill(TEST_SKILL, "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync(CLAUDE_SKILL)).toBe(false);
    });

    it("should return false for non-existent skill", async () => {
      const { uninstallSkill } = await import("./skill.js");
      expect(await uninstallSkill("nonexistent", "claude", "project", PROJECT)).toBe(false);
    });

    it("removes a symlink entry without following it", async () => {
      const { uninstallSkill } = await import("./skill.js");
      vol.mkdirSync(CENTRAL_SKILL, { recursive: true });
      vol.writeFileSync(`${CENTRAL_SKILL}/${SKILL_MD}`, "central");
      vol.mkdirSync(`${PROJECT}/.claude/skills`, { recursive: true });
      vol.symlinkSync(CENTRAL_LINK, CLAUDE_SKILL);

      expect(await uninstallSkill(TEST_SKILL, "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync(CLAUDE_SKILL)).toBe(false);
      expect(vol.readFileSync(`${CENTRAL_SKILL}/${SKILL_MD}`, "utf-8")).toBe("central");
    });

    it("removes a symlink entry pointing outside the project without touching the target", async () => {
      const { uninstallSkill } = await import("./skill.js");
      vol.mkdirSync("/outside/secret", { recursive: true });
      vol.writeFileSync("/outside/secret/f", "f");
      vol.mkdirSync(`${PROJECT}/.claude/skills`, { recursive: true });
      vol.symlinkSync("/outside/secret", CLAUDE_SKILL);

      expect(await uninstallSkill(TEST_SKILL, "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync("/outside/secret/f")).toBe(true);
    });

    it.each(["../x", "../../x", "/etc", "a/b", "a\\b", "", "%2e%2e", "ünï", "-rf", ".", "a".repeat(101)])("rejects invalid slug %j", async (slug) => {
      const { uninstallSkill } = await import("./skill.js");
      vol.mkdirSync("/etc", { recursive: true });
      vol.writeFileSync("/etc/passwd", "root");
      await expect(uninstallSkill(slug, "claude", "project", PROJECT)).rejects.toThrow(/Invalid skill slug/);
      expect(vol.existsSync("/etc/passwd")).toBe(true);
    });

    it("refuses a skills directory that resolves outside the scope root", async () => {
      const { uninstallSkill } = await import("./skill.js");
      vol.mkdirSync("/outside/test-skill", { recursive: true });
      vol.writeFileSync("/outside/test-skill/f", "f");
      vol.mkdirSync(`${PROJECT}/.claude`, { recursive: true });
      vol.symlinkSync("/outside", `${PROJECT}/.claude/skills`);

      await expect(uninstallSkill(TEST_SKILL, "claude", "project", PROJECT)).rejects.toThrow(/Refusing path outside \/my\/project/);
      expect(vol.existsSync("/outside/test-skill/f")).toBe(true);
    });

    it("returns false for an agent without skill support", async () => {
      const { uninstallSkill } = await import("./skill.js");
      const agents = await import("../config/agents.js");
      const spy = vi.spyOn(agents, "getContentPath").mockReturnValue(undefined);
      expect(await uninstallSkill(TEST_SKILL, "claude", "project", PROJECT)).toBe(false);
      spy.mockRestore();
    });
  });

  describe("getInstalledSkills", () => {
    it("should list installed skills including symlinked ones", async () => {
      const { getInstalledSkills } = await import("./skill.js");
      vol.mkdirSync(`${PROJECT}/.claude/skills/skill-a`, { recursive: true });
      vol.mkdirSync(`${PROJECT}/.claude/skills/skill-b`, { recursive: true });
      vol.symlinkSync("../../.agents/skills/linked", `${PROJECT}/.claude/skills/linked`);
      vol.writeFileSync(`${PROJECT}/.claude/skills/README.md`, "not a skill");

      const skills = await getInstalledSkills("claude", "project", PROJECT);

      expect(skills.sort()).toEqual(["linked", "skill-a", "skill-b"]);
    });

    it("should return empty array for no skills", async () => {
      const { getInstalledSkills } = await import("./skill.js");
      expect(await getInstalledSkills("claude", "project", PROJECT)).toEqual([]);
    });
  });

  describe("planSkill", () => {
    it("describes the central copy and the per-agent links for symlink installs", async () => {
      const { planSkill } = await import("./skill.js");
      vol.mkdirSync(CLAUDE_SKILL, { recursive: true });

      const plan = await planSkill(skillItem(), ["claude", "copilot", "antigravity"], "project", "symlink", PROJECT);

      expect(plan).toEqual([
        { agent: "shared", kind: "create", path: CENTRAL_SKILL, detail: "central copy, read directly by antigravity" },
        { agent: "claude", kind: "modify", path: CLAUDE_SKILL, detail: `symlink → ${CENTRAL_SKILL}` },
        { agent: "copilot", kind: "create", path: `${PROJECT}/.github/skills/test-skill`, detail: `symlink → ${CENTRAL_SKILL}` },
      ]);
    });

    it("describes one directory per agent for copy installs", async () => {
      const { planSkill } = await import("./skill.js");
      const plan = await planSkill(skillItem(), ["claude", "codex"], "user", "copy", PROJECT);
      expect(plan).toEqual([
        { agent: "claude", kind: "create", path: USER_CLAUDE_SKILL, detail: "skill directory" },
        { agent: "codex", kind: "create", path: "/home/testuser/.codex/skills/test-skill", detail: "skill directory" },
      ]);
    });
  });

  describe("skillHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { skillHandler } = await import("./skill.js");

      expect(skillHandler.type).toBe("skill");
      expect(typeof skillHandler.install).toBe("function");
      expect(typeof skillHandler.uninstall).toBe("function");
      expect(typeof skillHandler.listInstalled).toBe("function");
      expect(typeof skillHandler.plan).toBe("function");
    });
  });
});
