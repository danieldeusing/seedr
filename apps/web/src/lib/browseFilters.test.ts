import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  dropUpdates,
  filterItems,
  paramUpdatesFor,
  parseBrowseParams,
  resetFilterUpdates,
  sortItems,
  type BrowseContext,
  type FilterOption,
} from "./browseFilters";
import type { RegistryItem } from "./types";

const params = (query: string) => new URLSearchParams(query);
// registry/labels.json ships empty, so the catalogue is a fixture here
const LABELS: FilterOption[] = [
  { value: "project-x", label: "Project X" },
  { value: "general", label: "General" },
];
const plugins: BrowseContext = { componentType: "plugin", hasWrappers: false, labels: LABELS };
const skills: BrowseContext = { componentType: "skill", hasWrappers: true, labels: LABELS };
const hooks: BrowseContext = { componentType: "hook", hasWrappers: false, labels: LABELS };
const unlabelled: BrowseContext = { ...skills, labels: [] };

const item = (overrides: Partial<RegistryItem>): RegistryItem => ({
  slug: "x",
  name: "X",
  type: "skill",
  description: "",
  compatibility: ["claude"],
  ...overrides,
});

const ITEMS: RegistryItem[] = [
  item({ slug: "alpha", name: "Alpha", type: "skill", sourceType: "seedr", targetScope: "user", label: "project-x", compatibility: ["claude", "gemini"], updatedAt: "2026-01-01" }),
  item({ slug: "beta", name: "Beta", type: "skill", sourceType: "community", compatibility: ["copilot"], updatedAt: "2026-03-01" }),
  item({ slug: "wrap", name: "Wrap", type: "plugin", pluginType: "wrapper", wrapper: "skill", sourceType: "official", updatedAt: "2026-02-01" }),
  item({ slug: "pack", name: "Pack", type: "plugin", pluginType: "package", package: { skill: 2, hook: 1 }, sourceType: "official" }),
  item({ slug: "integ", name: "Integ", type: "plugin", pluginType: "integration", integration: "mcp", sourceType: "community" }),
];

describe("parseBrowseParams", () => {
  it("reads valid parameters and defaults the rest", () => {
    const { filters, dropped } = parseBrowseParams(params("q=pdf&tool=claude&source=seedr&scope=user&label=project-x&sortField=updated&sortAsc=false"), skills);
    expect(filters).toEqual({
      query: "pdf",
      tool: "claude",
      source: "seedr",
      scope: "user",
      label: "project-x",
      pluginType: null,
      capability: null,
      kind: null,
      sortField: "updated",
      sortAsc: false,
    });
    expect(dropped).toEqual([]);
  });

  it("drops unknown values instead of producing an empty result set", () => {
    const { filters, dropped } = parseBrowseParams(params("tool=garbage&source=nope&sortField=size&sortAsc=maybe"), skills);
    expect(filters.tool).toBeNull();
    expect(filters.source).toBeNull();
    expect(filters.sortField).toBe("name");
    expect(filters.sortAsc).toBe(true);
    expect(dropped.map((d) => d.key)).toEqual(["tool", "source", "sortField", "sortAsc"]);
  });

  it("drops scope unless the source is seedr", () => {
    expect(parseBrowseParams(params("scope=user"), skills).dropped).toEqual([
      { key: "scope", value: "user", reason: "scope only applies to Seedr-sourced items" },
    ]);
    expect(parseBrowseParams(params("source=community&scope=user"), skills).filters.scope).toBeNull();
    expect(parseBrowseParams(params("source=seedr&scope=user"), skills).filters.scope).toBe("user");
  });

  it("drops a label unless the source is seedr", () => {
    expect(parseBrowseParams(params("label=project-x"), skills).dropped).toEqual([
      { key: "label", value: "project-x", reason: "labels only apply to Seedr-sourced items" },
    ]);
    expect(parseBrowseParams(params("source=community&label=project-x"), skills).filters.label).toBeNull();
    expect(parseBrowseParams(params("source=seedr&label=project-x"), skills).filters.label).toBe("project-x");
  });

  it("drops a label the catalogue does not define", () => {
    const { filters, dropped } = parseBrowseParams(params("source=seedr&label=nope"), skills);
    expect(filters.label).toBeNull();
    expect(dropped).toEqual([{ key: "label", value: "nope", reason: '"nope" is not a known label' }]);
  });

  it("drops every label when the catalogue is empty", () => {
    const { filters, dropped } = parseBrowseParams(params("source=seedr&label=project-x"), unlabelled);
    expect(filters.label).toBeNull();
    expect(dropped).toEqual([{ key: "label", value: "project-x", reason: '"project-x" is not a known label' }]);
  });

  it("drops a source value that is not one of the three, and the scope that depended on it", () => {
    const { filters, dropped } = parseBrowseParams(params("source=vendor&scope=user"), skills);
    expect(filters.source).toBeNull();
    expect(filters.scope).toBeNull();
    expect(dropped).toContainEqual(expect.objectContaining({ key: "source", value: "vendor" }));
  });

  it("drops plugin-only parameters on capability pages (cross-category navigation)", () => {
    const { filters, dropped } = parseBrowseParams(params("pluginType=wrapper&ext=skill"), skills);
    expect(filters.pluginType).toBeNull();
    expect(filters.capability).toBeNull();
    expect(dropped.map((d) => d.key)).toEqual(["pluginType", "ext"]);
  });

  it("drops ext unless the plugin type is wrapper", () => {
    expect(parseBrowseParams(params("ext=skill"), plugins).dropped[0]).toMatchObject({ key: "ext", reason: "capability only applies to wrapper plugins" });
    expect(parseBrowseParams(params("pluginType=package&ext=skill"), plugins).filters.capability).toBeNull();
    expect(parseBrowseParams(params("pluginType=wrapper&ext=skill"), plugins).filters.capability).toBe("skill");
  });

  it("drops kind on the plugins page and on pages without wrappers", () => {
    expect(parseBrowseParams(params("kind=wrapper"), plugins).dropped[0]?.key).toBe("kind");
    expect(parseBrowseParams(params("kind=wrapper"), hooks).dropped[0]?.key).toBe("kind");
    expect(parseBrowseParams(params("kind=wrapper"), skills).filters.kind).toBe("wrapper");
  });

  it('treats "all" and empty values as no filter', () => {
    const { filters, dropped } = parseBrowseParams(params("tool=all&source="), skills);
    expect(filters.tool).toBeNull();
    expect(filters.source).toBeNull();
    expect(dropped).toEqual([]);
  });
});

describe("filterItems", () => {
  const search = (query: string) => ITEMS.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const base = parseBrowseParams(params(""), skills).filters;

  it("filters by agent, source and scope", () => {
    expect(filterItems(ITEMS, { ...base, tool: "gemini" }, skills, search).map((i) => i.slug)).toEqual(["alpha"]);
    expect(filterItems(ITEMS, { ...base, source: "community" }, skills, search).map((i) => i.slug)).toEqual(["beta", "integ"]);
    expect(filterItems(ITEMS, { ...base, source: "seedr", scope: "user" }, skills, search).map((i) => i.slug)).toEqual(["alpha"]);
  });

  it("filters by label, keeping only the items that carry it", () => {
    expect(filterItems(ITEMS, { ...base, label: "project-x" }, skills, search).map((i) => i.slug)).toEqual(["alpha"]);
    expect(filterItems(ITEMS, { ...base, label: "general" }, skills, search)).toEqual([]);
  });

  it("filters plugins by type and wrapped capability", () => {
    const pluginBase = parseBrowseParams(params(""), plugins).filters;
    expect(filterItems(ITEMS, { ...pluginBase, pluginType: "wrapper" }, plugins, search).map((i) => i.slug)).toEqual(["wrap"]);
    expect(filterItems(ITEMS, { ...pluginBase, pluginType: "wrapper", capability: "hook" }, plugins, search)).toEqual([]);
    expect(filterItems(ITEMS, { ...pluginBase, capability: "hook" }, plugins, search).map((i) => i.slug)).toEqual(["pack"]);
    expect(filterItems(ITEMS, { ...pluginBase, capability: "mcp" }, plugins, search).map((i) => i.slug)).toEqual(["integ"]);
  });

  it("filters native items vs wrappers on capability pages", () => {
    expect(filterItems(ITEMS, { ...base, kind: "native" }, skills, search).map((i) => i.slug)).toEqual(["alpha", "beta"]);
    expect(filterItems(ITEMS, { ...base, kind: "wrapper" }, skills, search).map((i) => i.slug)).toEqual(["wrap"]);
  });

  it("searches first, then filters, then sorts", () => {
    expect(filterItems(ITEMS, { ...base, query: "a", sortAsc: false }, skills, search).map((i) => i.slug)).toEqual(["wrap", "pack", "beta", "alpha"]);
    expect(filterItems(ITEMS, { ...base, query: "a", tool: "copilot" }, skills, search).map((i) => i.slug)).toEqual(["beta"]);
  });
});

describe("sortItems", () => {
  it("sorts by name and by updated date in both directions", () => {
    expect(sortItems(ITEMS, "name", true).map((i) => i.slug)).toEqual(["alpha", "beta", "integ", "pack", "wrap"]);
    expect(sortItems(ITEMS, "name", false).map((i) => i.slug)).toEqual(["wrap", "pack", "integ", "beta", "alpha"]);
    expect(sortItems(ITEMS, "updated", false).map((i) => i.slug).slice(0, 3)).toEqual(["beta", "wrap", "alpha"]);
  });
});

describe("chips and updates", () => {
  it("lists the active filters as chips with human labels", () => {
    const { filters } = parseBrowseParams(params("q=pdf&tool=claude&source=seedr&scope=local&label=project-x&sortField=updated"), skills);
    expect(activeFilterChips(filters, skills.labels)).toEqual([
      { key: "q", label: "Search", value: "pdf" },
      { key: "source", label: "Source", value: "Seedr" },
      { key: "scope", label: "Scope", value: "Local" },
      { key: "label", label: "Label", value: "Project X" },
      { key: "tool", label: "Coding Agent", value: "Claude Code" },
    ]);
  });

  it("clears dependants together with their parent", () => {
    expect(paramUpdatesFor("source", "community")).toEqual({ source: "community", scope: null, label: null });
    expect(paramUpdatesFor("source", "seedr")).toEqual({ source: "seedr" });
    expect(paramUpdatesFor("source", null)).toEqual({ source: null, scope: null, label: null });
    expect(paramUpdatesFor("pluginType", "package")).toEqual({ pluginType: "package", ext: null });
    expect(paramUpdatesFor("pluginType", "wrapper")).toEqual({ pluginType: "wrapper" });
    expect(paramUpdatesFor("tool", "all")).toEqual({ tool: null });
  });

  it("keeps the URL clean for the default sort", () => {
    expect(paramUpdatesFor("sortField", "name")).toEqual({ sortField: null });
    expect(paramUpdatesFor("sortField", "updated")).toEqual({ sortField: "updated" });
    expect(paramUpdatesFor("sortAsc", "true")).toEqual({ sortAsc: null });
    expect(paramUpdatesFor("sortAsc", "false")).toEqual({ sortAsc: "false" });
  });

  it("resets every filter but keeps the sort, and removes dropped parameters", () => {
    expect(resetFilterUpdates()).toEqual({ q: null, tool: null, source: null, scope: null, label: null, pluginType: null, ext: null, kind: null });
    expect(dropUpdates([{ key: "ext", value: "x", reason: "" }, { key: "scope", value: "y", reason: "" }])).toEqual({ ext: null, scope: null });
  });
});
