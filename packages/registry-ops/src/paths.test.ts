import { describe, expect, test } from "vitest";
import { itemDir, itemJsonPath, typeManifestPath } from "./fsPaths.js";
import { ALL_TYPES, isComponentType, isValidSlug, itemKey, typeDirName } from "./paths.js";

describe("typeDirName", () => {
  test("pluralises every type except mcp and settings", () => {
    expect(ALL_TYPES.map(typeDirName)).toEqual(["skills", "plugins", "hooks", "agents", "mcp", "settings", "commands"]);
  });
});

describe("slugs", () => {
  test("accepts lowercase path segments", () => {
    for (const slug of ["pdf", "last30days", "c-sharp_lsp", "a.b"]) expect(isValidSlug(slug)).toBe(true);
  });

  test("rejects separators, traversal, case and leading dots", () => {
    for (const slug of ["", "../x", "a/b", "a\\b", ".hidden", "Pdf", "with space", 42, null]) expect(isValidSlug(slug)).toBe(false);
  });

  test("path helpers refuse an invalid slug instead of building a path", () => {
    expect(() => itemDir("/r", "skill", "../escape")).toThrow(/Invalid slug/);
    expect(() => itemJsonPath("/r", "skill", "a/b")).toThrow(/Invalid slug/);
  });
});

describe("paths", () => {
  test("derive every location from the registry dir", () => {
    expect(itemJsonPath("/r", "mcp", "playwright").split(/[\\/]/).slice(-3)).toEqual(["mcp", "playwright", "item.json"]);
    expect(typeManifestPath("/r", "settings").split(/[\\/]/).slice(-2)).toEqual(["settings", "manifest.json"]);
    expect(itemKey("skill", "pdf")).toBe("skill/pdf");
  });

  test("isComponentType knows exactly the seven types", () => {
    expect(ALL_TYPES.every(isComponentType)).toBe(true);
    expect(isComponentType("mcps")).toBe(false);
  });
});
