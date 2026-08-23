import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeGitHub, SHA_A, SHA_B, SHA_C } from "../test/fake-github.js";
import { GitHubClient } from "./github.js";
import { applyRenames, describeSource, normalizeRelativePath, parseMarketplace, pinSource, toPluginSource, type MarketplaceEntry } from "./marketplace.js";

const MK_REPO = "anthropics/claude-plugins-official";

describe("parseMarketplace", () => {
  it("accepts the official shape and normalises entries", () => {
    const parsed = parseMarketplace(
      {
        $schema: "x",
        name: "claude-plugins-official",
        owner: { name: "Anthropic" },
        renames: { adlc: "agentforce-adlc" },
        plugins: [
          { name: "a", description: "A", source: "./plugins/a", author: { name: "Anthropic", email: "s@a.com" }, category: "dev", strict: false, lspServers: { x: { command: "x" } }, version: "1.0.0" },
          { name: "b", source: { source: "url", url: "https://github.com/o/r.git", sha: SHA_A }, skills: ["./s"] },
        ],
      },
      "test",
    );
    expect(parsed.name).toBe("claude-plugins-official");
    expect(parsed.renames).toEqual({ adlc: "agentforce-adlc" });
    expect(parsed.plugins[0]).toEqual({
      name: "a",
      description: "A",
      version: "1.0.0",
      author: { name: "Anthropic", email: "s@a.com" },
      source: "./plugins/a",
      strict: false,
      lspServers: { x: { command: "x" } },
      category: "dev",
    });
    expect(parsed.plugins[1]).toEqual({ name: "b", source: { source: "url", url: "https://github.com/o/r.git", sha: SHA_A }, skills: ["./s"] });
  });

  it.each([
    ["not an object", "nope"],
    ["missing name", { plugins: [] }],
    ["missing plugins", { name: "m" }],
    ["entry without name", { name: "m", plugins: [{ source: "./x" }] }],
    ["entry without source", { name: "m", plugins: [{ name: "x" }] }],
    ["duplicate entry", { name: "m", plugins: [{ name: "x", source: "./x" }, { name: "x", source: "./y" }] }],
    ["bad renames", { name: "m", plugins: [], renames: { a: 1 } }],
  ])("rejects %s", (_label, json) => {
    expect(() => parseMarketplace(json, "test")).toThrow(/test:/);
  });

  it("treats an explicit empty plugin list as valid", () => {
    expect(parseMarketplace({ name: "m", plugins: [] }, "test").plugins).toEqual([]);
  });
});

describe("applyRenames", () => {
  it("follows chains and stops on cycles", () => {
    expect(applyRenames("a", { a: "b", b: "c" })).toBe("c");
    expect(applyRenames("x", { a: "b" })).toBe("x");
    expect(applyRenames("a", { a: "b", b: "a" })).toBe("a");
  });
});

describe("describeSource", () => {
  const entry = (source: MarketplaceEntry["source"]): MarketplaceEntry => ({ name: "p", source });

  it("maps local paths to marketplace-path, and the root to url", () => {
    expect(describeSource(entry("./plugins/x"), MK_REPO, SHA_A)).toEqual({ kind: "marketplace-path", repo: MK_REPO, path: "plugins/x", sha: SHA_A });
    expect(describeSource(entry("./external_plugins/x/"), MK_REPO, SHA_A)).toEqual({ kind: "marketplace-path", repo: MK_REPO, path: "external_plugins/x", sha: SHA_A });
    expect(describeSource(entry("./"), "o/r", SHA_B)).toEqual({ kind: "url", repo: "o/r", path: "", url: "https://github.com/o/r.git", sha: SHA_B });
    expect(() => describeSource(entry("../x"), MK_REPO, SHA_A)).toThrow(/escapes/);
  });

  it("maps url, git-subdir and github objects", () => {
    expect(describeSource(entry({ source: "url", url: "https://github.com/slackapi/slack-mcp-plugin.git", sha: SHA_A }), MK_REPO, SHA_B)).toEqual({
      kind: "url", repo: "slackapi/slack-mcp-plugin", path: "", url: "https://github.com/slackapi/slack-mcp-plugin.git", ref: undefined, sha: SHA_A,
    });
    expect(describeSource(entry({ source: "git-subdir", url: "https://github.com/stripe/ai.git", path: "providers/claude/plugin", ref: "main", sha: SHA_A }), MK_REPO, SHA_B)).toEqual({
      kind: "git-subdir", repo: "stripe/ai", path: "providers/claude/plugin", url: "https://github.com/stripe/ai.git", ref: "main", sha: SHA_A,
    });
    expect(describeSource(entry({ source: "github", repo: "o/r", ref: "v1" }), MK_REPO, SHA_B)).toEqual({
      kind: "github", repo: "o/r", path: "", url: "https://github.com/o/r.git", ref: "v1", sha: undefined,
    });
  });

  it.each([
    ["non-GitHub url", { source: "url", url: "https://gitlab.com/a/b.git" }],
    ["missing url", { source: "url" }],
    ["git-subdir without path", { source: "git-subdir", url: "https://github.com/a/b.git" }],
    ["git-subdir with root path", { source: "git-subdir", url: "https://github.com/a/b.git", path: "./" }],
    ["git-subdir escaping", { source: "git-subdir", url: "https://github.com/a/b.git", path: "../x" }],
    ["github without repo", { source: "github" }],
    ["malformed sha", { source: "url", url: "https://github.com/a/b.git", sha: "abc" }],
    ["unknown kind", { source: "tarball", url: "https://github.com/a/b.git" }],
  ])("rejects %s", (_label, source) => {
    expect(() => describeSource(entry(source as Record<string, unknown>), MK_REPO, SHA_A)).toThrow(/plugin "p"/);
  });

  it("normalises relative paths", () => {
    expect(normalizeRelativePath("././a/b/")).toBe("a/b");
    expect(normalizeRelativePath("/a")).toBe("a");
    expect(normalizeRelativePath("./")).toBe("");
  });
});

describe("pinSource / toPluginSource", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a declared sha, resolves a ref, and falls back to the default branch", async () => {
    const fake = new FakeGitHub({
      "o/r": { defaultBranch: "trunk", branches: { trunk: SHA_B, v1: SHA_C }, commits: { [SHA_B]: { files: {} }, [SHA_C]: { files: {} } } },
    });
    vi.stubGlobal("fetch", fake.fetch);
    const client = new GitHubClient({ env: {}, log: () => {} });

    const declared = await pinSource({ kind: "url", repo: "o/r", path: "", url: "https://github.com/o/r.git", sha: SHA_A }, client);
    expect(declared.sha).toBe(SHA_A);
    expect(fake.requests).toEqual([]);

    const byRef = await pinSource({ kind: "github", repo: "o/r", path: "", url: "https://github.com/o/r.git", ref: "v1" }, client);
    expect(byRef.sha).toBe(SHA_C);

    const byDefault = await pinSource({ kind: "url", repo: "o/r", path: "", url: "https://github.com/o/r.git" }, client);
    expect(byDefault.sha).toBe(SHA_B);
    expect(toPluginSource(byDefault)).toEqual({ kind: "url", url: "https://github.com/o/r.git", sha: SHA_B });
    expect(toPluginSource({ kind: "git-subdir", repo: "o/r", path: "p/q", url: "https://github.com/o/r.git", ref: "main", sha: SHA_A })).toEqual({
      kind: "git-subdir", path: "p/q", url: "https://github.com/o/r.git", ref: "main", sha: SHA_A,
    });
    expect(toPluginSource({ kind: "marketplace-path", repo: MK_REPO, path: "plugins/x", sha: SHA_A })).toEqual({ kind: "marketplace-path", path: "plugins/x", sha: SHA_A });
  });
});
