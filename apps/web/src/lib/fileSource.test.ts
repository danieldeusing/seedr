import { describe, expect, it } from "vitest";
import { resolveFileSource } from "./fileSource";

describe("resolveFileSource", () => {
  it("maps a GitHub tree URL to raw.githubusercontent.com and the blob page", () => {
    const source = resolveFileSource("https://github.com/obra/superpowers/tree/main/skills/brainstorming");
    expect(source?.host).toBe("raw.githubusercontent.com");
    expect(source?.rawUrl("SKILL.md")).toBe("https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md");
    expect(source?.pageUrl("docs/a b.md")).toBe("https://github.com/obra/superpowers/blob/main/skills/brainstorming/docs/a%20b.md");
  });

  it("defaults a bare repository URL to the main branch", () => {
    const source = resolveFileSource("https://github.com/owner/repo.git");
    expect(source?.rawUrl("README.md")).toBe("https://raw.githubusercontent.com/owner/repo/main/README.md");
  });

  it("serves first-party items from the dev server in development only", () => {
    const url = "https://github.com/danieldeusing/seedr/tree/main/registry/skills/pdf";
    expect(resolveFileSource(url, true)?.rawUrl("SKILL.md")).toBe("/registry/skills/pdf/SKILL.md");
    expect(resolveFileSource(url, true)?.host).toBe(window.location.host);
    expect(resolveFileSource(url, false)?.rawUrl("SKILL.md")).toBe(
      "https://raw.githubusercontent.com/danieldeusing/seedr/main/registry/skills/pdf/SKILL.md"
    );
  });

  it("keeps local:// sources on the same origin without a page link", () => {
    const source = resolveFileSource("local://dev-samples");
    expect(source?.rawUrl("sample.png")).toBe("/dev-samples/sample.png");
    expect(source?.pageUrl("sample.png")).toBeNull();
  });

  it("returns null for missing or non-GitHub URLs", () => {
    expect(resolveFileSource(undefined)).toBeNull();
    expect(resolveFileSource("https://gitlab.com/a/b")).toBeNull();
  });
});
