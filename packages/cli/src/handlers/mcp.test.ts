import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// Mock the registry module
vi.mock("../config/registry.js", () => ({
  getItemContent: vi.fn(),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

describe("mcp handler", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("installMcp", () => {
    it("should add MCP server to .mcp.json", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({
          name: "github",
          config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
          },
        })
      );

      const { installMcp } = await import("./mcp.js");

      const item: RegistryItem = {
        slug: "github-mcp",
        name: "GitHub MCP Server",
        type: "mcp",
        description: "MCP server for GitHub",
        compatibility: ["claude"],
      };

      const results = await installMcp(item, ["claude"], "project", "copy", true, "/my/project");

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.path).toBe("/my/project/.mcp.json");

      const config = JSON.parse(vol.readFileSync("/my/project/.mcp.json", "utf-8") as string);
      expect(config.mcpServers.github).toBeDefined();
      expect(config.mcpServers.github.command).toBe("npx");
    });

    it("should merge with existing MCP servers", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({
          name: "filesystem",
          config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
          },
        })
      );

      const { installMcp } = await import("./mcp.js");

      // Create parent directory and existing .mcp.json
      vol.mkdirSync("/my/project", { recursive: true });
      vol.writeFileSync(
        "/my/project/.mcp.json",
        JSON.stringify({
          mcpServers: {
            existing: { command: "existing-cmd" },
          },
        })
      );

      const item: RegistryItem = {
        slug: "filesystem-mcp",
        name: "Filesystem MCP",
        type: "mcp",
        description: "MCP server for filesystem",
        compatibility: ["claude"],
      };

      await installMcp(item, ["claude"], "project", "copy", true, "/my/project");

      const config = JSON.parse(vol.readFileSync("/my/project/.mcp.json", "utf-8") as string);
      expect(config.mcpServers.existing).toBeDefined();
      expect(config.mcpServers.filesystem).toBeDefined();
    });

    it("should use user scope path for user installation", async () => {
      const { getItemContent } = await import("../config/registry.js");
      vi.mocked(getItemContent).mockResolvedValue(
        JSON.stringify({
          name: "github",
          config: { command: "npx" },
        })
      );

      const { installMcp } = await import("./mcp.js");

      const item: RegistryItem = {
        slug: "github-mcp",
        name: "GitHub MCP Server",
        type: "mcp",
        description: "MCP server for GitHub",
        compatibility: ["claude"],
      };

      const results = await installMcp(item, ["claude"], "user", "copy", true, "/my/project");

      expect(results[0]?.path).toBe("/home/testuser/.claude.json");
    });
  });

  describe("uninstallMcp", () => {
    it("should remove MCP server from config", async () => {
      const { uninstallMcp } = await import("./mcp.js");

      vol.mkdirSync("/my/project", { recursive: true });
      vol.writeFileSync(
        "/my/project/.mcp.json",
        JSON.stringify({
          mcpServers: {
            github: { command: "npx" },
            filesystem: { command: "npx" },
          },
        })
      );

      const result = await uninstallMcp("github", "claude", "project", "/my/project");

      expect(result).toBe(true);
      const config = JSON.parse(vol.readFileSync("/my/project/.mcp.json", "utf-8") as string);
      expect(config.mcpServers.github).toBeUndefined();
      expect(config.mcpServers.filesystem).toBeDefined();
    });

    it("should return false for non-existent server", async () => {
      const { uninstallMcp } = await import("./mcp.js");

      vol.mkdirSync("/my/project", { recursive: true });
      vol.writeFileSync("/my/project/.mcp.json", JSON.stringify({ mcpServers: {} }));

      const result = await uninstallMcp("nonexistent", "claude", "project", "/my/project");

      expect(result).toBe(false);
    });
  });

  describe("getInstalledMcpServers", () => {
    it("should list installed MCP servers", async () => {
      const { getInstalledMcpServers } = await import("./mcp.js");

      vol.mkdirSync("/my/project", { recursive: true });
      vol.writeFileSync(
        "/my/project/.mcp.json",
        JSON.stringify({
          mcpServers: {
            github: { command: "npx" },
            filesystem: { command: "npx" },
          },
        })
      );

      const servers = await getInstalledMcpServers("claude", "project", "/my/project");

      expect(servers).toContain("github");
      expect(servers).toContain("filesystem");
      expect(servers).toHaveLength(2);
    });

    it("should return empty array for no config file", async () => {
      const { getInstalledMcpServers } = await import("./mcp.js");

      const servers = await getInstalledMcpServers("claude", "project", "/my/project");

      expect(servers).toEqual([]);
    });
  });

  describe("mcpHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { mcpHandler } = await import("./mcp.js");

      expect(mcpHandler.type).toBe("mcp");
      expect(typeof mcpHandler.install).toBe("function");
      expect(typeof mcpHandler.uninstall).toBe("function");
      expect(typeof mcpHandler.listInstalled).toBe("function");
    });
  });
});
