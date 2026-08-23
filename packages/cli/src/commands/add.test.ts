import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";
import type { ContentHandler } from "../handlers/types.js";

const TEST_SKILL = "test-skill";
const SKILL_CONTENT = "# Test Skill";
const CLAUDE_SKILL_MD = "/my/project/.claude/skills/test-skill/SKILL.md";
const CLAUDE_SKILL_DIR = "/my/project/.claude/skills/test-skill";
const CLAUDE_MCP_FILE = "/my/project/.mcp.json";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const CANCEL = Symbol("cancel");
vi.mock("@clack/prompts", () => {
  const log = { step: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), message: vi.fn() };
  return {
    log,
    intro: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn(),
    isCancel: (value: unknown) => value === CANCEL,
    select: vi.fn(),
    multiselect: vi.fn(),
    confirm: vi.fn(),
  };
});

const SKILL: RegistryItem = {
  slug: TEST_SKILL,
  name: "Test Skill",
  type: "skill",
  description: "A test skill",
  compatibility: ["claude", "copilot", "gemini"],
  sourceType: "toolr",
};

const MCP: RegistryItem = {
  slug: "playwright",
  name: "Playwright",
  type: "mcp",
  description: "Browser automation",
  compatibility: ["claude"],
  sourceType: "toolr",
};

const MCP_MULTI: RegistryItem = { ...MCP, slug: "multi", compatibility: ["claude", "codex", "copilot"] };
const HOOK: RegistryItem = { slug: "lint-hook", name: "Lint", type: "hook", description: "lint", compatibility: ["claude"], sourceType: "toolr" };
const ITEMS = [SKILL, MCP, MCP_MULTI, HOOK];

vi.mock("../config/registry.js", () => ({
  getItem: vi.fn(async (slug: string, type?: string) => ITEMS.find((item) => item.slug === slug && (!type || item.type === type))),
  searchItems: vi.fn(async (query: string) => ITEMS.filter((item) => item.slug.includes(query) || item.name.toLowerCase().includes(query.toLowerCase()))),
  listItems: vi.fn(async (type?: string) => ITEMS.filter((item) => !type || item.type === type)),
  getItemSourcePath: vi.fn((item: RegistryItem) => (item.sourceType === "toolr" ? `/registry/${item.type}s/${item.slug}` : null)),
  getItemContent: vi.fn(async () => JSON.stringify({ name: "playwright", config: { command: "npx", args: ["-y", "@playwright/mcp@latest"] } })),
  fetchItemToDestination: vi.fn(),
  fetchItemFile: vi.fn(),
}));

const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
vi.stubGlobal("fetch", fetchMock);

const PROJECT = "/my/project";
const BASE_OPTIONS = { yes: true, scope: "project", method: "copy" };

function snapshotVolume(): string {
  return JSON.stringify(vol.toJSON());
}

describe("resolveRequestedAgents", () => {
  it("chooses nothing when --agents is absent so the caller can prompt", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    expect(resolveRequestedAgents(undefined, SKILL)).toEqual({ ok: true, agents: [], explicit: false });
    expect(resolveRequestedAgents("  ", SKILL)).toEqual({ ok: true, agents: [], explicit: false });
  });

  it("'all' means every compatible agent and never errors on the incompatible rest", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    expect(resolveRequestedAgents("all", SKILL)).toEqual({ ok: true, agents: ["claude", "copilot", "gemini"], explicit: true });
    // copilot is in the item's compatibility but not MCP-capable: dropped silently for 'all'
    expect(resolveRequestedAgents("all", MCP_MULTI)).toEqual({ ok: true, agents: ["claude", "codex"], explicit: true });
  });

  it("'all' errors when nothing is compatible", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    const onlyCopilot: RegistryItem = { ...MCP, compatibility: ["copilot"] };
    expect(resolveRequestedAgents("all", onlyCopilot)).toEqual({ ok: false, error: 'No agent supports mcp "playwright"' });
  });

  it("accepts one or several explicitly compatible agents (aliases included, deduplicated)", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    expect(resolveRequestedAgents("claude", SKILL)).toEqual({ ok: true, agents: ["claude"], explicit: true });
    expect(resolveRequestedAgents("cc,claude, gh", SKILL)).toEqual({ ok: true, agents: ["claude", "copilot"], explicit: true });
    expect(resolveRequestedAgents("claude,codex", MCP_MULTI)).toEqual({ ok: true, agents: ["claude", "codex"], explicit: true });
  });

  it("refuses an explicitly requested agent the item does not support, naming both sides", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    const result = resolveRequestedAgents("codex", MCP);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        'Cannot install mcp "playwright" for codex. Compatible agents: claude. codex: the registry lists "playwright" for claude only'
      );
    }
  });

  it("refuses a mix of compatible and incompatible agents as a whole", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    const result = resolveRequestedAgents("claude,gemini,codex", MCP);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/for gemini, codex\. Compatible agents: claude/);
      expect(result.error).toMatch(/gemini: the registry lists "playwright" for claude only; codex: the registry lists "playwright" for claude only/);
    }
  });

  it("explains why copilot cannot take MCP servers", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    const result = resolveRequestedAgents("copilot", MCP_MULTI);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/copilot: GitHub Copilot's MCP configuration format could not be verified/);
    }
  });

  it("refuses agents the content type does not support", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    const result = resolveRequestedAgents("gemini", HOOK);
    expect(result).toEqual({
      ok: false,
      error: 'Cannot install hook "lint-hook" for gemini. Compatible agents: claude. gemini: gemini does not support hook content',
    });
  });

  it("rejects unknown agent names instead of dropping them", async () => {
    const { resolveRequestedAgents } = await import("./add.js");
    expect(resolveRequestedAgents("claude,cursor", SKILL)).toEqual({
      ok: false,
      error: 'Unknown agent(s): cursor. Valid agents: claude, copilot, gemini, codex, opencode or "all"',
    });
    expect(resolveRequestedAgents(",", SKILL)).toEqual({ ok: false, error: "No agents given" });
  });
});

describe("pure helpers", () => {
  it("decideForce overwrites only with --force or an interactive confirmation", async () => {
    const { decideForce } = await import("./add.js");
    expect(decideForce({ yes: true })).toBe(false);
    expect(decideForce({ yes: true, force: true })).toBe(true);
    expect(decideForce({})).toBe(true);
  });

  it("formatPlan groups exact paths by agent", async () => {
    const { formatPlan } = await import("./add.js");
    const lines = formatPlan([
      { agent: "shared", kind: "create", path: "/p/.agents/skills/x", detail: "central copy" },
      { agent: "claude", kind: "modify", path: "/p/.claude/skills/x" },
      { agent: "claude", kind: "create", path: "/p/.claude/settings.json", detail: "hooks" },
    ]);
    expect(lines).toEqual([
      "  shared:",
      "    [create] /p/.agents/skills/x  — central copy",
      "  Claude Code:",
      "    [modify] /p/.claude/skills/x",
      "    [create] /p/.claude/settings.json  — hooks",
    ]);
    expect(formatPlan([])).toEqual(["  (no filesystem changes)"]);
  });

  it("summarizeResults yields exit code 1 when any agent failed", async () => {
    const { summarizeResults } = await import("./add.js");
    expect(summarizeResults([{ agent: "claude", success: true, path: "/a" }]).exitCode).toBe(0);
    const summary = summarizeResults([
      { agent: "claude", success: true, path: "/a" },
      { agent: "codex", success: false, path: "", error: "x" },
    ]);
    expect(summary.exitCode).toBe(1);
    expect(summary.failed.map((r) => r.agent)).toEqual(["codex"]);
  });

  it("planInstall falls back to a path-only description for handlers without plan()", async () => {
    const { planInstall } = await import("./add.js");
    const handler: ContentHandler = { type: "skill", install: async () => [], uninstall: async () => false, listInstalled: async () => [] };
    const plan = await planInstall(handler, SKILL, ["claude"], "project", "copy", PROJECT);
    expect(plan).toEqual([{ agent: "claude", kind: "create", path: "/my/project/.agents/skills/test-skill", detail: "(handler provides no detailed plan)" }]);
  });
});

describe("runAdd", () => {
  beforeEach(() => {
    vol.reset();
    vol.fromJSON({
      "/registry/skills/test-skill/SKILL.md": SKILL_CONTENT,
      "/registry/skills/test-skill/scripts/run.sh": "echo hi",
    });
    fetchMock.mockClear();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });

  it("installs a skill for one agent and reports one telemetry event", async () => {
    const { runAdd } = await import("./add.js");

    const exitCode = await runAdd(TEST_SKILL, { ...BASE_OPTIONS, agents: "claude" }, PROJECT);

    expect(exitCode).toBe(0);
    expect(vol.readFileSync(CLAUDE_SKILL_MD, "utf-8")).toBe(SKILL_CONTENT);
    expect(vol.existsSync("/my/project/.claude/skills/test-skill/scripts/run.sh")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ slug: TEST_SKILL, type: "skill", tool: "claude", scope: "project", version: "dev" });
  });

  it("dry-run prints the exact plan and performs no writes and no telemetry", async () => {
    const { runAdd } = await import("./add.js");
    const before = snapshotVolume();
    const logSpy = vi.mocked(console.log);

    const exitCode = await runAdd(TEST_SKILL, { ...BASE_OPTIONS, agents: "claude,copilot", method: "symlink", dryRun: true }, PROJECT);

    expect(exitCode).toBe(0);
    expect(snapshotVolume()).toBe(before);
    expect(fetchMock).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("/my/project/.agents/skills/test-skill");
    expect(output).toContain(CLAUDE_SKILL_DIR);
    expect(output).toContain("/my/project/.github/skills/test-skill");
    expect(output).toContain("[create]");
  });

  it("dry-run of an MCP install describes each agent's config file without creating it", async () => {
    const { runAdd } = await import("./add.js");
    const logSpy = vi.mocked(console.log);

    const exitCode = await runAdd("multi", { ...BASE_OPTIONS, type: "mcp", agents: "claude,codex", dryRun: true }, PROJECT);

    expect(exitCode).toBe(0);
    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("/my/project/.mcp.json  — mcpServers.playwright");
    expect(output).toContain("/my/project/.codex/config.toml  — [mcp_servers.playwright]");
    expect(vol.existsSync(CLAUDE_MCP_FILE)).toBe(false);
    expect(vol.existsSync("/my/project/.codex")).toBe(false);
  });

  it("refuses an explicitly requested incompatible agent: exit 1, no mutation, no telemetry", async () => {
    const { runAdd } = await import("./add.js");
    const prompts = await import("@clack/prompts");
    const before = snapshotVolume();

    const exitCode = await runAdd("playwright", { ...BASE_OPTIONS, type: "mcp", agents: "codex", dryRun: true }, PROJECT);

    expect(exitCode).toBe(1);
    expect(snapshotVolume()).toBe(before);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(prompts.log.error)).toHaveBeenCalledWith(expect.stringMatching(/Cannot install mcp "playwright" for codex\. Compatible agents: claude/));

    const realRun = await runAdd("playwright", { ...BASE_OPTIONS, type: "mcp", agents: "codex" }, PROJECT);
    expect(realRun).toBe(1);
    expect(snapshotVolume()).toBe(before);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the single compatible agent when --agents is omitted", async () => {
    const { runAdd } = await import("./add.js");
    const exitCode = await runAdd("playwright", { ...BASE_OPTIONS, type: "mcp" }, PROJECT);
    expect(exitCode).toBe(0);
    expect(JSON.parse(vol.readFileSync(CLAUDE_MCP_FILE, "utf-8") as string).mcpServers.playwright.command).toBe("npx");
  });

  it("returns 1 for unknown items, wrong types and invalid options", async () => {
    const { runAdd } = await import("./add.js");
    const prompts = await import("@clack/prompts");
    expect(await runAdd("nope", { ...BASE_OPTIONS, agents: "claude" }, PROJECT)).toBe(1);
    expect(vi.mocked(prompts.log.error)).toHaveBeenCalledWith('"nope" not found');
    expect(await runAdd("playwright", { ...BASE_OPTIONS, type: "skill", agents: "claude" }, PROJECT)).toBe(1);
    expect(vi.mocked(prompts.log.error)).toHaveBeenCalledWith(expect.stringContaining('"playwright" is a mcp, not a skill'));
    expect(await runAdd(TEST_SKILL, { ...BASE_OPTIONS, scope: "global", agents: "claude" }, PROJECT)).toBe(1);
    expect(await runAdd(TEST_SKILL, { ...BASE_OPTIONS, type: "widget", agents: "claude" }, PROJECT)).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves an item through search when the exact slug is unknown", async () => {
    const { runAdd } = await import("./add.js");
    expect(await runAdd("Test Sk", { ...BASE_OPTIONS, agents: "claude" }, PROJECT)).toBe(0);
    expect(vol.existsSync(CLAUDE_SKILL_MD)).toBe(true);
  });

  it("does not overwrite with --yes and no --force, reports failure and sends no telemetry", async () => {
    const { runAdd } = await import("./add.js");
    vol.mkdirSync(CLAUDE_SKILL_DIR, { recursive: true });
    vol.writeFileSync(CLAUDE_SKILL_MD, "user edited");

    const exitCode = await runAdd(TEST_SKILL, { ...BASE_OPTIONS, agents: "claude" }, PROJECT);

    expect(exitCode).toBe(1);
    expect(vol.readFileSync(CLAUDE_SKILL_MD, "utf-8")).toBe("user edited");
    expect(fetchMock).not.toHaveBeenCalled();

    expect(await runAdd(TEST_SKILL, { ...BASE_OPTIONS, agents: "claude", force: true }, PROJECT)).toBe(0);
    expect(vol.readFileSync(CLAUDE_SKILL_MD, "utf-8")).toBe(SKILL_CONTENT);
  });

  it("prints the plan and asks for confirmation without --yes", async () => {
    const { runAdd } = await import("./add.js");
    const prompts = await import("@clack/prompts");
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    const logSpy = vi.mocked(console.log);

    const exitCode = await runAdd(TEST_SKILL, { scope: "project", method: "copy", agents: "claude" }, PROJECT);

    expect(exitCode).toBe(0);
    expect(vi.mocked(prompts.cancel)).toHaveBeenCalledWith("Operation cancelled");
    expect(vi.mocked(prompts.confirm)).toHaveBeenCalledWith({ message: "Proceed with installation?" });
    expect(logSpy.mock.calls.map((call) => call.join(" ")).join("\n")).toContain(CLAUDE_SKILL_DIR);
    expect(vol.existsSync("/my/project/.claude")).toBe(false);

    vi.mocked(prompts.confirm).mockResolvedValue(true);
    expect(await runAdd(TEST_SKILL, { scope: "project", method: "copy", agents: "claude" }, PROJECT)).toBe(0);
    expect(vol.existsSync(CLAUDE_SKILL_MD)).toBe(true);
  });

  it("prompts for agents, scope and method when they are not given", async () => {
    const { runAdd } = await import("./add.js");
    const prompts = await import("@clack/prompts");
    vi.mocked(prompts.select)
      .mockResolvedValueOnce("select")
      .mockResolvedValueOnce("project")
      .mockResolvedValueOnce("copy");
    vi.mocked(prompts.multiselect).mockResolvedValueOnce(["claude", "copilot"]);

    const exitCode = await runAdd(TEST_SKILL, { yes: true }, PROJECT);

    expect(exitCode).toBe(0);
    expect(vol.existsSync(CLAUDE_SKILL_MD)).toBe(true);
    expect(vol.existsSync("/my/project/.github/skills/test-skill/SKILL.md")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 0 when a prompt is cancelled, without writing", async () => {
    const { runAdd } = await import("./add.js");
    const prompts = await import("@clack/prompts");
    vi.mocked(prompts.select).mockResolvedValueOnce(CANCEL);

    expect(await runAdd(TEST_SKILL, { yes: true, agents: "claude", method: "copy" }, PROJECT)).toBe(0);
    expect(vi.mocked(prompts.cancel)).toHaveBeenCalledWith("Operation cancelled");
    expect(vol.existsSync("/my/project/.claude")).toBe(false);
  });

  it("lists items of the requested type when no name is given", async () => {
    const { runAdd } = await import("./add.js");
    const prompts = await import("@clack/prompts");
    const registry = await import("../config/registry.js");
    vi.mocked(prompts.select).mockResolvedValueOnce(MCP);

    expect(await runAdd(undefined, { ...BASE_OPTIONS, type: "mcp" }, PROJECT)).toBe(0);
    expect(registry.listItems).toHaveBeenCalledWith("mcp");
    expect(vol.existsSync(CLAUDE_MCP_FILE)).toBe(true);
  });
});
