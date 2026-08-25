import { describe, expect, test } from "vitest";
import { canonicalAgent, canonicalAgents, isLegacyAgent, storageAgents } from "./agents.js";

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
