import { describe, expect, test } from "vitest";
import { canonicalAgent, canonicalAgents, isLegacyAgent } from "./agents.js";

describe("agent vocabulary", () => {
  test("canonicalAgent resolves the alias, keeps canonical ids, refuses the rest", () => {
    expect(canonicalAgent("gemini")).toBe("antigravity");
    expect(canonicalAgent("antigravity")).toBe("antigravity");
    expect(canonicalAgent("cursor")).toBeNull();
    expect(canonicalAgent(42)).toBeNull();
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
