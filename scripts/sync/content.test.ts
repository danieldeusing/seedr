import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeGitHub, SHA_A } from "../test/fake-github.js";
import { classifyPlugin, collectContent, declaredMcpServerNames, declaredSkillNames, withDeclaredLicense, type CollectedContent } from "./content.js";
import { computeContentDigest } from "./digest.js";
import { GitHubClient } from "./github.js";
import { buildFileTree } from "./utils.js";

function content(files: Record<string, string>): CollectedContent {
  const entries = Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text), blobSha: path }));
  return { files: buildFileTree(Object.keys(files)), entries, contentDigest: null, contentHash: null, license: { note: "n" }, skipped: [] };
}

describe("classifyPlugin", () => {
  it("reads MCP server names from a root .mcp.json", () => {
    const c = content({ ".mcp.json": JSON.stringify({ mcpServers: { a: {}, b: {} } }), "skills/x/SKILL.md": "" });
    expect(classifyPlugin(c, { pluginJson: null, existing: null })).toEqual({ pluginType: "package", package: { skill: 1, mcp: 2 } });
  });

  it("counts the skills a plugin.json names by path, which live outside skills/<name>/", () => {
    const c = content({ "skills/engineering/tdd/SKILL.md": "", "skills/productivity/grill-me/SKILL.md": "", ".mcp.json": JSON.stringify({ mcpServers: { a: {} } }) });
    expect(classifyPlugin(c, { pluginJson: null, existing: null })).toEqual({ pluginType: "wrapper", wrapper: "mcp" });
    expect(classifyPlugin(c, { pluginJson: { skills: ["./skills/engineering/tdd", "./skills/productivity/grill-me/"] }, existing: null })).toEqual({
      pluginType: "package",
      package: { skill: 2, mcp: 1 },
    });
    // A path may name a directory of skills instead, as impeccable's "./skills/" does;
    // either way a path that ships nothing counts nothing.
    expect(declaredSkillNames("./skills/engineering", c.files)).toEqual(["tdd"]);
    expect(declaredSkillNames(["./skills/", "./skills/engineering/tdd", "./missing"], c.files)).toEqual(["tdd"]);
    expect(declaredSkillNames(undefined, c.files)).toEqual([]);
  });

  it("follows a plugin.json mcpServers path, a list of paths, or an inline map", () => {
    const c = content({
      ".claude-plugin/plugin.json": "{}",
      "config/claude/.mcp.json": JSON.stringify({ mcpServers: { supabase: {} } }),
      "other.json": JSON.stringify({ x: {}, y: {} }),
    });
    expect(declaredMcpServerNames(c, "./config/claude/.mcp.json")).toEqual(["supabase"]);
    expect(declaredMcpServerNames(c, ["./config/claude/.mcp.json", "other.json", "missing.json"])).toEqual(["supabase", "x", "y"]);
    expect(declaredMcpServerNames(c, { inline: {} })).toEqual(["inline"]);
    expect(declaredMcpServerNames(c, 42)).toEqual([]);
    expect(classifyPlugin(c, { pluginJson: { mcpServers: "./config/claude/.mcp.json" }, existing: null })).toEqual({ pluginType: "wrapper", wrapper: "mcp" });
  });

  it("counts hook triggers from hooks.json and prefers inline lspServers as an integration", () => {
    const c = content({ "hooks/hooks.json": JSON.stringify({ hooks: { PreToolUse: [], Stop: [] } }), "commands/a.md": "" });
    expect(classifyPlugin(c, { pluginJson: null, existing: null })).toEqual({ pluginType: "package", package: { hook: 2, command: 1 } });
    expect(classifyPlugin(c, { pluginJson: null, lspServers: { x: { command: "x" } }, existing: null })).toEqual({ pluginType: "integration", integration: "lsp" });
    expect(classifyPlugin(c, { pluginJson: null, existing: { pluginType: "integration", integration: "custom" } as never })).toEqual({ pluginType: "integration", integration: "custom" });
  });

  it("uses inline marketplace skills when the tree has no skills folder", () => {
    const c = content({ "README.md": "" });
    expect(classifyPlugin(c, { pluginJson: null, inlineSkills: ["./a", "./b"], existing: null })).toEqual({ pluginType: "wrapper", wrapper: "skill" });
    expect(classifyPlugin(c, { pluginJson: null, existing: null })).toEqual({ pluginType: "package", package: {} });
  });
});

describe("withDeclaredLicense", () => {
  it("adds the plugin.json license only when no license text was found", () => {
    expect(withDeclaredLicense({ note: "No license text found upstream." }, "MIT")).toEqual({ spdx: "MIT", note: 'No license text found upstream. plugin.json declares "MIT".' });
    expect(withDeclaredLicense({ spdx: "Apache-2.0", file: "LICENSE" }, "MIT")).toEqual({ spdx: "Apache-2.0", file: "LICENSE" });
    expect(withDeclaredLicense({ note: "n" }, "")).toEqual({ note: "n" });
    expect(withDeclaredLicense({ note: "n" }, { type: "MIT" })).toEqual({ note: "n" });
  });
});

describe("collectContent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prefers the item's own license, otherwise adds the root license to the digest once, and refuses missing directories", async () => {
    const fake = new FakeGitHub({
      "o/r": {
        branches: { main: SHA_A },
        commits: { [SHA_A]: { files: { LICENSE: "MIT License\n", "own/SKILL.md": "hello\n", "own/LICENSE": "MIT License\n", "bare/SKILL.md": "hello\n" } } },
      },
    });
    vi.stubGlobal("fetch", fake.fetch);
    const client = new GitHubClient({ env: {}, log: () => {} });
    const tree = await client.getTree("o/r", SHA_A);
    const expectedDigest = computeContentDigest([{ path: "SKILL.md", bytes: Buffer.from("hello\n") }, { path: "LICENSE", bytes: Buffer.from("MIT License\n") }]);

    const own = await collectContent(client, { repo: "o/r", sha: SHA_A, path: "own" }, tree);
    expect(own.license).toEqual({ spdx: "MIT", file: "own/LICENSE" });
    expect(own.contentDigest).toBe(expectedDigest);
    expect(own.files.map((f) => f.name)).toEqual(["LICENSE", "SKILL.md"]);

    const bare = await collectContent(client, { repo: "o/r", sha: SHA_A, path: "bare" }, tree);
    expect(bare.license).toEqual({ spdx: "MIT", file: "LICENSE", installAs: "LICENSE" });
    expect(bare.contentDigest).toBe(expectedDigest);
    expect(bare.files.map((f) => f.name)).toEqual(["SKILL.md"]);

    await expect(collectContent(client, { repo: "o/r", sha: SHA_A, path: "nope" }, tree)).rejects.toThrow(/directory "nope" does not exist/);
  });
});
