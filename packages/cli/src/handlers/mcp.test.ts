import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";
import type { CodingAgent } from "../types.js";

const GITHUB_PACKAGE = "@modelcontextprotocol/server-github";
const GITHUB_TOKEN_REF = "${GITHUB_TOKEN}";
const GITHUB_SLUG = "github-mcp";
const CODEX_PROJECT_DIR = "/my/project/.codex";
const OPENCODE_USER_FILE = "/home/testuser/.config/opencode/opencode.json";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// Mock the registry module
vi.mock("../config/registry.js", () => ({
  getItem: vi.fn(async () => undefined),
  getItemContent: vi.fn(),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const PROJECT = "/my/project";
const CLAUDE_PROJECT_FILE = "/my/project/.mcp.json";
const CODEX_PROJECT_FILE = "/my/project/.codex/config.toml";
const GEMINI_PROJECT_FILE = "/my/project/.gemini/settings.json";
const OPENCODE_PROJECT_FILE = "/my/project/opencode.json";
const NPX = "npx";

const GITHUB_STDIO = {
  name: "github",
  config: {
    command: NPX,
    args: ["-y", GITHUB_PACKAGE],
    env: { GITHUB_TOKEN: GITHUB_TOKEN_REF },
  },
};

const REMOTE_HTTP = {
  name: "remote",
  config: { type: "http", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer x" } },
};

function mcpItem(slug = GITHUB_SLUG): RegistryItem {
  return { slug, name: "GitHub MCP Server", type: "mcp", description: "MCP server for GitHub", compatibility: ["claude", "codex", "gemini", "opencode"] };
}

async function serveDefinition(definition: unknown): Promise<void> {
  const { getItemContent } = await import("../config/registry.js");
  vi.mocked(getItemContent).mockResolvedValue(JSON.stringify(definition));
}

// Inferred from JSON.parse on purpose: fixtures are free-form documents.
function readJsonFile(path: string) {
  return JSON.parse(vol.readFileSync(path, "utf-8") as string);
}

describe("mcp handler", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("installMcp (claude)", () => {
    it("should add MCP server to .mcp.json", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp } = await import("./mcp.js");

      const results = await installMcp(mcpItem(), ["claude"], "project", "copy", true, PROJECT);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.path).toBe(CLAUDE_PROJECT_FILE);

      const config = readJsonFile(CLAUDE_PROJECT_FILE);
      expect(config.mcpServers.github).toEqual(GITHUB_STDIO.config);
    });

    it("should merge with existing MCP servers", async () => {
      await serveDefinition({ name: "filesystem", config: { command: NPX, args: ["-y", "@modelcontextprotocol/server-filesystem"] } });
      const { installMcp } = await import("./mcp.js");

      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(CLAUDE_PROJECT_FILE, JSON.stringify({ mcpServers: { existing: { command: "existing-cmd" } }, other: 1 }));

      await installMcp(mcpItem("filesystem-mcp"), ["claude"], "project", "copy", true, PROJECT);

      const config = readJsonFile(CLAUDE_PROJECT_FILE);
      expect(config.mcpServers.existing).toBeDefined();
      expect(config.mcpServers.filesystem).toBeDefined();
      expect(config.other).toBe(1);
    });

    it("should use user scope path for user installation", async () => {
      await serveDefinition({ name: "github", config: { command: NPX } });
      const { installMcp } = await import("./mcp.js");

      const results = await installMcp(mcpItem(), ["claude"], "user", "copy", true, PROJECT);

      expect(results[0]?.path).toBe("/home/testuser/.claude.json");
    });

    it("refuses to overwrite an existing server without force", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp } = await import("./mcp.js");
      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(CLAUDE_PROJECT_FILE, JSON.stringify({ mcpServers: { github: { command: "old" } } }));

      const results = await installMcp(mcpItem(), ["claude"], "project", "copy", false, PROJECT);

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toMatch(/already exists in \/my\/project\/.mcp.json; pass --force/);
      expect(readJsonFile(CLAUDE_PROJECT_FILE).mcpServers.github.command).toBe("old");
    });

    it("rejects malformed definitions", async () => {
      const { getItemContent } = await import("../config/registry.js");
      const { installMcp, parseMcpDefinition } = await import("./mcp.js");
      vi.mocked(getItemContent).mockResolvedValue("not json");
      expect((await installMcp(mcpItem(), ["claude"], "project", "copy", true, PROJECT))[0]?.error).toBe(
        "Invalid MCP definition: must be valid JSON"
      );
      expect(() => parseMcpDefinition(JSON.stringify({ config: {} }))).toThrow(/expected \{ "name": string/);
      expect(() => parseMcpDefinition(JSON.stringify({ name: "x" }))).toThrow(/expected \{ "name": string/);
    });

    it("refuses copilot with the documented reason", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp, uninstallMcp, getInstalledMcpServers } = await import("./mcp.js");

      const results = await installMcp(mcpItem(), ["copilot"], "project", "copy", true, PROJECT);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toBe("MCP servers are not supported for GitHub Copilot");
      expect(vol.existsSync("/my/project/.github")).toBe(false);
      expect(await uninstallMcp("github", "copilot", "project", PROJECT)).toBe(false);
      expect(await getInstalledMcpServers("copilot", "project", PROJECT)).toEqual([]);
    });
  });

  describe("codex adapter (TOML)", () => {
    it("writes [mcp_servers.<name>] with args and an env sub-table, preserving other tables", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp } = await import("./mcp.js");
      vol.mkdirSync(CODEX_PROJECT_DIR, { recursive: true });
      vol.writeFileSync(CODEX_PROJECT_FILE, 'model = "o3"\n\n[profiles.fast]\nmodel = "o4-mini"\n');

      const results = await installMcp(mcpItem(), ["codex"], "project", "copy", true, PROJECT);

      expect(results[0]).toEqual({ agent: "codex", success: true, path: CODEX_PROJECT_FILE });
      const text = vol.readFileSync(CODEX_PROJECT_FILE, "utf-8") as string;
      expect(text).toBe(
        `model = "o3"\n\n[profiles.fast]\nmodel = "o4-mini"\n\n[mcp_servers.github]\ncommand = "npx"\nargs = ["-y", "${GITHUB_PACKAGE}"]\n\n[mcp_servers.github.env]\nGITHUB_TOKEN = "${GITHUB_TOKEN_REF}"\n`
      );
    });

    it("writes url and http_headers for remote servers at user scope", async () => {
      await serveDefinition({ ...REMOTE_HTTP, config: { ...REMOTE_HTTP.config, bearer_token_env_var: "MCP_TOKEN" } });
      const { installMcp } = await import("./mcp.js");

      const results = await installMcp(mcpItem("remote-mcp"), ["codex"], "user", "copy", true, PROJECT);

      expect(results[0]?.path).toBe("/home/testuser/.codex/config.toml");
      const text = vol.readFileSync("/home/testuser/.codex/config.toml", "utf-8") as string;
      expect(text).toBe(
        '[mcp_servers.remote]\nurl = "https://mcp.example.com/mcp"\nbearer_token_env_var = "MCP_TOKEN"\n\n[mcp_servers.remote.http_headers]\nAuthorization = "Bearer x"\n'
      );
    });

    it("refuses to overwrite without force and replaces with force", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp } = await import("./mcp.js");
      vol.mkdirSync(CODEX_PROJECT_DIR, { recursive: true });
      vol.writeFileSync(CODEX_PROJECT_FILE, '[mcp_servers.github]\ncommand = "old"\n\n[mcp_servers.github.env]\nOLD = "1"\n');

      const refused = await installMcp(mcpItem(), ["codex"], "project", "copy", false, PROJECT);
      expect(refused[0]?.error).toMatch(/already exists in \/my\/project\/.codex\/config.toml/);
      expect(vol.readFileSync(CODEX_PROJECT_FILE, "utf-8")).toContain('command = "old"');

      const forced = await installMcp(mcpItem(), ["codex"], "project", "copy", true, PROJECT);
      expect(forced[0]?.success).toBe(true);
      const text = vol.readFileSync(CODEX_PROJECT_FILE, "utf-8") as string;
      expect(text).not.toContain('command = "old"');
      expect(text).not.toContain('OLD = "1"');
      expect(text).toContain('command = "npx"');
    });

    it("uninstalls by removing the table and its sub-tables only", async () => {
      const { uninstallMcp, getInstalledMcpServers } = await import("./mcp.js");
      vol.mkdirSync(CODEX_PROJECT_DIR, { recursive: true });
      vol.writeFileSync(
        CODEX_PROJECT_FILE,
        'model = "o3"\n\n[mcp_servers.github]\ncommand = "npx"\n\n[mcp_servers.github.env]\nA = "1"\n\n[mcp_servers.other]\ncommand = "x"\n'
      );

      expect(await getInstalledMcpServers("codex", "project", PROJECT)).toEqual(["github", "other"]);
      expect(await uninstallMcp("github", "codex", "project", PROJECT)).toBe(true);
      expect(vol.readFileSync(CODEX_PROJECT_FILE, "utf-8")).toBe('model = "o3"\n\n[mcp_servers.other]\ncommand = "x"\n');
      expect(await uninstallMcp("github", "codex", "project", PROJECT)).toBe(false);
      expect(await getInstalledMcpServers("codex", "project", PROJECT)).toEqual(["other"]);
      expect(await getInstalledMcpServers("codex", "user", PROJECT)).toEqual([]);
    });
  });

  describe("gemini adapter", () => {
    it("writes stdio servers under mcpServers in .gemini/settings.json", async () => {
      await serveDefinition({ name: "github", config: { ...GITHUB_STDIO.config, cwd: "/work", timeout: 5000, trust: true, type: "stdio" } });
      const { installMcp } = await import("./mcp.js");
      vol.mkdirSync("/my/project/.gemini", { recursive: true });
      vol.writeFileSync(GEMINI_PROJECT_FILE, JSON.stringify({ theme: "dark", mcpServers: { keep: { command: "k" } } }));

      const results = await installMcp(mcpItem(), ["gemini"], "project", "copy", true, PROJECT);

      expect(results[0]?.path).toBe(GEMINI_PROJECT_FILE);
      const config = readJsonFile(GEMINI_PROJECT_FILE);
      expect(config.theme).toBe("dark");
      expect(config.mcpServers.keep).toEqual({ command: "k" });
      expect(config.mcpServers.github).toEqual({
        command: NPX,
        args: ["-y", GITHUB_PACKAGE],
        env: { GITHUB_TOKEN: GITHUB_TOKEN_REF },
        cwd: "/work",
        timeout: 5000,
        trust: true,
      });
      expect(config.mcpServers.github.type).toBeUndefined();
    });

    it("maps http to httpUrl and sse to url", async () => {
      const { toGeminiServer } = await import("./mcp.js");
      expect(toGeminiServer({ type: "http", url: "https://h", headers: { A: "b" } })).toEqual({ httpUrl: "https://h", headers: { A: "b" } });
      expect(toGeminiServer({ type: "sse", url: "https://s" })).toEqual({ url: "https://s" });
      expect(toGeminiServer({ url: "https://implicit" })).toEqual({ httpUrl: "https://implicit" });
    });

    it("uses ~/.gemini/settings.json at user scope and supports uninstall/list", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp, uninstallMcp, getInstalledMcpServers } = await import("./mcp.js");

      await installMcp(mcpItem(), ["gemini"], "user", "copy", true, PROJECT);
      expect(readJsonFile("/home/testuser/.gemini/settings.json").mcpServers.github.command).toBe(NPX);
      expect(await getInstalledMcpServers("gemini", "user", PROJECT)).toEqual(["github"]);
      expect(await uninstallMcp("github", "gemini", "user", PROJECT)).toBe(true);
      expect(readJsonFile("/home/testuser/.gemini/settings.json").mcpServers).toEqual({});
      expect(await uninstallMcp("github", "gemini", "user", PROJECT)).toBe(false);
    });
  });

  describe("opencode adapter", () => {
    it("writes local servers as a command array under mcp in opencode.json", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp } = await import("./mcp.js");

      const results = await installMcp(mcpItem(), ["opencode"], "project", "copy", true, PROJECT);

      expect(results[0]?.path).toBe(OPENCODE_PROJECT_FILE);
      const config = readJsonFile(OPENCODE_PROJECT_FILE);
      expect(config.$schema).toBe("https://opencode.ai/config.json");
      expect(config.mcp.github).toEqual({
        type: "local",
        command: [NPX, "-y", GITHUB_PACKAGE],
        environment: { GITHUB_TOKEN: GITHUB_TOKEN_REF },
        enabled: true,
      });
    });

    it("writes remote servers and keeps an existing document intact", async () => {
      await serveDefinition(REMOTE_HTTP);
      const { installMcp } = await import("./mcp.js");
      vol.mkdirSync("/home/testuser/.config/opencode", { recursive: true });
      vol.writeFileSync(OPENCODE_USER_FILE, JSON.stringify({ $schema: "custom", theme: "x", mcp: { keep: { type: "local", command: ["k"] } } }));

      const results = await installMcp(mcpItem("remote-mcp"), ["opencode"], "user", "copy", true, PROJECT);

      expect(results[0]?.path).toBe(OPENCODE_USER_FILE);
      const config = readJsonFile(OPENCODE_USER_FILE);
      expect(config.$schema).toBe("custom");
      expect(config.theme).toBe("x");
      expect(config.mcp.keep).toBeDefined();
      expect(config.mcp.remote).toEqual({ type: "remote", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer x" }, enabled: true });
    });

    it("refuses overwrite without force, uninstalls and lists", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp, uninstallMcp, getInstalledMcpServers } = await import("./mcp.js");
      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(OPENCODE_PROJECT_FILE, JSON.stringify({ mcp: { github: { type: "local", command: ["old"] } } }));

      expect((await installMcp(mcpItem(), ["opencode"], "project", "copy", false, PROJECT))[0]?.error).toMatch(/pass --force/);
      expect(await getInstalledMcpServers("opencode", "project", PROJECT)).toEqual(["github"]);
      expect(await uninstallMcp("github", "opencode", "project", PROJECT)).toBe(true);
      expect(await getInstalledMcpServers("opencode", "project", PROJECT)).toEqual([]);
    });

    it("translation requires a command or url", async () => {
      const { toOpenCodeServer, toCodexTables } = await import("./mcp.js");
      expect(() => toOpenCodeServer({})).toThrow(/no command/);
      expect(() => toOpenCodeServer({ type: "http" })).toThrow(/no url/);
      expect(() => toCodexTables("x", {})).toThrow(/no command/);
      expect(() => toCodexTables("x", { type: "sse" })).toThrow(/no url/);
      expect(toCodexTables("x", { command: "c", env: {}, headers: {} })).toHaveLength(1);
    });
  });

  describe("schema isolation", () => {
    it("never writes one agent's schema into another agent's file", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { installMcp } = await import("./mcp.js");
      const agents: CodingAgent[] = ["claude", "codex", "gemini", "opencode"];

      const results = await installMcp(mcpItem(), agents, "project", "copy", true, PROJECT);
      expect(results.map((r) => r.success)).toEqual([true, true, true, true]);
      expect(results.map((r) => r.path)).toEqual([CLAUDE_PROJECT_FILE, CODEX_PROJECT_FILE, GEMINI_PROJECT_FILE, OPENCODE_PROJECT_FILE]);

      const claude = readJsonFile(CLAUDE_PROJECT_FILE);
      expect(claude.mcp).toBeUndefined();
      expect(claude.mcpServers.github.command).toBe(NPX);

      const gemini = readJsonFile(GEMINI_PROJECT_FILE);
      expect(gemini.mcp).toBeUndefined();
      expect(gemini.mcpServers.github.command).toBe(NPX);

      const opencode = readJsonFile(OPENCODE_PROJECT_FILE);
      expect(opencode.mcpServers).toBeUndefined();
      expect(Array.isArray(opencode.mcp.github.command)).toBe(true);

      const codex = vol.readFileSync(CODEX_PROJECT_FILE, "utf-8") as string;
      expect(codex).not.toContain("mcpServers");
      expect(codex).toContain("[mcp_servers.github]");
    });
  });

  describe("uninstallMcp", () => {
    it("should remove MCP server from config", async () => {
      const { uninstallMcp } = await import("./mcp.js");

      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(CLAUDE_PROJECT_FILE, JSON.stringify({ mcpServers: { github: { command: NPX }, filesystem: { command: NPX } } }));

      const result = await uninstallMcp("github", "claude", "project", PROJECT);

      expect(result).toBe(true);
      const config = readJsonFile(CLAUDE_PROJECT_FILE);
      expect(config.mcpServers.github).toBeUndefined();
      expect(config.mcpServers.filesystem).toBeDefined();
    });

    it("should return false for non-existent server", async () => {
      const { uninstallMcp } = await import("./mcp.js");

      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(CLAUDE_PROJECT_FILE, JSON.stringify({ mcpServers: {} }));

      expect(await uninstallMcp("nonexistent", "claude", "project", PROJECT)).toBe(false);
    });

    it("resolves the server name through the registry definition", async () => {
      const { getItem, getItemContent } = await import("../config/registry.js");
      vi.mocked(getItem).mockResolvedValue(mcpItem(GITHUB_SLUG));
      vi.mocked(getItemContent).mockResolvedValue(JSON.stringify(GITHUB_STDIO));
      const { uninstallMcp } = await import("./mcp.js");
      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(CLAUDE_PROJECT_FILE, JSON.stringify({ mcpServers: { github: { command: NPX } } }));

      expect(await uninstallMcp(GITHUB_SLUG, "claude", "project", PROJECT)).toBe(true);
      expect(readJsonFile(CLAUDE_PROJECT_FILE).mcpServers).toEqual({});
    });

    it.each(["../x", "../../x", "/etc", "a/b", "a\\b", "", "%2e%2e", "ünï"])("rejects invalid slug %j before touching the file", async (slug) => {
      const { uninstallMcp } = await import("./mcp.js");
      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(CLAUDE_PROJECT_FILE, JSON.stringify({ mcpServers: { github: { command: NPX } } }));
      await expect(uninstallMcp(slug, "claude", "project", PROJECT)).rejects.toThrow(/Invalid item slug/);
      expect(readJsonFile(CLAUDE_PROJECT_FILE).mcpServers.github).toBeDefined();
    });
  });

  describe("getInstalledMcpServers", () => {
    it("should list installed MCP servers", async () => {
      const { getInstalledMcpServers } = await import("./mcp.js");

      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(CLAUDE_PROJECT_FILE, JSON.stringify({ mcpServers: { github: { command: NPX }, filesystem: { command: NPX } } }));

      const servers = await getInstalledMcpServers("claude", "project", PROJECT);

      expect(servers).toEqual(["github", "filesystem"]);
    });

    it("should return empty array for no config file", async () => {
      const { getInstalledMcpServers } = await import("./mcp.js");
      expect(await getInstalledMcpServers("claude", "project", PROJECT)).toEqual([]);
    });
  });

  describe("planMcp", () => {
    it("describes the config file and key per agent without writing", async () => {
      await serveDefinition(GITHUB_STDIO);
      const { planMcp } = await import("./mcp.js");
      vol.mkdirSync(PROJECT, { recursive: true });
      vol.writeFileSync(CLAUDE_PROJECT_FILE, JSON.stringify({ mcpServers: { github: { command: "old" } } }));

      const plan = await planMcp(mcpItem(), ["claude", "codex", "gemini", "opencode"], "project", "copy", PROJECT);

      expect(plan).toEqual([
        { agent: "claude", kind: "modify", path: CLAUDE_PROJECT_FILE, detail: "mcpServers.github (replaces existing entry)" },
        { agent: "codex", kind: "create", path: CODEX_PROJECT_FILE, detail: "[mcp_servers.github]" },
        { agent: "gemini", kind: "create", path: GEMINI_PROJECT_FILE, detail: "mcpServers.github" },
        { agent: "opencode", kind: "create", path: OPENCODE_PROJECT_FILE, detail: "mcp.github" },
      ]);
      expect(vol.existsSync(CODEX_PROJECT_FILE)).toBe(false);
      expect(readJsonFile(CLAUDE_PROJECT_FILE).mcpServers.github.command).toBe("old");
    });
  });

  describe("mcpHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { mcpHandler } = await import("./mcp.js");

      expect(mcpHandler.type).toBe("mcp");
      expect(typeof mcpHandler.install).toBe("function");
      expect(typeof mcpHandler.uninstall).toBe("function");
      expect(typeof mcpHandler.listInstalled).toBe("function");
      expect(typeof mcpHandler.plan).toBe("function");
    });
  });
});
