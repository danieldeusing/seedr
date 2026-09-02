import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const ITEMS: RegistryItem[] = [
  { slug: "pdf", name: "PDF", type: "skill", description: "Read PDFs", compatibility: ["claude", "codex"], featured: true, label: "project-x" },
  { slug: "lint-hook", name: "Lint", type: "hook", description: "Lint on commit", compatibility: ["claude"] },
];

vi.mock("../config/registry.js", () => ({
  listItems: vi.fn(async (type?: string) => ITEMS.filter((item) => !type || item.type === type)),
  getItem: vi.fn(),
  getItemContent: vi.fn(),
  getItemSourcePath: vi.fn(() => null),
  fetchItemToDestination: vi.fn(),
  fetchItemFile: vi.fn(),
}));

const PROJECT = "/my/project";
const HOME = "/home/testuser";
const HOOK_COMMAND = { type: "command", command: ".claude/hooks/lint-hook.sh" };

function writeFixtures(): void {
  vol.fromJSON({
    // project scope
    [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: "x",
    [`${PROJECT}/.claude/skills/docx/SKILL.md`]: "x",
    [`${PROJECT}/.codex/skills/pdf/SKILL.md`]: "x",
    [`${PROJECT}/.claude/agents/reviewer.md`]: "x",
    [`${PROJECT}/.claude/settings.json`]: JSON.stringify({ hooks: { PreCommit: [{ hooks: [HOOK_COMMAND] }] } }),
    [`${PROJECT}/.mcp.json`]: JSON.stringify({ mcpServers: { playwright: { command: "npx" } } }),
    [`${PROJECT}/.codex/config.toml`]: '[mcp_servers.github]\ncommand = "x"\n',
    // local scope
    [`${PROJECT}/.claude/settings.local.json`]: JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: ".claude/hooks/local-hook.sh" }] }] } }),
    // user scope
    [`${HOME}/.claude/skills/user-skill/SKILL.md`]: "x",
    // the retired gemini MCP adapter must not pick this up anymore
    [`${HOME}/.gemini/settings.json`]: JSON.stringify({ mcpServers: { "gemini-only": {} } }),
    [`${HOME}/.claude/plugins/installed_plugins.json`]: JSON.stringify({
      version: 2,
      plugins: {
        "feature-dev@official": [{ scope: "user", installPath: "/c", version: "1", installedAt: "", lastUpdated: "", gitCommitSha: "" }],
        "proj-plugin@official": [{ scope: "project", projectPath: PROJECT, installPath: "/c", version: "1", installedAt: "", lastUpdated: "", gitCommitSha: "" }],
      },
    }),
  });
}

describe("collectInstalledItems", () => {
  beforeEach(() => {
    vol.reset();
    writeFixtures();
  });

  afterEach(() => vol.reset());

  it("discovers every type for every agent in project scope, grouped by type then agent", async () => {
    const { collectInstalledItems } = await import("./list.js");

    const groups = await collectInstalledItems({ scope: "project", cwd: PROJECT });

    expect(groups).toEqual([
      { type: "skill", agent: "claude", slugs: ["docx", "pdf"] },
      { type: "skill", agent: "codex", slugs: ["pdf"] },
      { type: "agent", agent: "claude", slugs: ["reviewer"] },
      { type: "hook", agent: "claude", slugs: ["lint-hook"] },
      { type: "mcp", agent: "claude", slugs: ["playwright"] },
      // Copilot reads the project `.mcp.json` first in its own precedence
      // list, so a server there is genuinely present for it as well.
      { type: "mcp", agent: "copilot", slugs: ["playwright"] },
      { type: "mcp", agent: "codex", slugs: ["github"] },
      { type: "plugin", agent: "claude", slugs: ["proj-plugin"] },
    ]);
  });

  it("honours the type and agent filters", async () => {
    const { collectInstalledItems } = await import("./list.js");

    expect(await collectInstalledItems({ types: ["mcp"], scope: "project", cwd: PROJECT })).toEqual([
      { type: "mcp", agent: "claude", slugs: ["playwright"] },
      // Copilot reads the project `.mcp.json` first in its own precedence
      // list, so a server there is genuinely present for it as well.
      { type: "mcp", agent: "copilot", slugs: ["playwright"] },
      { type: "mcp", agent: "codex", slugs: ["github"] },
    ]);
    expect(await collectInstalledItems({ types: ["skill", "hook"], agents: ["codex"], scope: "project", cwd: PROJECT })).toEqual([
      { type: "skill", agent: "codex", slugs: ["pdf"] },
    ]);
    expect(await collectInstalledItems({ types: ["settings"], scope: "project", cwd: PROJECT })).toEqual([]);
  });

  it("reads local scope from settings.local.json while sharing project directories", async () => {
    const { collectInstalledItems } = await import("./list.js");

    const groups = await collectInstalledItems({ scope: "local", cwd: PROJECT });

    expect(groups.find((g) => g.type === "hook")).toEqual({ type: "hook", agent: "claude", slugs: ["local-hook"] });
    expect(groups.find((g) => g.type === "skill" && g.agent === "claude")?.slugs).toEqual(["docx", "pdf"]);
    expect(groups.find((g) => g.type === "mcp" && g.agent === "claude")?.slugs).toEqual(["playwright"]);
  });

  it("reads user scope from the home directory", async () => {
    const { collectInstalledItems } = await import("./list.js");

    const groups = await collectInstalledItems({ scope: "user", cwd: PROJECT });

    expect(groups).toEqual([
      { type: "skill", agent: "claude", slugs: ["user-skill"] },
      { type: "plugin", agent: "claude", slugs: ["feature-dev"] },
    ]);
  });
});

describe("runList", () => {
  beforeEach(() => {
    vol.reset();
    writeFixtures();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });

  function output(): string {
    return vi.mocked(console.log).mock.calls.map((call) => call.join(" ")).join("\n");
  }

  it("lists available items grouped by type", async () => {
    const { runList } = await import("./list.js");
    expect(await runList({}, PROJECT)).toBe(0);
    const text = output();
    expect(text).toContain("SKILLS");
    expect(text).toContain("HOOKS");
    expect(text).toContain("pdf");
    expect(text).toContain("Read PDFs");
    expect(text).toContain("★");
    expect(text).toContain("Total: 2 items");

    vi.mocked(console.log).mockClear();
    expect(await runList({ type: "hook" }, PROJECT)).toBe(0);
    expect(output()).not.toContain("SKILLS");
  });

  it("prints installed items grouped by type then agent, with the settings note", async () => {
    const { runList, SETTINGS_NOT_DISCOVERABLE } = await import("./list.js");

    expect(await runList({ installed: true, scope: "project" }, PROJECT)).toBe(0);

    const text = output();
    expect(text.indexOf("SKILLS")).toBeLessThan(text.indexOf("AGENTS"));
    expect(text.indexOf("AGENTS")).toBeLessThan(text.indexOf("HOOKS"));
    expect(text).toContain("Claude Code");
    expect(text).toContain("OpenAI Codex CLI");
    expect(text).toContain("docx");
    expect(text).toContain("Total: 9 installed");
    expect(text).toContain(SETTINGS_NOT_DISCOVERABLE);
  });

  it("filters installed items by type, agents and scope", async () => {
    const { runList } = await import("./list.js");

    expect(await runList({ installed: true, type: "mcp", agents: "codex", scope: "project" }, PROJECT)).toBe(0);
    let text = output();
    expect(text).toContain("github");
    expect(text).not.toContain("playwright");
    expect(text).not.toContain("settings items cannot be discovered");

    vi.mocked(console.log).mockClear();
    expect(await runList({ installed: true, scope: "user" }, PROJECT)).toBe(0);
    text = output();
    expect(text).toContain("user-skill");
    expect(text).toContain("feature-dev");
    expect(text).not.toContain("docx");

    vi.mocked(console.log).mockClear();
    vol.reset();
    expect(await runList({ installed: true, scope: "local" }, PROJECT)).toBe(0);
    expect(output()).toContain("No items installed");
  });

  it("returns 1 for invalid type, scope or agents", async () => {
    const { runList } = await import("./list.js");
    expect(await runList({ type: "widget" }, PROJECT)).toBe(1);
    expect(await runList({ installed: true, scope: "global" }, PROJECT)).toBe(1);
    expect(await runList({ installed: true, agents: "cursor" }, PROJECT)).toBe(1);
    expect(output()).toContain("Unknown agent(s): cursor");
  });

  it("reports an empty registry", async () => {
    const { listItems } = await import("../config/registry.js");
    vi.mocked(listItems).mockResolvedValueOnce([]);
    const { runList } = await import("./list.js");
    expect(await runList({}, PROJECT)).toBe(0);
    expect(output()).toContain("No items found in registry");
  });
});

describe("list --label", () => {
  beforeEach(() => {
    vol.reset();
    writeFixtures();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });

  const printed = () => vi.mocked(console.log).mock.calls.map((call) => call.join(" ")).join("\n");

  it("keeps only the items carrying the label", async () => {
    const { runList } = await import("./list.js");
    expect(await runList({ label: "project-x" }, PROJECT)).toBe(0);
    const text = printed();
    expect(text).toContain("pdf");
    expect(text).not.toContain("lint-hook");
    expect(text).toContain("Total: 1 items");
  });

  it("treats a label nobody carries as an error, and names the ones in use", async () => {
    const { runList } = await import("./list.js");
    // Silently printing nothing would read as "the registry is empty", which is
    // the wrong thing to conclude from a typo.
    expect(await runList({ label: "typo" }, PROJECT)).toBe(1);
    const text = printed();
    expect(text).toContain('No item carries the label "typo".');
    expect(text).toContain("Labels in use: project-x");
  });
});
