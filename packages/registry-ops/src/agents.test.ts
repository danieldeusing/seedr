import { describe, expect, test } from "vitest";
import { canonicalAgent, canonicalAgents, AGENT_COMPATIBILITY, derivePluginCompatibility, unclaimedAgents, type PluginBundle } from "./agents.js";
import { ALL_TYPES } from "./paths.js";

describe("agent vocabulary", () => {
  test("canonicalAgent keeps canonical ids and refuses the rest, the retired gemini id included", () => {
    expect(canonicalAgent("antigravity")).toBe("antigravity");
    expect(canonicalAgent("gemini")).toBeNull();
    expect(canonicalAgent("cursor")).toBeNull();
    expect(canonicalAgent(42)).toBeNull();
  });

  test("Object.prototype keys are not agents", () => {
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(canonicalAgent(key)).toBeNull();
    }
  });

  test("canonicalAgents dedupes into canonical order and drops unknown ids", () => {
    expect(canonicalAgents(["antigravity", "claude", "antigravity", "gemini", "nope"])).toEqual(["claude", "antigravity"]);
  });
});

describe("reconciling item declarations with the capability table", () => {
  const plugin = (compatibility: string[], bundle: PluginBundle = { pluginType: "wrapper", wrapper: "skill" }) => ({
    type: "plugin" as const,
    compatibility,
    ...bundle,
  });

  test("a plugin goes wherever every component it bundles can go", () => {
    expect(derivePluginCompatibility({ pluginType: "wrapper", wrapper: "skill" })).toEqual(["claude", "copilot", "antigravity", "codex"]);
    expect(derivePluginCompatibility({ pluginType: "wrapper", wrapper: "mcp" })).toEqual(["claude", "copilot", "codex"]);
    expect(derivePluginCompatibility({ pluginType: "package", package: { skill: 3, mcp: 1 } })).toEqual(["claude", "copilot", "codex"]);
    expect(derivePluginCompatibility({ pluginType: "package", package: { agent: 2, skill: 1 } })).toEqual(["claude", "copilot"]);
    expect(derivePluginCompatibility({ pluginType: "package", package: { skill: 3, hook: 1 } })).toEqual(["claude"]);
    expect(derivePluginCompatibility({ pluginType: "package", package: { command: 4 } })).toEqual(["claude"]);
  });

  test("an integration has no payload to carry and stays with Claude", () => {
    expect(derivePluginCompatibility({ pluginType: "integration" })).toEqual(["claude"]);
    expect(derivePluginCompatibility({})).toEqual(["claude"]);
  });

  // OpenCode loads a plugin through a JS entry the classification does not
  // see, so an item says OpenCode by hand and the reconciliation never asks
  // for it — but it never counts a hand-made declaration against the item either.
  test("OpenCode is declared by hand, never derived", () => {
    expect(derivePluginCompatibility({ pluginType: "wrapper", wrapper: "skill" })).not.toContain("opencode");
    expect(unclaimedAgents(plugin(["claude"]))).not.toContain("opencode");
    expect(unclaimedAgents(plugin(["claude", "copilot", "antigravity", "codex", "opencode"], { pluginType: "package", package: { skill: 9, hook: 1 } }))).toEqual([]);
  });

  test("names the agents an item could reach but does not claim", () => {
    expect(unclaimedAgents(plugin(["claude"]))).toEqual(["copilot", "antigravity", "codex"]);
    expect(unclaimedAgents(plugin(["claude"], { pluginType: "wrapper", wrapper: "mcp" }))).toEqual(["copilot", "codex"]);
    expect(unclaimedAgents(plugin(["claude", "copilot", "antigravity", "codex"]))).toEqual([]);
    expect(unclaimedAgents({ type: "skill", compatibility: ["claude"] })).toEqual(["copilot", "antigravity", "codex", "opencode"]);
  });

  test("the retired gemini id claims nothing, antigravity included", () => {
    expect(unclaimedAgents(plugin(["claude", "gemini"]))).toContain("antigravity");
  });

  test("every type the registry knows about has a compatibility row", () => {
    for (const type of ALL_TYPES) {
      expect(AGENT_COMPATIBILITY[type].length, `"${type}" is installable nowhere`).toBeGreaterThan(0);
    }
  });
});
