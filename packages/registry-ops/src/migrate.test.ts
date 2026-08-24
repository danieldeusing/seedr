import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { itemJsonPath, typeManifestPath } from "./fsPaths.js";
import { migrateAgentIds } from "./migrate.js";
import { makeRegistry, officialSkill, toolrSkill, writeItem } from "./test/fixtures.js";

describe("migrateAgentIds", () => {
  test("rewrites gemini to antigravity, collapses duplicates, recompiles, and leaves the rest alone", () => {
    const registry = makeRegistry();
    writeItem(registry, "skills", { ...officialSkill, slug: "legacy", compatibility: ["claude", "gemini", "antigravity", "codex"] });
    const before = readFileSync(itemJsonPath(registry, "skill", "alpha"), "utf8");

    const migrated = migrateAgentIds(registry);

    expect(migrated).toEqual([{ type: "skill", slug: "legacy", before: ["claude", "gemini", "antigravity", "codex"], after: ["claude", "antigravity", "codex"] }]);
    expect(JSON.parse(readFileSync(itemJsonPath(registry, "skill", "legacy"), "utf8")).compatibility).toEqual(["claude", "antigravity", "codex"]);
    expect(readFileSync(itemJsonPath(registry, "skill", "alpha"), "utf8")).toBe(before);
    const compiled = JSON.parse(readFileSync(typeManifestPath(registry, "skill"), "utf8"));
    expect(compiled.items.find((i: { slug: string }) => i.slug === "legacy").compatibility).toEqual(["claude", "antigravity", "codex"]);
  });

  test("touches nothing, not even the manifests, on a registry without legacy ids", () => {
    const registry = makeRegistry();
    expect(toolrSkill.compatibility).not.toContain("gemini");
    expect(migrateAgentIds(registry)).toEqual([]);
    expect(existsSync(join(registry, "manifest.json"))).toBe(false);
  });
});
