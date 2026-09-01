import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("../config/registry.js", () => ({
  getItem: vi.fn(async () => undefined),
  getItemSourcePath: vi.fn(() => null),
  fetchItemToDestination: vi.fn(),
  fetchItemFile: vi.fn(),
}));

vi.mock("node:os", () => ({ homedir: () => "/home/testuser" }));

const HOME = "/home/testuser";
const PROJECT = "/my/project";
const SLUG = "no-force-push";
const BODY = "# No force push\n\nNever force-push a shared branch.";

function ruleItem(overrides: Partial<RegistryItem> = {}): RegistryItem {
  return {
    slug: SLUG,
    name: "No Force Push",
    type: "rule",
    description: "Never force-push a shared branch",
    compatibility: ["claude", "copilot", "antigravity", "codex", "opencode"],
    sourceType: "seedr",
    ...overrides,
  } as RegistryItem;
}

async function serveRule(content = BODY): Promise<void> {
  const { fetchItemFile } = await import("../config/registry.js");
  vi.mocked(fetchItemFile).mockResolvedValue(content);
}

const read = (path: string): string => vol.readFileSync(path, "utf-8") as string;

describe("rule handler", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(PROJECT, { recursive: true });
  });

  afterEach(() => {
    vol.reset();
    vi.resetAllMocks();
  });

  describe("per-agent destinations", () => {
    it("writes a rule file for the three agents that have a rules directory", async () => {
      await serveRule();
      const { installRule } = await import("./rule.js");

      const results = await installRule(
        ruleItem(), ["claude", "antigravity", "copilot"], "project", "copy", true, PROJECT
      );

      expect(results.every((result) => result.success)).toBe(true);
      expect(read(`${PROJECT}/.claude/rules/${SLUG}.md`)).toContain("Never force-push");
      expect(read(`${PROJECT}/.agents/rules/${SLUG}.md`)).toContain("Never force-push");
      // Copilot's loader requires the suffix; a plain .md there is not read.
      expect(read(`${PROJECT}/.github/instructions/${SLUG}.instructions.md`)).toContain(
        "Never force-push"
      );
    });

    it("merges a section into AGENTS.md for the two agents with no rules directory", async () => {
      await serveRule();
      const { installRule } = await import("./rule.js");

      const results = await installRule(ruleItem(), ["codex", "opencode"], "project", "copy", true, PROJECT);

      expect(results.every((result) => result.success)).toBe(true);
      const agentsMd = read(`${PROJECT}/AGENTS.md`);
      expect(agentsMd).toContain(`<!-- seedr:rule:${SLUG} -->`);
      expect(agentsMd).toContain("Never force-push");
      expect(agentsMd).toContain(`<!-- /seedr:rule:${SLUG} -->`);
    });

    // Codex HAS a rules/ directory and it is not prose: $CODEX_HOME/rules/*.starlark
    // is sandbox policy (prefix_rule, network_rule, host_executable). Writing a
    // markdown rule there would be silently wrong.
    it("never writes a markdown rule into Codex's Starlark policy directory", async () => {
      await serveRule();
      const { installRule } = await import("./rule.js");

      await installRule(ruleItem(), ["codex"], "user", "copy", true, PROJECT);

      expect(vol.existsSync(`${HOME}/.codex/rules`)).toBe(false);
      expect(read(`${HOME}/.codex/AGENTS.md`)).toContain(`<!-- seedr:rule:${SLUG} -->`);
    });

    it("uses each agent's own user-scope surface", async () => {
      await serveRule();
      const { installRule } = await import("./rule.js");

      await installRule(
        ruleItem(), ["claude", "antigravity", "copilot", "opencode"], "user", "copy", true, PROJECT
      );

      expect(vol.existsSync(`${HOME}/.claude/rules/${SLUG}.md`)).toBe(true);
      // Not ~/.agents: the vendor documentation says it does not exist for Antigravity.
      expect(vol.existsSync(`${HOME}/.gemini/config/rules/${SLUG}.md`)).toBe(true);
      expect(vol.existsSync(`${HOME}/.agents/rules/${SLUG}.md`)).toBe(false);
      // Not ~/.github: that is the project spelling, not the personal tier.
      expect(vol.existsSync(`${HOME}/.copilot/instructions/${SLUG}.instructions.md`)).toBe(true);
      expect(vol.existsSync(`${HOME}/.config/opencode/AGENTS.md`)).toBe(true);
    });
  });

  describe("merging into a shared file", () => {
    it("leaves everything a person wrote around the section untouched", async () => {
      await serveRule();
      vol.writeFileSync(`${PROJECT}/AGENTS.md`, "# My project\n\nHand-written guidance.\n");
      const { installRule } = await import("./rule.js");

      await installRule(ruleItem(), ["codex"], "project", "copy", true, PROJECT);

      const agentsMd = read(`${PROJECT}/AGENTS.md`);
      expect(agentsMd).toContain("# My project");
      expect(agentsMd).toContain("Hand-written guidance.");
      expect(agentsMd).toContain("Never force-push");
    });

    it("replaces its own section on reinstall rather than appending a second copy", async () => {
      await serveRule();
      const { installRule } = await import("./rule.js");
      await installRule(ruleItem(), ["codex"], "project", "copy", true, PROJECT);

      await serveRule("# No force push\n\nRevised wording.");
      await installRule(ruleItem(), ["codex"], "project", "copy", true, PROJECT);

      const agentsMd = read(`${PROJECT}/AGENTS.md`);
      expect(agentsMd.match(/<!-- seedr:rule:/g)).toHaveLength(1);
      expect(agentsMd).toContain("Revised wording.");
      expect(agentsMd).not.toContain("Never force-push a shared branch.");
    });

    // Frontmatter is meaningful in a rule FILE (Copilot reads applyTo from it).
    // Pasted mid-document it is just a stray fence.
    it("drops frontmatter on the way into a section but keeps it in a file", async () => {
      await serveRule('---\napplyTo: "**/*.ts"\n---\n\nUse strict mode.');
      const { installRule } = await import("./rule.js");

      await installRule(ruleItem(), ["copilot", "codex"], "project", "copy", true, PROJECT);

      expect(read(`${PROJECT}/.github/instructions/${SLUG}.instructions.md`)).toContain("applyTo");
      const agentsMd = read(`${PROJECT}/AGENTS.md`);
      expect(agentsMd).not.toContain("applyTo");
      expect(agentsMd).toContain("Use strict mode.");
    });

    it("removes only its own section, leaving the file and other rules intact", async () => {
      await serveRule();
      vol.writeFileSync(`${PROJECT}/AGENTS.md`, "# My project\n\nHand-written guidance.\n");
      const { installRule, uninstallRule } = await import("./rule.js");
      await installRule(ruleItem(), ["codex"], "project", "copy", true, PROJECT);
      await serveRule("Second rule body.");
      await installRule(ruleItem({ slug: "other-rule" }), ["codex"], "project", "copy", true, PROJECT);

      expect(await uninstallRule(SLUG, "codex", "project", PROJECT)).toBe(true);

      const agentsMd = read(`${PROJECT}/AGENTS.md`);
      expect(agentsMd).toContain("Hand-written guidance.");
      expect(agentsMd).toContain("Second rule body.");
      expect(agentsMd).not.toContain(`<!-- seedr:rule:${SLUG} -->`);
    });

    it("reports a section that was never there as not removed", async () => {
      const { uninstallRule } = await import("./rule.js");
      expect(await uninstallRule("absent", "codex", "project", PROJECT)).toBe(false);
    });
  });

  describe("listing and removal", () => {
    it("lists rules from a directory and from a shared file alike", async () => {
      await serveRule();
      const { installRule, getInstalledRules } = await import("./rule.js");
      await installRule(ruleItem(), ["claude", "copilot", "codex"], "project", "copy", true, PROJECT);

      expect(await getInstalledRules("claude", "project", PROJECT)).toEqual([SLUG]);
      expect(await getInstalledRules("copilot", "project", PROJECT)).toEqual([SLUG]);
      expect(await getInstalledRules("codex", "project", PROJECT)).toEqual([SLUG]);
    });

    it("removes a rule file", async () => {
      await serveRule();
      const { installRule, uninstallRule, getInstalledRules } = await import("./rule.js");
      await installRule(ruleItem(), ["claude"], "project", "copy", true, PROJECT);

      expect(await uninstallRule(SLUG, "claude", "project", PROJECT)).toBe(true);
      expect(await getInstalledRules("claude", "project", PROJECT)).toEqual([]);
    });
  });

  describe("planRule", () => {
    it("names the exact destination per agent and says a section is a merge", async () => {
      await serveRule();
      const { planRule } = await import("./rule.js");

      const plan = await planRule(ruleItem(), ["claude", "codex"], "project", "copy", PROJECT);

      expect(plan).toEqual([
        { agent: "claude", kind: "create", path: `${PROJECT}/.claude/rules/${SLUG}.md`, detail: "rule file" },
        {
          agent: "codex",
          kind: "create",
          path: `${PROJECT}/AGENTS.md`,
          detail: `merged section <!-- seedr:rule:${SLUG} --> (the rest of the file is untouched)`,
        },
      ]);
      // A plan writes nothing.
      expect(vol.existsSync(`${PROJECT}/.claude/rules/${SLUG}.md`)).toBe(false);
      expect(vol.existsSync(`${PROJECT}/AGENTS.md`)).toBe(false);
    });
  });
});
