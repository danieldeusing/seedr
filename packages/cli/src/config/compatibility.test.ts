import { describe, it, expect } from "vitest";
import {
  AGENT_COMPATIBILITY,
  isTypeSupported,
  getCompatibleAgents,
  filterCompatibleAgents,
  describeIncompatibility,
} from "./compatibility.js";

describe("compatibility", () => {
  describe("AGENT_COMPATIBILITY", () => {
    it("should have all content types defined", () => {
      expect(AGENT_COMPATIBILITY).toHaveProperty("skill");
      expect(AGENT_COMPATIBILITY).toHaveProperty("command");
      expect(AGENT_COMPATIBILITY).toHaveProperty("agent");
      expect(AGENT_COMPATIBILITY).toHaveProperty("hook");
      expect(AGENT_COMPATIBILITY).toHaveProperty("plugin");
      expect(AGENT_COMPATIBILITY).toHaveProperty("settings");
      expect(AGENT_COMPATIBILITY).toHaveProperty("mcp");
    });

    it("should have skills compatible with all agents", () => {
      expect(AGENT_COMPATIBILITY.skill).toContain("claude");
      expect(AGENT_COMPATIBILITY.skill).toContain("copilot");
      expect(AGENT_COMPATIBILITY.skill).toContain("antigravity");
      expect(AGENT_COMPATIBILITY.skill).toContain("codex");
      expect(AGENT_COMPATIBILITY.skill).toContain("opencode");
    });

    it("should have Claude-only types", () => {
      expect(AGENT_COMPATIBILITY.agent).toEqual(["claude"]);
      expect(AGENT_COMPATIBILITY.hook).toEqual(["claude"]);
      expect(AGENT_COMPATIBILITY.plugin).toEqual(["claude"]);
      expect(AGENT_COMPATIBILITY.settings).toEqual(["claude"]);
      expect(AGENT_COMPATIBILITY.command).toEqual(["claude"]);
    });

    it("should have MCP compatible with every agent whose format is verified", () => {
      expect(AGENT_COMPATIBILITY.mcp).toEqual(["claude", "codex", "opencode"]);
    });

    it("should exclude copilot from MCP and say why", () => {
      expect(AGENT_COMPATIBILITY.mcp).not.toContain("copilot");
      expect(isTypeSupported("mcp", "copilot")).toBe(false);
      expect(describeIncompatibility("mcp", "copilot")).toMatch(/could not be verified/);
      expect(describeIncompatibility("hook", "gemini")).toBe("antigravity does not support hook content");
    });
  });

  describe("isTypeSupported", () => {
    it("should return true for supported type/agent combinations", () => {
      expect(isTypeSupported("skill", "claude")).toBe(true);
      expect(isTypeSupported("skill", "copilot")).toBe(true);
      expect(isTypeSupported("agent", "claude")).toBe(true);
    });

    it("should return false for unsupported type/agent combinations", () => {
      expect(isTypeSupported("agent", "copilot")).toBe(false);
      expect(isTypeSupported("hook", "gemini")).toBe(false);
      expect(isTypeSupported("plugin", "codex")).toBe(false);
    });

    it("resolves the deprecated gemini id like antigravity", () => {
      expect(isTypeSupported("skill", "gemini")).toBe(true);
      // antigravity's MCP format is unverified, so the alias is refused the same way
      expect(isTypeSupported("mcp", "antigravity")).toBe(false);
      expect(isTypeSupported("mcp", "gemini")).toBe(false);
    });
  });

  describe("getCompatibleAgents", () => {
    it("should return all agents for skills", () => {
      const agents = getCompatibleAgents("skill");
      expect(agents).toHaveLength(5);
      expect(agents).toContain("claude");
      expect(agents).toContain("copilot");
    });

    it("should return only claude for agents", () => {
      const agents = getCompatibleAgents("agent");
      expect(agents).toEqual(["claude"]);
    });
  });

  describe("filterCompatibleAgents", () => {
    it("should filter agents to only compatible ones", () => {
      const agents = filterCompatibleAgents("agent", ["claude", "copilot", "gemini"]);
      expect(agents).toEqual(["claude"]);
    });

    it("should return all agents if all are compatible", () => {
      const agents = filterCompatibleAgents("skill", ["claude", "copilot"]);
      expect(agents).toEqual(["claude", "copilot"]);
    });

    it("should return empty array if no agents are compatible", () => {
      const agents = filterCompatibleAgents("agent", ["copilot", "gemini"]);
      expect(agents).toEqual([]);
    });

    it("canonicalises aliases, drops duplicates and returns canonical order", () => {
      const agents = filterCompatibleAgents("skill", ["gemini", "antigravity", "claude"]);
      expect(agents).toEqual(["claude", "antigravity"]);
    });
  });
});
