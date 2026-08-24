/*
 * Browse page filter state, kept in the URL query string.
 *
 * Every parameter is validated against the options that apply to the current
 * category; anything invalid or irrelevant is reported as "dropped" so the page
 * can remove it from the URL and tell the visitor, instead of silently showing
 * zero results. Dependent parameters (`scope` needs `source=toolr`, `ext` needs
 * `pluginType=wrapper`) are cleared together with the parameter they depend on.
 */
import type { CodingAgent, ComponentType, PluginType, RegistryItem, ScopeType, SourceType } from "./types";
import { agentOptions, scopeOptions, sourceOptions } from "./filterOptions";
import { agentLabels, scopeLabels, sourceLabels } from "./colors";

export type CapabilityType = "skill" | "hook" | "agent" | "command" | "mcp";
export type ItemKind = "native" | "wrapper";
export type SortField = "name" | "updated";

export interface FilterOption {
  value: string;
  label: string;
}

export const pluginTypeOptions: FilterOption[] = [
  { value: "package", label: "Package" },
  { value: "wrapper", label: "Wrapper" },
  { value: "integration", label: "Integration" },
];

export const kindOptions: FilterOption[] = [
  { value: "native", label: "Native" },
  { value: "wrapper", label: "Wrapper" },
];

export const capabilityOptions: FilterOption[] = [
  { value: "skill", label: "Skill" },
  { value: "hook", label: "Hook" },
  { value: "agent", label: "Agent" },
  { value: "command", label: "Command" },
  { value: "mcp", label: "MCP Server" },
];

export const sortFieldOptions: FilterOption[] = [
  { value: "name", label: "Name" },
  { value: "updated", label: "Updated" },
];

export interface BrowseFilters {
  query: string;
  tool: CodingAgent | null;
  source: SourceType | null;
  scope: ScopeType | null;
  pluginType: PluginType | null;
  capability: CapabilityType | null;
  kind: ItemKind | null;
  sortField: SortField;
  sortAsc: boolean;
}

export interface BrowseContext {
  componentType: ComponentType;
  /** Whether wrapper plugins are listed alongside native items (capability pages only). */
  hasWrappers: boolean;
}

export type FilterParamKey = "q" | "tool" | "source" | "scope" | "pluginType" | "ext" | "kind" | "sortField" | "sortAsc";

export interface DroppedParam {
  key: FilterParamKey;
  value: string;
  reason: string;
}

export interface ParsedBrowseParams {
  filters: BrowseFilters;
  dropped: DroppedParam[];
}

const ALL_KEYS: FilterParamKey[] = ["q", "tool", "source", "scope", "pluginType", "ext", "kind", "sortField", "sortAsc"];

function pickValid<T extends string>(raw: string | null, allowed: readonly FilterOption[]): T | null {
  return raw !== null && allowed.some((option) => option.value === raw) ? (raw as T) : null;
}

/** Reads and validates the query string for a category page. */
export function parseBrowseParams(params: URLSearchParams, context: BrowseContext): ParsedBrowseParams {
  const dropped: DroppedParam[] = [];
  const isPlugins = context.componentType === "plugin";

  const read = <T extends string>(key: FilterParamKey, allowed: readonly FilterOption[], applies: boolean, irrelevantReason: string): T | null => {
    const raw = params.get(key);
    if (raw === null || raw === "" || raw === "all") return null;
    if (!applies) {
      dropped.push({ key, value: raw, reason: irrelevantReason });
      return null;
    }
    const valid = pickValid<T>(raw, allowed);
    if (valid === null) dropped.push({ key, value: raw, reason: `"${raw}" is not a known ${key}` });
    return valid;
  };

  const query = params.get("q") ?? "";
  const tool = read<CodingAgent>("tool", agentOptions, true, "");
  const source = read<SourceType>("source", sourceOptions, true, "");
  const scope = read<ScopeType>("scope", scopeOptions, source === "toolr", "scope only applies to Seedr-sourced items");
  const pluginType = read<PluginType>("pluginType", pluginTypeOptions, isPlugins, "plugin type only applies to the plugins page");
  const capability = read<CapabilityType>("ext", capabilityOptions, isPlugins && pluginType === "wrapper", "capability only applies to wrapper plugins");
  const kind = read<ItemKind>("kind", kindOptions, !isPlugins && context.hasWrappers, "kind only applies to capability pages that list wrappers");
  const sortField = read<SortField>("sortField", sortFieldOptions, true, "") ?? "name";

  const rawSortAsc = params.get("sortAsc");
  let sortAsc = true;
  if (rawSortAsc === "false") sortAsc = false;
  else if (rawSortAsc !== null && rawSortAsc !== "true") dropped.push({ key: "sortAsc", value: rawSortAsc, reason: `"${rawSortAsc}" is not a sort direction` });

  return { filters: { query, tool, source, scope, pluginType, capability, kind, sortField, sortAsc }, dropped };
}

export function sortItems(items: RegistryItem[], field: SortField, ascending: boolean): RegistryItem[] {
  return [...items].sort((a, b) => {
    const cmp = field === "updated" ? (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") : a.name.localeCompare(b.name);
    return ascending ? cmp : -cmp;
  });
}

function matchesCapability(item: RegistryItem, capability: CapabilityType): boolean {
  if (item.pluginType === "wrapper") return item.wrapper === capability;
  if (item.pluginType === "integration") return item.integration === capability;
  if (item.package) return (item.package[capability] ?? 0) > 0;
  return false;
}

/** Applies every active filter, then sorts. `search` runs the text query (e.g. Fuse). */
export function filterItems(
  items: RegistryItem[],
  filters: BrowseFilters,
  context: BrowseContext,
  search: (query: string) => RegistryItem[]
): RegistryItem[] {
  let result = filters.query ? search(filters.query) : items;
  if (filters.tool) result = result.filter((item) => item.compatibility.includes(filters.tool!));
  if (filters.source) result = result.filter((item) => (item.sourceType ?? "toolr") === filters.source);
  if (filters.scope) result = result.filter((item) => (item.targetScope ?? "project") === filters.scope);
  if (filters.pluginType) result = result.filter((item) => (item.pluginType ?? "package") === filters.pluginType);
  if (filters.capability) result = result.filter((item) => matchesCapability(item, filters.capability!));
  if (filters.kind === "native") result = result.filter((item) => item.type === context.componentType);
  if (filters.kind === "wrapper") result = result.filter((item) => item.type === "plugin" && item.pluginType === "wrapper");
  return sortItems(result, filters.sortField, filters.sortAsc);
}

export interface FilterChip {
  key: FilterParamKey;
  label: string;
  value: string;
}

const labelOf = (options: FilterOption[], value: string) => options.find((option) => option.value === value)?.label ?? value;

/** The active filters as removable chips (sort is not a filter and gets no chip). */
export function activeFilterChips(filters: BrowseFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.query) chips.push({ key: "q", label: "Search", value: filters.query });
  if (filters.kind) chips.push({ key: "kind", label: "Kind", value: labelOf(kindOptions, filters.kind) });
  if (filters.pluginType) chips.push({ key: "pluginType", label: "Type", value: labelOf(pluginTypeOptions, filters.pluginType) });
  if (filters.capability) chips.push({ key: "ext", label: "Capability", value: labelOf(capabilityOptions, filters.capability) });
  if (filters.source) chips.push({ key: "source", label: "Source", value: sourceLabels[filters.source] });
  if (filters.scope) chips.push({ key: "scope", label: "Scope", value: scopeLabels[filters.scope] });
  if (filters.tool) chips.push({ key: "tool", label: "Coding Agent", value: agentLabels[filters.tool] });
  return chips;
}

export function hasActiveFilters(filters: BrowseFilters): boolean {
  return activeFilterChips(filters).length > 0;
}

/**
 * Query-string updates for setting one parameter: `null` removes a key. Clearing
 * or changing a parameter also clears the parameters that depend on it.
 */
export function paramUpdatesFor(key: FilterParamKey, value: string | null): Record<string, string | null> {
  const normalized = value === "" || value === "all" ? null : value;
  const updates: Record<string, string | null> = { [key]: normalized };
  if (key === "source" && normalized !== "toolr") updates.scope = null;
  if (key === "pluginType" && normalized !== "wrapper") updates.ext = null;
  if (key === "sortField" && normalized === "name") updates.sortField = null;
  if (key === "sortAsc" && normalized === "true") updates.sortAsc = null;
  return updates;
}

/** Query-string updates that remove every filter (sort order is kept). */
export function resetFilterUpdates(): Record<string, string | null> {
  return Object.fromEntries(ALL_KEYS.filter((key) => key !== "sortField" && key !== "sortAsc").map((key) => [key, null]));
}

/** Query-string updates that remove the dropped (invalid/irrelevant) parameters. */
export function dropUpdates(dropped: DroppedParam[]): Record<string, string | null> {
  return Object.fromEntries(dropped.map((param) => [param.key, null]));
}
