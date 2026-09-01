import { describe, expect, test } from "vitest";
import { fs } from "@/api/fs";
import { mockFs } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { countByType, itemDirRel, loadFileTree, loadRegistry } from "./registry";

describe("loadRegistry", () => {
  test("lists every item by (type, slug) with its validation state, and surfaces unreadable files", async () => {
    mockFs(registryFiles());
    const { items, problems } = await loadRegistry(fs, "registry");

    expect(items.map((i) => `${i.type}/${i.slug}`)).toEqual(["skill/broken", "skill/pdf", "mcp/playwright"]);
    expect(items.find((i) => i.slug === "pdf")?.errors).toEqual([]);
    expect(items.find((i) => i.slug === "broken")?.errors.map((e) => e.field)).toEqual(["compatibility"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^registry\/skills\/garbage\/item\.json: /);
  });

  test("an empty registry is empty, not an error", async () => {
    mockFs({ registry: null });
    expect(await loadRegistry(fs, "registry")).toEqual({ items: [], problems: [] });
  });

  test("skips type directories that do not exist and directories without item.json", async () => {
    mockFs({ registry: null, "registry/skills": null, "registry/skills/stray-dir": null });
    expect((await loadRegistry(fs, "registry")).items).toEqual([]);
  });
});

describe("loadFileTree", () => {
  test("nests directories first and hides item.json", async () => {
    mockFs(registryFiles());
    expect(await loadFileTree(fs, itemDirRel("registry", "mcp", "playwright"))).toEqual([
      { name: "docs", type: "directory", children: [{ name: "notes.md", type: "file" }] },
      { name: "mcp.md", type: "file" },
    ]);
  });
});

describe("countByType", () => {
  test("counts every type, including the empty ones", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    expect(countByType(items)).toEqual({ skill: 2, plugin: 0, hook: 0, agent: 0, mcp: 1, settings: 0, command: 0, rule: 0 });
  });

  test("itemDirRel uses the one type-directory rule", () => {
    expect(itemDirRel("registry", "mcp", "x")).toBe("registry/mcp/x");
    expect(itemDirRel("registry", "skill", "x")).toBe("registry/skills/x");
    // A fork names its own directory in seedr.config.json, and it replaces
    // `registry/` rather than adding to it.
    expect(itemDirRel("registry-internal", "skill", "x")).toBe("registry-internal/skills/x");
  });
});
