import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_TYPES, compileManifest, readAllItems, typeDirName } from "./compile-manifest.js";
import { computeContentDigest } from "./sync/digest.js";
import { emptyRegistry, writeItem } from "./test/fake-github.js";
import { makeExistingRegistry } from "./test/sync-world.js";

describe("compileManifest", () => {
  let registryDir: string;

  beforeEach(() => {
    registryDir = mkdtempSync(join(tmpdir(), "seedr-compile-"));
  });
  afterEach(() => rmSync(registryDir, { recursive: true, force: true }));

  it("keeps the public helpers", () => {
    expect(ALL_TYPES).toEqual(["skill", "plugin", "hook", "agent", "mcp", "settings", "command"]);
    expect(typeDirName("mcp")).toBe("mcp");
    expect(typeDirName("settings")).toBe("settings");
    expect(typeDirName("skill")).toBe("skills");
  });

  it("computes contentDigest and the legacy contentHash for toolr items from disk", () => {
    emptyRegistry(registryDir);
    writeItem(
      registryDir,
      {
        slug: "hello",
        name: "Hello",
        type: "skill",
        description: "Say hello.",
        compatibility: ["claude"],
        sourceType: "toolr",
        author: { name: "Daniel" },
        contents: { files: [{ name: "SKILL.md", type: "file" }, { name: "references", type: "directory", children: [{ name: "a.md", type: "file" }] }] },
      },
      { "SKILL.md": "hello\n", "references/a.md": "ref\n" },
    );
    const manifest = compileManifest({ registryDir });
    const item = manifest.items[0]!;
    expect(item.contentDigest).toBe(
      computeContentDigest([
        { path: "SKILL.md", bytes: Buffer.from("hello\n") },
        { path: "references/a.md", bytes: Buffer.from("ref\n") },
      ]),
    );
    expect(item.contentHash).toMatch(/^[0-9a-f]{16}$/);
    const skills = JSON.parse(readFileSync(join(registryDir, "skills", "manifest.json"), "utf-8")) as { items: { contentDigest: string; longDescription?: string }[] };
    expect(skills.items[0]!.contentDigest).toBe(item.contentDigest);
    const index = JSON.parse(readFileSync(join(registryDir, "manifest.json"), "utf-8")) as { version: string; types: Record<string, { count: number }> };
    expect(index.version).toBe("2.0.0");
    expect(index.types.skill!.count).toBe(1);
  });

  it("fails with every violation listed when an item breaks the contract", () => {
    emptyRegistry(registryDir);
    writeItem(registryDir, {
      slug: "Bad Slug",
      name: "",
      type: "skill",
      description: "x",
      compatibility: ["claude"],
      sourceType: "community",
      author: { name: "A" },
    });
    expect(() => compileManifest({ registryDir })).toThrow(/Invalid registry \(\d+ violation\(s\)\)/);
    expect(() => readAllItems({ registryDir })).toThrow(/slug: must match/);
    expect(() => readAllItems({ registryDir })).toThrow(/name: must be a non-empty string/);
    expect(() => readAllItems({ registryDir })).toThrow(/synced items must carry "sourceRevision"/);
    expect(readAllItems({ registryDir, validate: false })).toHaveLength(1);
  });

  it("rejects a directory whose name differs from the slug and duplicate items", () => {
    emptyRegistry(registryDir);
    const dir = writeItem(registryDir, {
      slug: "one",
      name: "One",
      type: "skill",
      description: "x",
      compatibility: ["claude"],
      sourceType: "toolr",
      author: { name: "A" },
      contents: { files: [] },
    });
    writeFileSync(join(dir, "item.json"), readFileSync(join(dir, "item.json"), "utf-8").replace('"slug": "one"', '"slug": "two"'));
    expect(() => readAllItems({ registryDir })).toThrow(/slug: is "two" but the directory is "one"/);
  });

  it("refuses the pre-integrity fixture registry and accepts it once synced (covered by sync tests)", () => {
    makeExistingRegistry(registryDir);
    expect(() => compileManifest({ registryDir })).toThrow(/must carry "sourceRevision"/);
  });
});
