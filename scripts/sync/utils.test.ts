import { describe, expect, it } from "vitest";
import type { GitTreeItem } from "./types.js";
import {
  buildFileTree,
  computeLegacyContentHash,
  listDirectoryFromTree,
  listTreeFiles,
  mapConcurrent,
  parseFrontmatter,
  parseGitHubRepoUrl,
  parseGitHubTreeUrl,
  parsePluginContents,
  treeHasDirectory,
} from "./utils.js";

const tree: GitTreeItem[] = [
  { path: "plugins", mode: "040000", type: "tree", sha: "1" },
  { path: "plugins/x", mode: "040000", type: "tree", sha: "2" },
  { path: "plugins/x/README.md", mode: "100644", type: "blob", sha: "r", size: 3 },
  { path: "plugins/x/bin/run", mode: "100755", type: "blob", sha: "b", size: 5 },
  { path: "plugins/x/link", mode: "120000", type: "blob", sha: "l", size: 7 },
  { path: "plugins/x/vendor", mode: "160000", type: "commit", sha: "s" },
  { path: "plugins/x/.git/HEAD", mode: "100644", type: "blob", sha: "g", size: 1 },
  { path: "plugins/xy", mode: "040000", type: "tree", sha: "3" },
  { path: "plugins/xy/SKILL.md", mode: "100644", type: "blob", sha: "k", size: 2 },
  { path: "LICENSE", mode: "100644", type: "blob", sha: "L", size: 9 },
];

describe("listTreeFiles", () => {
  it("returns regular files under the prefix at full depth and reports symlinks/submodules", () => {
    const { files, skipped } = listTreeFiles(tree, "plugins/x");
    expect(files).toEqual([
      { path: "README.md", blobSha: "r", size: 3 },
      { path: "bin/run", blobSha: "b", size: 5 },
    ]);
    expect(skipped).toEqual(["link (mode 120000)", "vendor (mode 160000)"]);
  });

  it("does not confuse a sibling directory sharing the prefix, and handles the root", () => {
    expect(listTreeFiles(tree, "plugins/x").files.some((f) => f.path.includes("SKILL"))).toBe(false);
    expect(listTreeFiles(tree, "").files.map((f) => f.path)).toEqual(["plugins/x/README.md", "plugins/x/bin/run", "plugins/xy/SKILL.md", "LICENSE"]);
  });

  it("knows which directories exist", () => {
    expect(treeHasDirectory(tree, "plugins/x")).toBe(true);
    expect(treeHasDirectory(tree, "plugins/x/")).toBe(true);
    expect(treeHasDirectory(tree, "plugins/z")).toBe(false);
    expect(treeHasDirectory(tree, "")).toBe(true);
    expect(listDirectoryFromTree(tree, "plugins")).toEqual(["x", "xy"]);
  });
});

describe("buildFileTree", () => {
  it("nests paths, directories first, sorted by name, at full depth", () => {
    expect(buildFileTree(["z.md", "a/b/c.md", "a/d.md", "B.md", "a/b/a.md"])).toEqual([
      {
        name: "a",
        type: "directory",
        children: [
          { name: "b", type: "directory", children: [{ name: "a.md", type: "file" }, { name: "c.md", type: "file" }] },
          { name: "d.md", type: "file" },
        ],
      },
      { name: "B.md", type: "file" },
      { name: "z.md", type: "file" },
    ]);
  });

  it("computes the legacy hash over path:blobSha pairs regardless of order", () => {
    const a = computeLegacyContentHash([{ path: "b", blobSha: "2", size: 0 }, { path: "a", blobSha: "1", size: 0 }]);
    const b = computeLegacyContentHash([{ path: "a", blobSha: "1", size: 0 }, { path: "b", blobSha: "2", size: 0 }]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(computeLegacyContentHash([])).toBeNull();
  });
});

describe("parseFrontmatter", () => {
  it("reads plain, quoted and block-scalar values", () => {
    const md = `---
name: pdf
description: "Read, create and edit PDFs"
license: 'MIT'
summary: |
  First line
  second line
folded: >-
  one
  two
---
# Body
description: not frontmatter
`;
    expect(parseFrontmatter(md)).toEqual({
      name: "pdf",
      description: "Read, create and edit PDFs",
      license: "MIT",
      summary: "First line\nsecond line",
      folded: "one two",
    });
  });

  it("folds plain scalars that continue on indented lines (vercel-labs style)", () => {
    const md = `---
name: vercel-composition-patterns
description:
  React composition patterns that scale. Use when refactoring components with
  boolean prop proliferation.
license: MIT
metadata:
  author: vercel
tags: one
  two
---
`;
    const fields = parseFrontmatter(md)!;
    expect(fields.description).toBe("React composition patterns that scale. Use when refactoring components with boolean prop proliferation.");
    expect(fields.license).toBe("MIT");
    expect(fields.tags).toBe("one two");
    expect(fields.name).toBe("vercel-composition-patterns");
  });

  it("returns null without a frontmatter block and tolerates CRLF", () => {
    expect(parseFrontmatter("# Just a heading\n")).toBeNull();
    expect(parseFrontmatter("---\r\nname: x\r\n---\r\nbody")).toEqual({ name: "x" });
  });
});

describe("GitHub URL parsing", () => {
  it.each([
    ["https://github.com/obra/superpowers.git", "obra/superpowers"],
    ["https://github.com/obra/superpowers", "obra/superpowers"],
    ["https://github.com/obra/superpowers/", "obra/superpowers"],
    ["https://github.com/obra/superpowers/tree/main/x", "obra/superpowers"],
    ["http://www.github.com/obra/superpowers", "obra/superpowers"],
    ["git@github.com:obra/superpowers.git", "obra/superpowers"],
  ])("parses %s", (url, repo) => {
    expect(parseGitHubRepoUrl(url)).toEqual({ repo, cloneUrl: `https://github.com/${repo}.git` });
  });

  it("rejects non-GitHub URLs", () => {
    expect(parseGitHubRepoUrl("https://gitlab.com/a/b")).toBeNull();
    expect(parseGitHubRepoUrl("https://github.com/only-owner")).toBeNull();
  });

  it("splits tree URLs into repo, ref and path", () => {
    expect(parseGitHubTreeUrl("https://github.com/anthropics/skills/tree/main/skills/pdf")).toEqual({ repo: "anthropics/skills", ref: "main", path: "skills/pdf" });
    expect(parseGitHubTreeUrl("https://github.com/obra/superpowers/tree/main")).toEqual({ repo: "obra/superpowers", ref: "main", path: "" });
    expect(parseGitHubTreeUrl("https://github.com/pbakaus/agent-reviews")).toEqual({ repo: "pbakaus/agent-reviews", ref: null, path: "" });
    expect(parseGitHubTreeUrl(`https://github.com/a/b/tree/${"f".repeat(40)}/providers/claude/plugin/`)).toEqual({ repo: "a/b", ref: "f".repeat(40), path: "providers/claude/plugin" });
  });
});

describe("mapConcurrent", () => {
  it("preserves order, bounds concurrency and propagates errors", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapConcurrent([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
    await expect(mapConcurrent([1], 1, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await mapConcurrent([], 4, async () => 1)).toEqual([]);
  });
});

describe("parsePluginContents", () => {
  it("detects content kinds from the tree shape", () => {
    const files = buildFileTree(["skills/a/SKILL.md", "skills/b/SKILL.md", "commands/x.md", "hooks/hooks.json", ".mcp.json", ".claude/agents/r.md"]);
    const parsed = parsePluginContents(files);
    expect(parsed.skills).toEqual(["a", "b"]);
    expect(parsed.commands).toEqual(["x"]);
    expect(parsed.hooks).toEqual(["hooks.json"]);
    expect(parsed.mcpServers).toEqual([".mcp.json"]);
    expect(parsed.agents).toEqual(["r"]);
  });
});
