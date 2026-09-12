import { describe, expect, it } from "vitest";
import { resolveFileSource, type FileSourceItem } from "./fileSource";

const item = (overrides: Partial<FileSourceItem> = {}): FileSourceItem => ({
  type: "skill",
  slug: "brainstorming",
  ...overrides,
});

describe("resolveFileSource", () => {
  it("maps a GitHub tree URL to raw.githubusercontent.com and the blob page", () => {
    const source = resolveFileSource(item({ externalUrl: "https://github.com/obra/superpowers/tree/main/skills/brainstorming" }));
    expect(source?.host).toBe("raw.githubusercontent.com");
    expect(source?.rawUrl("SKILL.md")).toBe("https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md");
    expect(source?.pageUrl("docs/a b.md")).toBe("https://github.com/obra/superpowers/blob/main/skills/brainstorming/docs/a%20b.md");
  });

  it("defaults a bare repository URL to the main branch", () => {
    const source = resolveFileSource(item({ externalUrl: "https://github.com/owner/repo.git" }));
    expect(source?.rawUrl("README.md")).toBe("https://raw.githubusercontent.com/owner/repo/main/README.md");
  });

  it("serves a first-party item from this site's own /registry/, never from its externalUrl's repository", () => {
    // A first-party PLUGIN's externalUrl can be its own, possibly private, repository —
    // raw.githubusercontent.com would 404 that unauthenticated exactly like a missing
    // file, so sourceType alone decides this, regardless of what externalUrl names.
    const source = resolveFileSource(
      item({ type: "plugin", slug: "vu3-agent-kit", sourceType: "seedr", externalUrl: "https://github.com/danieldeusing/vu3-agent-kit" })
    );
    expect(source?.rawUrl("docs/layout.md")).toBe("/registry/plugins/vu3-agent-kit/docs/layout.md");
    expect(source?.host).toBe(window.location.host);
    // The repository still names a real page for the file, for a first-party item whose repo is public.
    expect(source?.pageUrl("SKILL.md")).toBe("https://github.com/danieldeusing/vu3-agent-kit/blob/main/SKILL.md");
  });

  it("keeps local:// sources on the same origin without a page link", () => {
    const source = resolveFileSource(item({ externalUrl: "local://dev-samples" }));
    expect(source?.rawUrl("sample.png")).toBe("/dev-samples/sample.png");
    expect(source?.pageUrl("sample.png")).toBeNull();
  });

  it("returns null for a non-first-party item with a missing or non-GitHub externalUrl", () => {
    expect(resolveFileSource(item({ externalUrl: undefined }))).toBeNull();
    expect(resolveFileSource(item({ externalUrl: "https://gitlab.com/a/b" }))).toBeNull();
  });
});
