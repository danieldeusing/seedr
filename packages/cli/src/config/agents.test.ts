import { describe, it, expect, vi } from "vitest";
import {
  CODING_AGENTS,
  ALL_AGENTS,
  getAgentConfig,
  getContentTypeConfig,
  getAgentRoot,
  getContentPath,
  getSettingsPath,
  getMcpPath,
} from "./agents.js";

// Mock homedir to return a consistent path for testing
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

describe("agents", () => {
  describe("CODING_AGENTS", () => {
    it("should have all 5 agents defined", () => {
      expect(Object.keys(CODING_AGENTS)).toHaveLength(5);
      expect(CODING_AGENTS).toHaveProperty("claude");
      expect(CODING_AGENTS).toHaveProperty("copilot");
      expect(CODING_AGENTS).toHaveProperty("gemini");
      expect(CODING_AGENTS).toHaveProperty("codex");
      expect(CODING_AGENTS).toHaveProperty("opencode");
    });

    it("should have correct structure for claude", () => {
      const claude = CODING_AGENTS.claude;
      expect(claude.name).toBe("Claude Code");
      expect(claude.shortName).toBe("claude");
      expect(claude.projectRoot).toBe(".claude");
      expect(claude.contentTypes).toHaveProperty("skill");
      expect(claude.contentTypes).toHaveProperty("agent");
      expect(claude.contentTypes).toHaveProperty("hook");
      expect(claude.contentTypes).toHaveProperty("mcp");
    });

    it("should have directory structure for skills in all agents", () => {
      for (const agent of ALL_AGENTS) {
        const skillConfig = CODING_AGENTS[agent].contentTypes.skill;
        expect(skillConfig).toBeDefined();
        expect(skillConfig?.structure).toBe("directory");
        expect(skillConfig?.mainFile).toBe("SKILL.md");
        expect(skillConfig?.path).toBe("skills");
      }
    });
  });

  describe("getAgentConfig", () => {
    it("should return config for a valid agent", () => {
      const config = getAgentConfig("claude");
      expect(config.name).toBe("Claude Code");
    });
  });

  describe("getContentTypeConfig", () => {
    it("should return config for supported type", () => {
      const config = getContentTypeConfig("claude", "skill");
      expect(config).toBeDefined();
      expect(config?.structure).toBe("directory");
    });

    it("should return undefined for unsupported type", () => {
      const config = getContentTypeConfig("copilot", "agent");
      expect(config).toBeUndefined();
    });

    it("should return json-merge for hooks", () => {
      const config = getContentTypeConfig("claude", "hook");
      expect(config?.structure).toBe("json-merge");
      expect(config?.mergeTarget).toBe("settings.json");
      expect(config?.mergeField).toBe("hooks");
    });
  });

  describe("getAgentRoot", () => {
    it("should return project root for project scope", () => {
      const root = getAgentRoot("claude", "project", "/my/project");
      expect(root).toBe("/my/project/.claude");
    });

    it("should return user root for user scope", () => {
      const root = getAgentRoot("claude", "user", "/my/project");
      expect(root).toContain(".claude");
    });

    it("should return project root for local scope", () => {
      const root = getAgentRoot("claude", "local", "/my/project");
      expect(root).toBe("/my/project/.claude");
    });

    it("should use correct project root for each agent", () => {
      expect(getAgentRoot("copilot", "project", "/project")).toBe("/project/.github");
      expect(getAgentRoot("gemini", "project", "/project")).toBe("/project/.gemini");
      expect(getAgentRoot("codex", "project", "/project")).toBe("/project/.codex");
      expect(getAgentRoot("opencode", "project", "/project")).toBe("/project/.opencode");
    });
  });

  describe("getContentPath", () => {
    it("should return correct path for skills", () => {
      const path = getContentPath("claude", "skill", "project", "/my/project");
      expect(path).toBe("/my/project/.claude/skills");
    });

    it("should return correct path for agents", () => {
      const path = getContentPath("claude", "agent", "project", "/my/project");
      expect(path).toBe("/my/project/.claude/agents");
    });

    it("should return undefined for unsupported content types", () => {
      const path = getContentPath("copilot", "agent", "project", "/my/project");
      expect(path).toBeUndefined();
    });

    it("should return root for types with empty path", () => {
      const path = getContentPath("claude", "hook", "project", "/my/project");
      expect(path).toBe("/my/project/.claude");
    });
  });

  describe("getSettingsPath", () => {
    it("should return project settings path", () => {
      const path = getSettingsPath("project", "/my/project");
      expect(path).toBe("/my/project/.claude/settings.json");
    });

    it("should return local settings path", () => {
      const path = getSettingsPath("local", "/my/project");
      expect(path).toBe("/my/project/.claude/settings.local.json");
    });
  });

  describe("getMcpPath", () => {
    it("should return project .mcp.json for project scope", () => {
      const path = getMcpPath("project", "/my/project");
      expect(path).toBe("/my/project/.mcp.json");
    });

    it("should return project .mcp.json for local scope", () => {
      const path = getMcpPath("local", "/my/project");
      expect(path).toBe("/my/project/.mcp.json");
    });
  });
});
