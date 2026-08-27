import { describe, expect, test } from "vitest";
import { LONG, seedrSkill } from "./test/fixtures.js";
import { MIN_LONG_DESCRIPTION_WORDS, assertStructurallyValid, gateErrors, longDescriptionProblems, structuralErrors, validateItem } from "./validate.js";

const fields = (errors: ReturnType<typeof validateItem>) => errors.map((e) => e.field);

describe("validateItem", () => {
  test("a complete item has no errors", () => {
    expect(validateItem(seedrSkill)).toEqual([]);
  });

  test("rejects non-objects outright", () => {
    expect(validateItem(null)[0]?.message).toMatch(/JSON object/);
    expect(validateItem([])[0]?.message).toMatch(/JSON object/);
  });

  test("reports structural problems field by field", () => {
    const errors = validateItem({
      ...seedrSkill,
      slug: "Bad Slug",
      type: "mcps",
      sourceType: "vendor",
      name: " ",
      description: "",
      compatibility: ["claude", "bard"],
      author: { name: "" },
      externalUrl: "ftp://x",
      targetScope: "global",
      pluginType: "bundle",
      surprise: true,
    });
    expect(fields(errors)).toEqual(
      expect.arrayContaining(["surprise", "slug", "type", "sourceType", "name", "description", "compatibility", "author", "externalUrl", "targetScope", "pluginType"])
    );
    expect(errors.every((e) => !e.gate)).toBe(true);
  });

  test("an empty compatibility list is a structural error", () => {
    expect(fields(validateItem({ ...seedrSkill, compatibility: [] }))).toEqual(["compatibility"]);
  });

  test("checks the item against the directory it lives in", () => {
    const errors = validateItem(seedrSkill, { expectedType: "plugin", expectedSlug: "other" });
    expect(errors.map((e) => e.message)).toEqual([
      'is "alpha" but the directory is "other"',
      'is "skill" but the directory is for "plugins/" (plugin)',
    ]);
  });

  test("the description gate is reported separately from structure", () => {
    const errors = validateItem({ ...seedrSkill, longDescription: "too short" });
    expect(structuralErrors(errors)).toEqual([]);
    expect(gateErrors(errors)).toEqual([{ field: "longDescription", message: "longDescription too short (2 words, minimum 30)", gate: true }]);
  });

  test("assertStructurallyValid ignores gate errors and throws on structure", () => {
    expect(() => assertStructurallyValid({ ...seedrSkill, longDescription: undefined })).not.toThrow();
    expect(() => assertStructurallyValid({ ...seedrSkill, type: "nope" })).toThrow(/type: unknown type "nope"/);
  });
});

describe("longDescriptionProblems", () => {
  test("requires presence, 30 words and a backtick — the commit gate's rule", () => {
    expect(longDescriptionProblems(undefined)).toEqual(["is missing 'longDescription'"]);
    expect(longDescriptionProblems("   ")).toEqual(["is missing 'longDescription'"]);
    expect(longDescriptionProblems("only `five` words right here")).toEqual(["longDescription too short (5 words, minimum 30)"]);
    expect(longDescriptionProblems("word ".repeat(MIN_LONG_DESCRIPTION_WORDS))).toEqual([
      "longDescription has no markdown formatting (use backticks for file names, commands, code identifiers)",
    ]);
    expect(longDescriptionProblems(LONG)).toEqual([]);
  });

  test("counts words on any whitespace, like the bash gate did", () => {
    const exactly30 = Array.from({ length: MIN_LONG_DESCRIPTION_WORDS }, (_, i) => (i === 0 ? "`w`" : "w")).join("  \n ");
    expect(longDescriptionProblems(exactly30)).toEqual([]);
  });
});

describe("externalUrl", () => {
  const withUrl = (externalUrl: unknown) => validateItem({ ...seedrSkill, externalUrl });

  test("takes local://<path>, which is how a private instance serves its own registry", () => {
    // Its repository is private, so a raw GitHub URL 404s on every preview; the
    // web app resolves this scheme against its own origin instead.
    expect(withUrl("local://registry/skills/pdf")).toEqual([]);
    expect(withUrl("https://github.com/danieldeusing/seedr/tree/main/registry/skills/pdf")).toEqual([]);
  });

  test("refuses a local path that could climb out of the site", () => {
    // It becomes a URL path, so it is held to the same rule as any path here.
    for (const bad of ["local://../secrets", "local:///etc", "local://", "local://a/../../b", "ftp://x", "not a url"]) {
      expect(withUrl(bad)).toContainEqual(expect.objectContaining({ field: "externalUrl" }));
    }
  });
});
