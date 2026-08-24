import { describe, it, expect } from "vitest";
import { isValidSlug, assertValidSlug, MAX_SLUG_LENGTH } from "./slug.js";

describe("slug validation", () => {
  it.each(["pdf", "frontend-design", "a", "0abc", "skill-creator-2"])("accepts %s", (slug) => {
    expect(isValidSlug(slug)).toBe(true);
    expect(() => assertValidSlug(slug)).not.toThrow();
  });

  it.each([
    ["", "empty"],
    ["..", "dot-dot"],
    ["../x", "traversal"],
    ["../../x", "double traversal"],
    ["/etc", "absolute"],
    ["a/b", "separator"],
    ["a\\b", "backslash"],
    ["-rf", "leading dash"],
    ["Pdf", "uppercase"],
    ["%2e%2e", "url-encoded dot-dot"],
    ["pdf\u0000", "NUL"],
    ["pdf\n", "newline"],
    [" pdf", "leading space"],
    ["ünïcode", "non-ascii"],
    ["a".repeat(MAX_SLUG_LENGTH + 1), "too long"],
  ])("rejects %j (%s)", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
    expect(() => assertValidSlug(slug)).toThrow(/Invalid item slug/);
  });

  it("rejects non-strings", () => {
    expect(isValidSlug(undefined)).toBe(false);
    expect(isValidSlug(42)).toBe(false);
    expect(() => assertValidSlug(null, "plugin slug")).toThrow(/Invalid plugin slug: null/);
  });

  it("accepts a slug of exactly the maximum length", () => {
    expect(isValidSlug("a".repeat(MAX_SLUG_LENGTH))).toBe(true);
  });
});
