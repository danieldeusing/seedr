import { describe, it, expect } from "vitest";
import type { RegistryItem } from "@seedr/shared";
import { parseGitHubRepo, resolveItemSource, getEffectiveSourceRevision, assertSafeRepoPath } from "./source.js";

const PDF_TREE_URL = "https://github.com/anthropics/skills/tree/main/skills/pdf";
const REPO_URL = "https://github.com/o/r";
const MARKETPLACE_PATH = "marketplace-path";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const RAW = "https://raw.githubusercontent.com";

function item(overrides: Partial<RegistryItem>): RegistryItem {
  return {
    slug: "pdf",
    name: "PDF",
    type: "skill",
    description: "d",
    compatibility: ["claude"],
    sourceType: "official",
    ...overrides,
  };
}

describe("parseGitHubRepo", () => {
  it.each([
    ["https://github.com/anthropics/skills", { owner: "anthropics", repo: "skills", rest: "" }],
    ["https://github.com/anthropics/skills.git", { owner: "anthropics", repo: "skills", rest: "" }],
    [PDF_TREE_URL, { owner: "anthropics", repo: "skills", rest: "tree/main/skills/pdf" }],
    ["https://github.com/o/r.github.io/tree/main", { owner: "o", repo: "r.github.io", rest: "tree/main" }],
  ])("parses %s", (url, expected) => {
    expect(parseGitHubRepo(url)).toEqual(expected);
  });

  it.each([
    "https://gitlab.com/o/r",
    "http://github.com/o/r",
    "https://github.com/o",
    "https://github.com/../r",
    "https://github.com/o/..",
    "https://github.com/.o/r",
    "https://evil.com/github.com/o/r",
    "https://github.com.evil.com/o/r",
    "git@github.com:o/r.git",
    "",
  ])("rejects %s", (url) => {
    expect(parseGitHubRepo(url)).toBeNull();
  });
});

describe("assertSafeRepoPath", () => {
  it("normalises leading ./ and slashes", () => {
    expect(assertSafeRepoPath("./skills/pdf/", "p")).toBe("skills/pdf");
    expect(assertSafeRepoPath("", "p")).toBe("");
  });

  it.each(["a/../b", "../x", "a//b", "a\\b", "."])("rejects %s", (path) => {
    expect(() => assertSafeRepoPath(path, "plugin path")).toThrow(/Unsafe plugin path/);
  });
});

describe("resolveItemSource", () => {
  it("pins a GitHub tree externalUrl to sourceRevision", () => {
    const source = resolveItemSource(
      item({ externalUrl: PDF_TREE_URL, sourceRevision: SHA })
    );
    expect(source).toEqual({
      baseUrl: `${RAW}/anthropics/skills/${SHA}/skills/pdf`,
      rootUrl: `${RAW}/anthropics/skills/${SHA}`,
      revision: SHA,
    });
  });

  it("pins a bare repository externalUrl to the repository root", () => {
    const source = resolveItemSource(item({ externalUrl: "https://github.com/pbakaus/agent-reviews", sourceRevision: SHA }));
    expect(source.baseUrl).toBe(`${RAW}/pbakaus/agent-reviews/${SHA}`);
    expect(source.revision).toBe(SHA);
  });

  it("keeps the branch for legacy items without any revision field", () => {
    const source = resolveItemSource(item({ externalUrl: PDF_TREE_URL }));
    expect(source).toEqual({
      baseUrl: `${RAW}/anthropics/skills/main/skills/pdf`,
      rootUrl: `${RAW}/anthropics/skills/main`,
      revision: null,
    });
  });

  it("uses 'main' for a legacy bare repository URL", () => {
    expect(resolveItemSource(item({ externalUrl: REPO_URL })).baseUrl).toBe(`${RAW}/o/r/main`);
  });

  it("fails closed for non-GitHub hosts", () => {
    expect(() => resolveItemSource(item({ externalUrl: "https://gitlab.com/o/r/-/tree/main/x", sourceRevision: SHA }))).toThrow(
      /unsupported source host/
    );
    expect(() => resolveItemSource(item({ externalUrl: "https://gitlab.com/o/r" }))).toThrow(/unsupported source host/);
  });

  it("fails closed for GitHub URLs that are not tree URLs", () => {
    expect(() => resolveItemSource(item({ externalUrl: "https://github.com/o/r/blob/main/x", sourceRevision: SHA }))).toThrow(
      /unsupported source URL/
    );
  });

  it("rejects malformed revisions and traversal in paths", () => {
    expect(() => resolveItemSource(item({ externalUrl: "https://github.com/o/r/tree/main/x", sourceRevision: "main" }))).toThrow(
      /Invalid sourceRevision/
    );
    expect(() => resolveItemSource(item({ externalUrl: "https://github.com/o/r/tree/main/x", sourceRevision: "A".repeat(40) }))).toThrow(
      /Invalid sourceRevision/
    );
    expect(() => resolveItemSource(item({ externalUrl: "https://github.com/o/r/tree/main/../x", sourceRevision: SHA }))).toThrow(
      /Unsafe externalUrl path/
    );
  });

  it("requires an externalUrl", () => {
    expect(() => resolveItemSource(item({ externalUrl: undefined }))).toThrow(/has no externalUrl/);
  });

  describe("pluginSource", () => {
    it("github/url kinds resolve to the repository root at sha", () => {
      for (const kind of ["github", "url"] as const) {
        const source = resolveItemSource(
          item({ type: "plugin", pluginSource: { kind, url: "https://github.com/o/r.git", sha: SHA } })
        );
        expect(source.baseUrl).toBe(`${RAW}/o/r/${SHA}`);
        expect(source.rootUrl).toBe(`${RAW}/o/r/${SHA}`);
        expect(source.revision).toBe(SHA);
      }
    });

    it("git-subdir resolves to the path at sha", () => {
      const source = resolveItemSource(
        item({ type: "plugin", pluginSource: { kind: "git-subdir", url: REPO_URL, path: "./plugins/x", sha: SHA } })
      );
      expect(source.baseUrl).toBe(`${RAW}/o/r/${SHA}/plugins/x`);
      expect(source.rootUrl).toBe(`${RAW}/o/r/${SHA}`);
    });

    it("marketplace-path resolves through marketplaceRef at the marketplace sha", () => {
      const source = resolveItemSource(
        item({
          type: "plugin",
          pluginSource: { kind: MARKETPLACE_PATH, path: "plugins/feature-dev", sha: OTHER_SHA },
          marketplaceRef: { name: "official", url: "https://github.com/anthropics/claude-plugins-official", sha: SHA },
        })
      );
      expect(source.baseUrl).toBe(`${RAW}/anthropics/claude-plugins-official/${SHA}/plugins/feature-dev`);
      expect(source.revision).toBe(SHA);
    });

    it("marketplace-path falls back to pluginSource.sha when marketplaceRef.sha is empty", () => {
      const source = resolveItemSource(
        item({
          type: "plugin",
          pluginSource: { kind: MARKETPLACE_PATH, path: "x", sha: SHA },
          marketplaceRef: { name: "m", url: REPO_URL, sha: "" },
        })
      );
      expect(source.revision).toBe(SHA);
    });

    it("fails closed when the marketplace is missing or on another host", () => {
      expect(() =>
        resolveItemSource(item({ type: "plugin", pluginSource: { kind: MARKETPLACE_PATH, path: "x", sha: SHA } }))
      ).toThrow(/no marketplaceRef/);
      expect(() =>
        resolveItemSource(
          item({
            type: "plugin",
            pluginSource: { kind: MARKETPLACE_PATH, path: "x", sha: SHA },
            marketplaceRef: { name: "m", url: "https://bitbucket.org/o/r", sha: SHA },
          })
        )
      ).toThrow(/unsupported source host/);
      expect(() =>
        resolveItemSource(item({ type: "plugin", pluginSource: { kind: "github", url: "https://codeberg.org/o/r", sha: SHA } }))
      ).toThrow(/unsupported source host/);
      expect(() => resolveItemSource(item({ type: "plugin", pluginSource: { kind: "github", sha: SHA } }))).toThrow(/has no url/);
      expect(() =>
        resolveItemSource(item({ type: "plugin", pluginSource: { kind: "github", url: REPO_URL, sha: "short" } }))
      ).toThrow(/Invalid pluginSource.sha/);
    });
  });

  it("getEffectiveSourceRevision prefers pluginSource.sha", () => {
    expect(getEffectiveSourceRevision(item({ sourceRevision: SHA }))).toBe(SHA);
    expect(
      getEffectiveSourceRevision(item({ sourceRevision: SHA, pluginSource: { kind: "github", url: "u", sha: OTHER_SHA } }))
    ).toBe(OTHER_SHA);
    expect(getEffectiveSourceRevision(item({}))).toBeUndefined();
  });
});
