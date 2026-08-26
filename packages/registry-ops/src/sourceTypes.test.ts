import { describe, expect, test } from "vitest";
import { canonicalSourceType, isFirstParty } from "./sourceTypes.js";
import { validateItem } from "./validate.js";
import { seedrSkill } from "./test/fixtures.js";

describe("source-type vocabulary", () => {
  test("canonicalSourceType keeps the three values and refuses the rest", () => {
    expect(canonicalSourceType("seedr")).toBe("seedr");
    expect(canonicalSourceType("community")).toBe("community");
    expect(canonicalSourceType("official")).toBe("official");
    expect(canonicalSourceType("vendor")).toBeNull();
    expect(canonicalSourceType(42)).toBeNull();
  });

  test("isFirstParty holds for seedr and nowhere else", () => {
    expect(isFirstParty("seedr")).toBe(true);
    expect(isFirstParty("community")).toBe(false);
    expect(isFirstParty(undefined)).toBe(false);
  });

  test("Object.prototype keys are not source types", () => {
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(canonicalSourceType(key)).toBeNull();
    }
  });

  test("the validator names the spelling it will not take", () => {
    expect(validateItem({ ...seedrSkill, sourceType: "seedr" })).toEqual([]);
    expect(validateItem({ ...seedrSkill, sourceType: "vendor" })).toContainEqual({
      field: "sourceType",
      message: 'unknown sourceType "vendor"',
    });
  });
});
