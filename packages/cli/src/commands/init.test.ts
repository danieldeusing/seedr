import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const promptConfirmMock = vi.fn(async () => true);
vi.mock("../utils/prompts.js", () => ({
  promptConfirm: (...args: unknown[]) => promptConfirmMock(...(args as [])),
}));

const PROJECT = "/my/project";

describe("runInit", () => {
  beforeEach(() => {
    vol.reset();
    promptConfirmMock.mockReset();
    promptConfirmMock.mockResolvedValue(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });

  it("initialises claude by default with a README", async () => {
    const { runInit } = await import("./init.js");

    expect(await runInit({ yes: true }, PROJECT)).toBe(0);

    const readme = vol.readFileSync("/my/project/.claude/skills/README.md", "utf-8") as string;
    expect(readme).toContain("# Claude Code Configuration");
    expect(readme).toContain("--agents claude");
  });

  it("initialises every agent with 'all' and skips existing ones", async () => {
    const { runInit } = await import("./init.js");
    vol.fromJSON({ "/my/project/.codex/skills/existing/SKILL.md": "keep" });

    expect(await runInit({ agents: "all", yes: true }, PROJECT)).toBe(0);

    for (const dir of [".claude", ".github", ".agents", ".codex", ".opencode"]) {
      expect(vol.existsSync(`/my/project/${dir}/skills`)).toBe(true);
    }
    expect(vol.existsSync("/my/project/.codex/skills/README.md")).toBe(false);
    expect(vol.existsSync("/my/project/.codex/skills/existing/SKILL.md")).toBe(true);
  });

  it("rejects unknown agents and empty selections", async () => {
    const { runInit } = await import("./init.js");
    expect(await runInit({ agents: "cursor", yes: true }, PROJECT)).toBe(1);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(expect.stringMatching(/Unknown agent\(s\): cursor/));
    expect(await runInit({ agents: ",", yes: true }, PROJECT)).toBe(1);
    expect(vol.existsSync(PROJECT)).toBe(false);
  });

  it("asks for confirmation and stops when declined", async () => {
    const { runInit } = await import("./init.js");
    promptConfirmMock.mockResolvedValue(false);

    expect(await runInit({ agents: "claude,gemini" }, PROJECT)).toBe(0);

    expect(promptConfirmMock).toHaveBeenCalledWith("Proceed?");
    expect(vol.existsSync(PROJECT)).toBe(false);
  });

  it("initializeAgent reports whether it created the directory", async () => {
    const { initializeAgent, readmeFor } = await import("./init.js");
    expect(await initializeAgent("gemini", PROJECT)).toBe(true);
    expect(await initializeAgent("gemini", PROJECT)).toBe(false);
    expect(readmeFor("opencode")).toContain("OpenCode");
  });
});
