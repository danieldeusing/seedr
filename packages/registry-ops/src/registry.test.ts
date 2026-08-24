import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { collectItems, compileRegistry } from "./compile.js";
import { contentHash, itemStateHash } from "./hash.js";
import { indexManifestPath, typeManifestPath } from "./fsPaths.js";
import { fileTree, listItems, readIndex, readItem, readTypeManifest } from "./read.js";
import { makeRegistry, writeItem, toolrSkill } from "./test/fixtures.js";

describe("read", () => {
  test("listItems walks every type directory and keys by (type, slug)", () => {
    const registry = makeRegistry();
    expect(listItems(registry).map((i) => `${i.type}/${i.slug}`)).toEqual(["skill/alpha", "skill/gamma", "plugin/beta", "mcp/delta"]);
  });

  test("readItem refuses an item whose json disagrees with its directory", () => {
    const registry = makeRegistry();
    writeItem(registry, "skills", { ...toolrSkill, slug: "wrong" });
    writeFileSync(join(registry, "skills", "wrong", "item.json"), JSON.stringify({ ...toolrSkill, slug: "alpha" }));
    expect(() => readItem(registry, "skill", "wrong")).toThrow(/is "alpha" but the directory is "wrong"/);
  });

  test("readItem reports unparsable json with its path", () => {
    const registry = makeRegistry();
    writeFileSync(join(registry, "skills", "alpha", "item.json"), "{ nope");
    expect(() => readItem(registry, "skill", "alpha")).toThrow(/Failed to parse .*item\.json/);
  });

  test("fileTree lists directories first and hides item.json", () => {
    const registry = makeRegistry();
    expect(fileTree(join(registry, "skills", "alpha"))).toEqual([
      { name: "references", type: "directory", children: [{ name: "notes.md", type: "file" }] },
      { name: "SKILL.md", type: "file" },
    ]);
  });
});

describe("hash", () => {
  test("contentHash covers content files, not item.json, and is null without content", () => {
    const registry = makeRegistry();
    const alpha = join(registry, "skills", "alpha");
    const before = contentHash(alpha);
    expect(before).toMatch(/^[0-9a-f]{16}$/);
    writeFileSync(join(alpha, "item.json"), JSON.stringify({ ...toolrSkill, name: "Alpha!" }));
    expect(contentHash(alpha)).toBe(before);
    writeFileSync(join(alpha, "SKILL.md"), "# changed\n");
    expect(contentHash(alpha)).not.toBe(before);
    expect(contentHash(join(registry, "plugins", "beta"))).toBeNull();
  });

  test("itemStateHash changes on either metadata or content, and is null for a missing item", () => {
    const registry = makeRegistry();
    const initial = itemStateHash(registry, "skill", "alpha");
    writeFileSync(join(registry, "skills", "alpha", "item.json"), JSON.stringify({ ...toolrSkill, name: "Alpha!" }));
    const afterMeta = itemStateHash(registry, "skill", "alpha");
    expect(afterMeta).not.toBe(initial);
    writeFileSync(join(registry, "skills", "alpha", "references", "notes.md"), "more\n");
    expect(itemStateHash(registry, "skill", "alpha")).not.toBe(afterMeta);
    expect(itemStateHash(registry, "skill", "missing")).toBeNull();
  });
});

describe("compile", () => {
  test("orders by source then slug and fills contentHash for toolr items with content", () => {
    const items = collectItems(makeRegistry());
    expect(items.map((i) => `${i.sourceType}/${i.slug}`)).toEqual(["toolr/alpha", "toolr/delta", "community/beta", "official/gamma"]);
    expect(items.find((i) => i.slug === "alpha")?.contentHash).toMatch(/^[0-9a-f]{16}$/);
    expect(items.find((i) => i.slug === "delta")?.contentHash).toMatch(/^[0-9a-f]{16}$/);
    expect(items.find((i) => i.slug === "beta")?.contentHash).toBeUndefined();
  });

  test("writes per-type manifests and the index, stripping longDescription and plugin contents", () => {
    const registry = makeRegistry();
    const { counts } = compileRegistry(registry);
    expect(counts).toEqual({ skill: 2, plugin: 1, hook: 0, agent: 0, mcp: 1, settings: 0, command: 0 });

    const index = readIndex(registry);
    expect(index.version).toBe("2.0.0");
    expect(index.types.mcp).toEqual({ file: "mcp/manifest.json", count: 1 });
    expect(index.types.settings).toEqual({ file: "settings/manifest.json", count: 0 });
    expect(existsSync(typeManifestPath(registry, "settings"))).toBe(true);

    const skills = readTypeManifest(registry, "skill");
    expect(skills.items.map((i) => i.slug)).toEqual(["alpha", "gamma"]);
    expect(skills.items.every((i) => i.longDescription === undefined)).toBe(true);
    expect(skills.items[0]?.contents?.files).toBeDefined();
    const plugins = readTypeManifest(registry, "plugin");
    expect(plugins.items[0]?.contents).toBeUndefined();
  });

  test("fails loudly on a structurally invalid item and writes nothing", () => {
    const registry = makeRegistry();
    writeItem(registry, "hooks", { ...toolrSkill, slug: "broken", type: "hook", compatibility: ["bard" as never] });
    expect(() => compileRegistry(registry)).toThrow(/compatibility: unknown coding agent "bard"/);
    expect(existsSync(indexManifestPath(registry))).toBe(false);
  });

  test("reproduces the committed manifests of the real registry byte for byte", () => {
    const realRegistry = resolve(import.meta.dirname, "../../../registry");
    // Compiled into a copy so the test never writes into the repo.
    const copy = mkdtempSync(join(tmpdir(), "seedr-real-registry-"));
    cpSync(realRegistry, copy, { recursive: true });
    compileRegistry(copy);
    const manifests = ["manifest.json", ...readdirSync(realRegistry, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(e.name, "manifest.json"))];
    expect(manifests.length).toBeGreaterThan(1);
    for (const manifest of manifests) {
      expect(readFileSync(join(copy, manifest), "utf8"), manifest).toBe(readFileSync(join(realRegistry, manifest), "utf8"));
    }
    rmSync(copy, { recursive: true, force: true });
  });
});
