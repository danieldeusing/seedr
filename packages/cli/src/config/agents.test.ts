import { describe, it, expect, vi } from "vitest";
import { CANONICAL_AGENTS, KNOWN_AGENTS } from "@seedr/registry-ops/pure";
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

const PROJECT = "/my/project";
const PROJECT_CLAUDE = "/my/project/.claude";

// Mock homedir to return a consistent path for testing
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

describe("agents", () => {
  describe("CODING_AGENTS", () => {
    it("has a layout for every known agent id, aliases included", () => {
      expect(Object.keys(CODING_AGENTS).sort()).toEqual([...KNOWN_AGENTS].sort());
    });

    it("expands 'all' to the canonical agents only", () => {
      expect(ALL_AGENTS).toEqual([...CANONICAL_AGENTS]);
      expect(ALL_AGENTS).not.toContain("gemini");
    });

    it("installs Antigravity skills into the agent-neutral .agents tree", () => {
      const antigravity = CODING_AGENTS.antigravity;
      expect(antigravity.name).toBe("Google Antigravity");
      expect(antigravity.projectRoot).toBe(".agents");
      expect(antigravity.userRoot).toBe("/home/testuser/.agents");
      expect(Object.keys(antigravity.contentTypes)).toEqual(["skill"]);
    });

    it("treats the deprecated gemini id as Antigravity", () => {
      expect(CODING_AGENTS.gemini).toBe(CODING_AGENTS.antigravity);
      expect(getAgentConfig("gemini").shortName).toBe("antigravity");
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
      const root = getAgentRoot("claude", "project", PROJECT);
      expect(root).toBe(PROJECT_CLAUDE);
    });

    it("should return user root for user scope", () => {
      const root = getAgentRoot("claude", "user", PROJECT);
      expect(root).toContain(".claude");
    });

    it("should return project root for local scope", () => {
      const root = getAgentRoot("claude", "local", PROJECT);
      expect(root).toBe(PROJECT_CLAUDE);
    });

    it("should use correct project root for each agent", () => {
      expect(getAgentRoot("copilot", "project", "/project")).toBe("/project/.github");
      expect(getAgentRoot("antigravity", "project", "/project")).toBe("/project/.agents");
      expect(getAgentRoot("gemini", "project", "/project")).toBe("/project/.agents");
      expect(getAgentRoot("codex", "project", "/project")).toBe("/project/.codex");
      expect(getAgentRoot("opencode", "project", "/project")).toBe("/project/.opencode");
    });
  });

  describe("getContentPath", () => {
    it("should return correct path for skills", () => {
      const path = getContentPath("claude", "skill", "project", PROJECT);
      expect(path).toBe("/my/project/.claude/skills");
    });

    it("should return correct path for agents", () => {
      const path = getContentPath("claude", "agent", "project", PROJECT);
      expect(path).toBe("/my/project/.claude/agents");
    });

    it("should return undefined for unsupported content types", () => {
      const path = getContentPath("copilot", "agent", "project", PROJECT);
      expect(path).toBeUndefined();
    });

    it("should return root for types with empty path", () => {
      const path = getContentPath("claude", "hook", "project", PROJECT);
      expect(path).toBe(PROJECT_CLAUDE);
    });
  });

  describe("getSettingsPath", () => {
    it("should return project settings path", () => {
      const path = getSettingsPath("project", PROJECT);
      expect(path).toBe("/my/project/.claude/settings.json");
    });

    it("should return local settings path", () => {
      const path = getSettingsPath("local", PROJECT);
      expect(path).toBe("/my/project/.claude/settings.local.json");
    });
  });

  describe("getMcpPath", () => {
    it("should return project .mcp.json for project scope", () => {
      const path = getMcpPath("project", PROJECT);
      expect(path).toBe("/my/project/.mcp.json");
    });

    it("should return project .mcp.json for local scope", () => {
      const path = getMcpPath("local", PROJECT);
      expect(path).toBe("/my/project/.mcp.json");
    });
  });
});
