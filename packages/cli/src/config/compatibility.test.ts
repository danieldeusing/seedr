import { describe, it, expect } from "vitest";
import {
  AGENT_COMPATIBILITY,
  isTypeSupported,
  getCompatibleAgents,
  filterCompatibleAgents,
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
      expect(AGENT_COMPATIBILITY.skill).toContain("gemini");
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

    it("should have MCP compatible with all agents", () => {
      expect(AGENT_COMPATIBILITY.mcp).toContain("claude");
      expect(AGENT_COMPATIBILITY.mcp).toContain("copilot");
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
  });
});
