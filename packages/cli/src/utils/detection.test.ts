import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
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
    ["gemini-code", "antigravity"],
    ["gca", "antigravity"],
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
      "/home/testuser/.gemini/config/skills/.keep": "",
    });
  });

  afterEach(() => vol.reset());

  it("detectInstalledAgents finds project and user installs", async () => {
    const detected = await detectInstalledAgents(PROJECT);
    expect(detected).toEqual([
      { agent: "claude", scope: "project", path: "/my/project/.claude/skills" },
      { agent: "antigravity", scope: "user", path: "/home/testuser/.gemini/config/skills" },
      { agent: "codex", scope: "project", path: "/my/project/.codex/skills" },
    ]);
  });

  it("detectProjectAgents only looks at the project", async () => {
    expect(await detectProjectAgents(PROJECT)).toEqual(["claude", "codex"]);
  });

  it("isAgentInstalled treats local scope like project", async () => {
    expect(await isAgentInstalled("claude", "local", PROJECT)).toBe(true);
    expect(await isAgentInstalled("claude", "user", PROJECT)).toBe(false);
    expect(await isAgentInstalled("antigravity", "user", PROJECT)).toBe(true);
    expect(await isAgentInstalled("opencode", "project", PROJECT)).toBe(false);
  });
});


describe("parseAgentArg", () => {
  it("accepts every canonical id, whatever the case or padding", () => {
    for (const agent of CANONICAL_AGENTS) {
      expect(parseAgentArg(agent)).toBe(agent);
      expect(parseAgentArg(` ${agent.toUpperCase()} `)).toBe(agent);
    }
  });

  it("resolves nicknames to canonical ids", () => {
    expect(parseAgentArg("cc")).toBe("claude");
    expect(parseAgentArg("claude-code")).toBe("claude");
    expect(parseAgentArg("gh")).toBe("copilot");
    expect(parseAgentArg("agy")).toBe("antigravity");
    expect(parseAgentArg("google-antigravity")).toBe("antigravity");
    expect(parseAgentArg("openai-codex")).toBe("codex");
    expect(parseAgentArg("oc")).toBe("opencode");
  });

  it("maps the deprecated gemini id and its old nicknames to antigravity", () => {
    expect(parseAgentArg("gemini")).toBe("antigravity");
    expect(parseAgentArg("gemini-code")).toBe("antigravity");
    expect(parseAgentArg("gca")).toBe("antigravity");
  });

  it("rejects unknown ids", () => {
    expect(parseAgentArg("cursor")).toBeNull();
    expect(parseAgentArg("")).toBeNull();
  });
});

describe("parseAgentsArg", () => {
  it("expands 'all' to the given list", () => {
    expect(parseAgentsArg("all", ["claude", "codex"])).toEqual(["claude", "codex"]);
  });

  it("parses a comma-separated list, dropping unknown entries", () => {
    expect(parseAgentsArg("claude, gemini,nope,oc", [...CANONICAL_AGENTS])).toEqual([
      "claude",
      "antigravity",
      "opencode",
    ]);
  });

  it("names an agent once when an alias repeats it", () => {
    expect(parseAgentsArg("gemini,agy,antigravity", [...CANONICAL_AGENTS])).toEqual(["antigravity"]);
  });
});
