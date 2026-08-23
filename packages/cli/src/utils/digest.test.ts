import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";
import { computeContentDigest, digestFromFileHashes, flattenFileTree, canonicalFileSet, sha256Hex } from "./digest.js";

const SCRIPT_A = "scripts/a.py";
const SCRIPT_B = "scripts/nested/b.py";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

/** Conformance vector from docs/registry-integrity.md — shared with the sync and the compiler. */
const VECTOR_FILES = {
  "SKILL.md": "hello\n",
  [SCRIPT_A]: "print(1)\n",
  LICENSE: "MIT License\n",
};
const VECTOR_HASHES = {
  "SKILL.md": "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
  [SCRIPT_A]: "cc42155088fca5730758db72b2a5bca33112a941dfaa2d43098ec422ce4ea213",
  LICENSE: "267f7a2e19dfa9df99af774520985a0e521925293ea5b7e767ab06969d06bf91",
};
const VECTOR_DIGEST = "b081846d406e05af3c1d8a5b226d6eaf344553cf5f05160ed25d98eeca98fbb6";

describe("content digest", () => {
  beforeEach(() => {
    vol.reset();
    vol.fromJSON(
      Object.fromEntries(Object.entries(VECTOR_FILES).map(([path, content]) => [`/item/${path}`, content]))
    );
  });

  it("hashes each file of the conformance vector as specified", () => {
    for (const [path, content] of Object.entries(VECTOR_FILES)) {
      expect(sha256Hex(content)).toBe(VECTOR_HASHES[path as keyof typeof VECTOR_HASHES]);
    }
  });

  it("matches the conformance vector digest from disk", async () => {
    await expect(computeContentDigest("/item", Object.keys(VECTOR_FILES))).resolves.toBe(VECTOR_DIGEST);
  });

  it("is independent of the order paths are given in", async () => {
    await expect(computeContentDigest("/item", [SCRIPT_A, "LICENSE", "SKILL.md"])).resolves.toBe(VECTOR_DIGEST);
  });

  it("sorts with plain code-unit comparison (uppercase before lowercase)", () => {
    const entries = [
      { path: "b", sha256: "1" },
      { path: "B", sha256: "2" },
      { path: "a", sha256: "3" },
    ];
    // B < a < b in code units
    expect(digestFromFileHashes(entries)).toBe(sha256Hex("B\n2\na\n3\nb\n1\n"));
  });

  it("changes when any byte changes", async () => {
    vol.writeFileSync("/item/SKILL.md", "hello\r\n");
    await expect(computeContentDigest("/item", Object.keys(VECTOR_FILES))).resolves.not.toBe(VECTOR_DIGEST);
  });

  it("hashes binary content as bytes", () => {
    const bytes = Buffer.from([0, 255, 10, 13]);
    expect(sha256Hex(bytes)).toBe(sha256Hex(Buffer.from(bytes)));
    expect(digestFromFileHashes([{ path: "bin", sha256: sha256Hex(bytes) }])).toHaveLength(64);
  });

  it("fails when a listed file is missing", async () => {
    await expect(computeContentDigest("/item", ["missing.md"])).rejects.toThrow(/ENOENT/);
  });
});

describe("file tree helpers", () => {
  const tree = [
    { name: "SKILL.md", type: "file" as const },
    {
      name: "scripts",
      type: "directory" as const,
      children: [
        { name: "a.py", type: "file" as const },
        { name: "nested", type: "directory" as const, children: [{ name: "b.py", type: "file" as const }] },
        { name: "empty", type: "directory" as const },
      ],
    },
  ];

  it("flattens depth-first with slash-joined paths", () => {
    expect(flattenFileTree(tree)).toEqual(["SKILL.md", SCRIPT_A, SCRIPT_B]);
  });

  it("appends license.installAs when it is not in the tree", () => {
    expect(canonicalFileSet(tree, { file: "LICENSE", installAs: "LICENSE" })).toEqual([
      "SKILL.md",
      SCRIPT_A,
      SCRIPT_B,
      "LICENSE",
    ]);
  });

  it("does not duplicate a license that is already part of the tree", () => {
    const withLicense = [...tree, { name: "LICENSE", type: "file" as const }];
    expect(canonicalFileSet(withLicense, { file: "LICENSE", installAs: "LICENSE" })).toEqual([
      "SKILL.md",
      SCRIPT_A,
      SCRIPT_B,
      "LICENSE",
    ]);
    expect(canonicalFileSet(tree, undefined)).toHaveLength(3);
  });
});
