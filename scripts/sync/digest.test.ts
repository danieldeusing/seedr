import { describe, expect, it } from "vitest";
import { computeContentDigest, sha256Hex } from "./digest.js";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("computeContentDigest", () => {
  it("matches the conformance vector from docs/registry-integrity.md", () => {
    const entries = [
      { path: "SKILL.md", bytes: encode("hello\n") },
      { path: "scripts/a.py", bytes: encode("print(1)\n") },
      { path: "LICENSE", bytes: encode("MIT License\n") },
    ];

    expect(sha256Hex(entries[0]!.bytes)).toMatch(/^5891b5b5.*be03$/);
    expect(sha256Hex(entries[1]!.bytes)).toMatch(/^cc421550.*a213$/);
    expect(sha256Hex(entries[2]!.bytes)).toMatch(/^267f7a2e.*bf91$/);
    expect(computeContentDigest(entries)).toBe(
      "b081846d406e05af3c1d8a5b226d6eaf344553cf5f05160ed25d98eeca98fbb6",
    );
  });

  it("is independent of input order", () => {
    const a = [
      { path: "b", bytes: encode("1") },
      { path: "a", bytes: encode("2") },
    ];
    const b = [a[1]!, a[0]!];
    expect(computeContentDigest(a)).toBe(computeContentDigest(b));
  });

  it("sorts by code units, not by locale (uppercase before lowercase)", () => {
    const entries = [
      { path: "a.md", bytes: encode("x") },
      { path: "B.md", bytes: encode("y") },
    ];
    const manual = sha256Hex(encode(`B.md\n${sha256Hex(encode("y"))}\na.md\n${sha256Hex(encode("x"))}\n`));
    expect(computeContentDigest(entries)).toBe(manual);
  });

  it("changes when a single byte changes and never normalises line endings", () => {
    const lf = computeContentDigest([{ path: "f", bytes: encode("a\n") }]);
    const crlf = computeContentDigest([{ path: "f", bytes: encode("a\r\n") }]);
    expect(lf).not.toBe(crlf);
  });

  it("returns null for an empty file set", () => {
    expect(computeContentDigest([])).toBeNull();
  });

  it("rejects duplicate paths instead of silently hashing them twice", () => {
    expect(() =>
      computeContentDigest([
        { path: "f", bytes: encode("1") },
        { path: "f", bytes: encode("2") },
      ]),
    ).toThrow(/Duplicate path/);
  });
});
