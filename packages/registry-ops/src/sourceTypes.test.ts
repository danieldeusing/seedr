import { describe, expect, test } from "vitest";
import { canonicalSourceType, isFirstParty, isLegacySourceType, storageSourceType } from "./sourceTypes.js";
import { validateItem } from "./validate.js";
import { seedrSkill } from "./test/fixtures.js";

describe("source-type vocabulary", () => {
  test("canonicalSourceType resolves the alias, keeps canonical values, refuses the rest", () => {
    expect(canonicalSourceType("toolr")).toBe("seedr");
    expect(canonicalSourceType("seedr")).toBe("seedr");
    expect(canonicalSourceType("community")).toBe("community");
    expect(canonicalSourceType("vendor")).toBeNull();
    expect(canonicalSourceType(42)).toBeNull();
  });

  test("storageSourceType writes the canonical value now that the downgrade table is empty", () => {
    expect(storageSourceType("seedr")).toBe("seedr");
    expect(storageSourceType("community")).toBe("community");
    expect(storageSourceType("official")).toBe("official");
  });

  test("isFirstParty holds under either spelling and nowhere else", () => {
    expect(isFirstParty("seedr")).toBe(true);
    expect(isFirstParty("toolr")).toBe(true);
    expect(isFirstParty("community")).toBe(false);
    expect(isFirstParty(undefined)).toBe(false);
  });

  test("Object.prototype keys are not source types", () => {
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(isLegacySourceType(key)).toBe(false);
      expect(canonicalSourceType(key)).toBeNull();
    }
  });

  test("the validator accepts both spellings and refuses anything else", () => {
    expect(validateItem({ ...seedrSkill, sourceType: "seedr" })).toEqual([]);
    expect(validateItem({ ...seedrSkill, sourceType: "toolr" })).toEqual([]);
    expect(validateItem({ ...seedrSkill, sourceType: "vendor" })).toContainEqual({
      field: "sourceType",
      message: 'unknown sourceType "vendor"',
    });
  });
});
