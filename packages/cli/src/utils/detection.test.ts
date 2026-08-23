import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import {
  detectInstalledAgents,
  detectProjectAgents,
  isAgentInstalled,
  getAgentDisplayName,
  parseAgentArg,
  parseAgentsArg,
  parseAgentsArgStrict,
} from "./detection.js";
import { ALL_AGENTS } from "../config/agents.js";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const PROJECT = "/my/project";

describe("agent argument parsing", () => {
  it.each([
    ["claude", "claude"],
    ["Claude-Code", "claude"],
    ["claudecode", "claude"],
    ["cc", "claude"],
    ["github-copilot", "copilot"],
    ["gh", "copilot"],
    ["gemini-code", "gemini"],
    ["gca", "gemini"],
    ["openai-codex", "codex"],
    ["oc", "opencode"],
    [" opencode ", "opencode"],
  ])("parseAgentArg(%j) → %s", (input, expected) => {
    expect(parseAgentArg(input)).toBe(expected);
  });

  it("returns null for unknown names", () => {
    expect(parseAgentArg("cursor")).toBeNull();
    expect(parseAgentArg("")).toBeNull();
  });

  it("parseAgentsArg expands 'all' and drops unknown names (legacy behaviour)", () => {
    expect(parseAgentsArg("all", ALL_AGENTS)).toEqual(ALL_AGENTS);
    expect(parseAgentsArg("claude, cursor ,gh", ALL_AGENTS)).toEqual(["claude", "copilot"]);
  });

  it("parseAgentsArgStrict reports unknown names and deduplicates", () => {
    expect(parseAgentsArgStrict("claude,cc, cursor,,gh")).toEqual({ agents: ["claude", "copilot"], unknown: ["cursor"] });
    expect(parseAgentsArgStrict("all")).toEqual({ agents: [], unknown: ["all"] });
    expect(parseAgentsArgStrict("")).toEqual({ agents: [], unknown: [] });
  });

  it("getAgentDisplayName", () => {
    expect(getAgentDisplayName("codex")).toBe("OpenAI Codex CLI");
  });
});

describe("agent detection", () => {
  beforeEach(() => {
    vol.reset();
    vol.fromJSON({
      "/my/project/.claude/skills/.keep": "",
      "/my/project/.codex/skills/.keep": "",
      "/home/testuser/.gemini/skills/.keep": "",
    });
  });

  afterEach(() => vol.reset());

  it("detectInstalledAgents finds project and user installs", async () => {
    const detected = await detectInstalledAgents(PROJECT);
    expect(detected).toEqual([
      { agent: "claude", scope: "project", path: "/my/project/.claude/skills" },
      { agent: "gemini", scope: "user", path: "/home/testuser/.gemini/skills" },
      { agent: "codex", scope: "project", path: "/my/project/.codex/skills" },
    ]);
  });

  it("detectProjectAgents only looks at the project", async () => {
    expect(await detectProjectAgents(PROJECT)).toEqual(["claude", "codex"]);
  });

  it("isAgentInstalled treats local scope like project", async () => {
    expect(await isAgentInstalled("claude", "local", PROJECT)).toBe(true);
    expect(await isAgentInstalled("claude", "user", PROJECT)).toBe(false);
    expect(await isAgentInstalled("gemini", "user", PROJECT)).toBe(true);
    expect(await isAgentInstalled("opencode", "project", PROJECT)).toBe(false);
  });
});
