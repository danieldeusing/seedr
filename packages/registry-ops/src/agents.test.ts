import { describe, expect, test } from "vitest";
import { canonicalAgent, canonicalAgents, isLegacyAgent, storageAgents, AGENT_COMPATIBILITY, unclaimedAgents, structurallyImpossibleAgents } from "./agents.js";
import { ALL_TYPES } from "./paths.js";

describe("agent vocabulary", () => {
  test("canonicalAgent resolves the alias, keeps canonical ids, refuses the rest", () => {
    expect(canonicalAgent("gemini")).toBe("antigravity");
    expect(canonicalAgent("antigravity")).toBe("antigravity");
    expect(canonicalAgent("cursor")).toBeNull();
    expect(canonicalAgent(42)).toBeNull();
  });

  test("storageAgents writes canonical ids, and still reads the old ones", () => {
    // The downgrade table is empty now that the published CLI understands
    // antigravity, so a stored `gemini` resolves on the way in and never on the
    // way out.
    expect(storageAgents(["antigravity", "claude", "gemini"])).toEqual(["claude", "antigravity"]);
    expect(storageAgents(["claude", "cursor"])).toEqual(["claude"]);
    expect(storageAgents([])).toEqual([]);
  });

  test("Object.prototype keys are not agents", () => {
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(isLegacyAgent(key)).toBe(false);
      expect(canonicalAgent(key)).toBeNull();
    }
  });

  test("canonicalAgents dedupes into canonical order", () => {
    expect(canonicalAgents(["gemini", "claude", "antigravity", "nope"])).toEqual(["claude", "antigravity"]);
  });
});

describe("reconciling item declarations with the capability table", () => {
  const plugin = (compatibility: string[], path?: string) => ({
    type: "plugin" as const,
    compatibility,
    ...(path ? { pluginSource: { path } } : {}),
  });

  test("names the agents an item could reach but does not claim", () => {
    expect(unclaimedAgents(plugin(["claude"]))).toEqual(["copilot", "antigravity", "codex", "opencode"]);
    expect(unclaimedAgents(plugin(["claude", "copilot", "antigravity", "codex", "opencode"]))).toEqual([]);
  });

  test("resolves aliases before comparing", () => {
    expect(unclaimedAgents(plugin(["claude", "gemini"]))).not.toContain("antigravity");
  });

  // OpenCode resolves a plugin from a git spec, which has no subpath, so a
  // plugin living in a marketplace monorepo's subdirectory cannot be named at
  // all. That is a fact about the item, not a gap in its declaration.
  test("does not count an agent the item structurally cannot reach", () => {
    expect(structurallyImpossibleAgents(plugin(["claude"], "plugins/x"))).toEqual(["opencode"]);
    expect(unclaimedAgents(plugin(["claude"], "plugins/x"))).not.toContain("opencode");
    expect(unclaimedAgents(plugin(["claude"]))).toContain("opencode");
  });

  test("every type the registry knows about has a compatibility row", () => {
    for (const type of ALL_TYPES) {
      expect(AGENT_COMPATIBILITY[type].length, `"${type}" is installable nowhere`).toBeGreaterThan(0);
    }
  });
});
