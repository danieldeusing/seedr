import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Everything the spinners said, so a per-agent line can be asserted. */
const spinnerSaid: string[] = [];
vi.mock("ora", () => ({
  default: () => {
    const record = (text?: string) => {
      if (text) spinnerSaid.push(text);
      return spinner;
    };
    const spinner = {
      start: record, stop: record, succeed: record,
      fail: record, warn: record, info: record, text: "",
    };
    return spinner;
  },
}));
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";

const TEST_SKILL = "test-skill";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const promptConfirmMock = vi.fn(async () => true);
vi.mock("../utils/ui.js", async () => {
  const actual = await vi.importActual<typeof import("../utils/ui.js")>("../utils/ui.js");
  return { ...actual, confirm: (...args: unknown[]) => promptConfirmMock(...(args as [])) };
});

const HOOK: RegistryItem = {
  slug: "lint-hook",
  name: "Lint",
  type: "hook",
  description: "lint",
  compatibility: ["claude"],
  contents: { files: [{ name: "lint-hook.sh", type: "file" }], triggers: [{ event: "PreCommit" }] },
};

vi.mock("../config/registry.js", () => ({
  getItem: vi.fn(async (slug: string, type?: string) => (slug === "lint-hook" && type === "hook" ? HOOK : undefined)),
  getItemContent: vi.fn(),
  getItemSourcePath: vi.fn(() => null),
  fetchItemToDestination: vi.fn(),
  fetchItemFile: vi.fn(),
}));

const PROJECT = "/my/project";
const SKILL_DIR = "/my/project/.claude/skills/test-skill";

function snapshotVolume(): string {
  return JSON.stringify(vol.toJSON());
}

describe("validateRemoveRequest", () => {
  it.each([
    ["../x"],
    ["../../x"],
    ["/etc"],
    ["a/b"],
    ["a\\b"],
    [""],
    ["%2e%2e"],
    ["ünïcode"],
    ["-rf"],
    ["Test"],
    ["a".repeat(101)],
  ])("rejects %j as an item name", async (name) => {
    const { validateRemoveRequest } = await import("./remove.js");
    expect(validateRemoveRequest(name, { type: "skill" })).toMatch(/Invalid item name/);
  });

  it("rejects non-string names", async () => {
    const { validateRemoveRequest } = await import("./remove.js");
    expect(validateRemoveRequest(undefined, { type: "skill" })).toMatch(/Invalid item name undefined/);
  });

  it("requires a valid type and scope and known agents", async () => {
    const { validateRemoveRequest } = await import("./remove.js");
    expect(validateRemoveRequest("pdf", {})).toMatch(/specify the content type/);
    expect(validateRemoveRequest("pdf", { type: "widget" })).toMatch(/Invalid type "widget"/);
    expect(validateRemoveRequest("pdf", { type: "skill", scope: "global" })).toMatch(/Invalid scope "global"/);
    expect(validateRemoveRequest("pdf", { type: "skill", agents: "claude,cursor" })).toMatch(/Unknown agent\(s\): cursor/);
    expect(validateRemoveRequest("pdf", { type: "skill", agents: "all" })).toBeNull();
    expect(validateRemoveRequest("pdf", { type: "skill", scope: "user", agents: "claude" })).toBeNull();
  });
});

describe("runRemove", () => {
  beforeEach(() => {
    spinnerSaid.length = 0;
    vol.reset();
    promptConfirmMock.mockReset();
    promptConfirmMock.mockResolvedValue(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });

  it("removes an installed skill from every agent that has it", async () => {
    const { runRemove } = await import("./remove.js");
    vol.fromJSON({
      [`${SKILL_DIR}/SKILL.md`]: "x",
      "/my/project/.github/skills/test-skill/SKILL.md": "x",
      "/my/project/.github/skills/other/SKILL.md": "keep",
    });

    const exitCode = await runRemove(TEST_SKILL, { type: "skill", yes: true }, PROJECT);

    expect(exitCode).toBe(0);
    expect(vol.existsSync(SKILL_DIR)).toBe(false);
    expect(vol.existsSync("/my/project/.github/skills/test-skill")).toBe(false);
    expect(vol.existsSync("/my/project/.github/skills/other/SKILL.md")).toBe(true);
  });

  it.each(["../x", "../../x", "/etc", "a/b", "a\\b", "%2e%2e", "ünïcode", ""])("refuses %j before any handler runs and changes nothing", async (name) => {
    const { runRemove } = await import("./remove.js");
    vol.fromJSON({ [`${SKILL_DIR}/SKILL.md`]: "x", "/etc/passwd": "root" });
    const before = snapshotVolume();

    const exitCode = await runRemove(name, { type: "skill", yes: true, agents: "all" }, PROJECT);

    expect(exitCode).toBe(1);
    expect(snapshotVolume()).toBe(before);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringMatching(/Invalid item name/));
  });

  it("reports when nothing is installed", async () => {
    const { runRemove } = await import("./remove.js");
    expect(await runRemove(TEST_SKILL, { type: "skill", yes: true }, PROJECT)).toBe(0);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringMatching(/not installed in project scope/));
  });

  it("honours --agents and reports agents without the item", async () => {
    const { runRemove } = await import("./remove.js");
    vol.fromJSON({ [`${SKILL_DIR}/SKILL.md`]: "x", "/my/project/.github/skills/test-skill/SKILL.md": "x" });

    expect(await runRemove(TEST_SKILL, { type: "skill", yes: true, agents: "claude,gemini" }, PROJECT)).toBe(0);

    expect(vol.existsSync(SKILL_DIR)).toBe(false);
    expect(vol.existsSync("/my/project/.github/skills/test-skill/SKILL.md")).toBe(true);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringMatching(/Successfully removed from 1 agent/));
  });

  // "Not found" and "could never have been there" are different answers, and
  // reporting the second as the first sends people hunting for an install that
  // was never possible.
  it("says a type the agent cannot hold is unsupported, not merely absent", async () => {
    const { runRemove } = await import("./remove.js");

    expect(await runRemove("some-hook", { type: "hook", yes: true, agents: "codex" }, PROJECT)).toBe(0);

    expect(spinnerSaid.join(" ")).toMatch(/does not support hook content/);
    expect(spinnerSaid.join(" ")).not.toMatch(/Not found/);
  });

  it("asks for confirmation and stops when declined", async () => {
    const { runRemove } = await import("./remove.js");
    vol.fromJSON({ [`${SKILL_DIR}/SKILL.md`]: "x" });
    promptConfirmMock.mockResolvedValue(false);

    expect(await runRemove(TEST_SKILL, { type: "skill" }, PROJECT)).toBe(0);

    expect(promptConfirmMock).toHaveBeenCalledWith("Proceed with removal?");
    expect(vol.existsSync(SKILL_DIR)).toBe(true);
  });

  it("removes a hook's settings entries and script in local scope", async () => {
    const { runRemove } = await import("./remove.js");
    vol.fromJSON({
      "/my/project/.claude/settings.local.json": JSON.stringify({ hooks: { PreCommit: [{ hooks: [{ type: "command", command: ".claude/hooks/lint-hook.sh" }] }] } }),
      "/my/project/.claude/hooks/lint-hook.sh": "#!/bin/sh",
    });

    expect(await runRemove("lint-hook", { type: "hook", yes: true, scope: "local" }, PROJECT)).toBe(0);

    expect(JSON.parse(vol.readFileSync("/my/project/.claude/settings.local.json", "utf-8") as string).hooks).toBeUndefined();
    expect(vol.existsSync("/my/project/.claude/hooks/lint-hook.sh")).toBe(false);
  });

  it("returns 1 for invalid options and types", async () => {
    const { runRemove } = await import("./remove.js");
    expect(await runRemove(TEST_SKILL, { yes: true }, PROJECT)).toBe(1);
    // `command` stood here until 2026-08-27, pinning the fact that it had no
    // handler. It has one now, and every ComponentType does — see the handler
    // registry's own test — so an unknown name is the only way in.
    expect(await runRemove(TEST_SKILL, { type: "widget", yes: true }, PROJECT)).toBe(1);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringMatching(/widget/));
  });

  it("stays idempotent: removing an absent item succeeds whether or not agents are named", async () => {
    const { runRemove } = await import("./remove.js");
    // The end state the caller asked for already holds. Exit 1 is reserved for
    // "could not do what was asked" — and it must not depend on whether the
    // agents were named, since auto-detection reports 0 for the same state.
    expect(await runRemove(TEST_SKILL, { type: "skill", yes: true, agents: "all" }, PROJECT)).toBe(0);
    expect(await runRemove(TEST_SKILL, { type: "skill", yes: true }, PROJECT)).toBe(0);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringMatching(/Nothing to remove/));
  });

  it("says why settings cannot be auto-detected instead of claiming not installed", async () => {
    const { runRemove } = await import("./remove.js");
    expect(await runRemove("some-settings", { type: "settings", yes: true }, PROJECT)).toBe(1);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringMatching(/cannot be discovered/));
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringMatching(/--agents claude/));
  });
});
