import { describe, it, expect } from "vitest";
import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { parseAgentArg, parseAgentsArg } from "./detection.js";

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
