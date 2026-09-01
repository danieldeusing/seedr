import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Fuse from "fuse.js";
import { X } from "lucide-react";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useUpdateParams } from "@/hooks/useUpdateParams";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FilterDropdown } from "@/components/FilterDropdown";
import { SortDropdown } from "@/components/SortDropdown";
import { ItemCard } from "@/components/ItemCard";
import { TypeIcon } from "@/components/TypeIcon";
import { NotFound } from "@/routes/NotFound";
import { getItemsByType, fuseOptions } from "@/lib/registry";
import { labelCatalogue } from "@/lib/labels";
import { pluralize } from "@/lib/text";
import { typeLabelPlural, typeTextColors, pathToType } from "@/lib/colors";
import { agentOptions, sourceOptions, scopeOptions } from "@/lib/filterOptions";
import {
  activeFilterChips,
  capabilityOptions,
  dropUpdates,
  filterItems,
  kindOptions,
  paramUpdatesFor,
  parseBrowseParams,
  pluginTypeOptions,
  resetFilterUpdates,
  sortFieldOptions,
  type BrowseContext,
  type BrowseFilters,
  type DroppedParam,
  type FilterOption,
  type FilterParamKey,
} from "@/lib/browseFilters";
import type { ComponentType, RegistryItem } from "@/lib/types";
import { categoryMeta } from "../../scripts/site-meta.mjs";

/** URL-backed filter state for one category page. */
function useBrowseFilters(componentType: ComponentType) {
  const { searchParams, updateParams } = useUpdateParams();
  const items = useMemo(() => getItemsByType(componentType), [componentType]);
  const context = useMemo<BrowseContext>(
    () => ({
      componentType,
      hasWrappers: componentType !== "plugin" && items.some((item) => item.type === "plugin" && item.pluginType === "wrapper"),
      labels: labelCatalogue.map((definition) => ({ value: definition.slug, label: definition.name })),
    }),
    [componentType, items]
  );
  const { filters, dropped } = useMemo(() => parseBrowseParams(searchParams, context), [searchParams, context]);

  // Invalid or irrelevant parameters are removed from the URL and announced once,
  // so a stale link never silently shows an empty page.
  const [ignored, setIgnored] = useState<DroppedParam[]>([]);
  useEffect(() => {
    if (dropped.length === 0) return;
    setIgnored(dropped);
    updateParams(dropUpdates(dropped));
  }, [dropped, updateParams]);

  const fuse = useMemo(() => new Fuse(items, fuseOptions), [items]);
  const filteredItems = useMemo(
    () => filterItems(items, filters, context, (query) => fuse.search(query).map((result) => result.item)),
    [items, filters, context, fuse]
  );

  const setFilter = (key: FilterParamKey, value: string | null) => {
    setIgnored([]);
    updateParams(paramUpdatesFor(key, value));
  };
  const resetFilters = () => {
    setIgnored([]);
    updateParams(resetFilterUpdates());
  };

  return { items, filteredItems, filters, context, ignored, setFilter, resetFilters };
}

interface FilterBarProps {
  filters: BrowseFilters;
  context: BrowseContext;
  placeholder: string;
  setFilter: (key: FilterParamKey, value: string | null) => void;
}

function BrowseFilterBar({ filters, context, placeholder, setFilter }: FilterBarProps) {
  const isPlugins = context.componentType === "plugin";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="filter-bar">
      <div className="w-full sm:w-80">
        <Input type="search" placeholder={placeholder} value={filters.query} onChange={(value) => setFilter("q", value)} />
      </div>
      <div className="hidden flex-1 sm:block" />
      {context.hasWrappers && (
        <FilterDropdown value={filters.kind ?? "all"} options={kindOptions} onChange={(value) => setFilter("kind", value)} allLabel="Kind" />
      )}
      {isPlugins && (
        <FilterDropdown value={filters.pluginType ?? "all"} options={pluginTypeOptions} onChange={(value) => setFilter("pluginType", value)} allLabel="Type" />
      )}
      {isPlugins && filters.pluginType === "wrapper" && (
        <FilterDropdown value={filters.capability ?? "all"} options={capabilityOptions} onChange={(value) => setFilter("ext", value)} allLabel="Capability" />
      )}
      <FilterDropdown value={filters.source ?? "all"} options={sourceOptions} onChange={(value) => setFilter("source", value)} allLabel="Source" />
      {filters.source === "seedr" && (
        <FilterDropdown value={filters.scope ?? "all"} options={scopeOptions} onChange={(value) => setFilter("scope", value)} allLabel="Scope" />
      )}
      {filters.source === "seedr" && context.labels.length > 0 && (
        <FilterDropdown value={filters.label ?? "all"} options={context.labels} onChange={(value) => setFilter("label", value)} allLabel="Label" />
      )}
      <FilterDropdown value={filters.tool ?? "all"} options={agentOptions} onChange={(value) => setFilter("tool", value)} allLabel="Coding Agent" />
      <SortDropdown
        field={filters.sortField}
        ascending={filters.sortAsc}
        onFieldChange={(value) => setFilter("sortField", value)}
        onToggleDirection={() => setFilter("sortAsc", filters.sortAsc ? "false" : "true")}
        fields={sortFieldOptions}
      />
    </div>
  );
}

interface ActiveFiltersProps {
  filters: BrowseFilters;
  labels: FilterOption[];
  ignored: DroppedParam[];
  setFilter: (key: FilterParamKey, value: string | null) => void;
  resetFilters: () => void;
}

/** Every active filter as a removable chip, plus a reset action and the dropped-parameter notice. */
function ActiveFilters({ filters, labels, ignored, setFilter, resetFilters }: ActiveFiltersProps) {
  const chips = activeFilterChips(filters, labels);
  if (chips.length === 0 && ignored.length === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="active-filters">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => setFilter(chip.key, null)}
          aria-label={`Remove filter ${chip.label}: ${chip.value}`}
          className="inline-flex h-6 cursor-pointer items-center gap-1 border border-primary px-2 text-xs text-primary transition-colors hover:bg-secondary"
          data-testid="filter-chip"
        >
          <span className="text-muted-foreground">{chip.label}:</span>
          <span>{chip.value}</span>
          <X className="size-3" aria-hidden />
        </button>
      ))}
      {chips.length > 0 && (
        <Button variant="outline" size="xs" onClick={resetFilters} className="h-6 text-destructive" data-testid="reset-filters">
          <X className="size-3" />
          reset filters
        </Button>
      )}
      {ignored.length > 0 && (
        <p role="status" className="basis-full text-xs text-muted-foreground" data-testid="ignored-filters">
          Ignored from the URL: {ignored.map((param) => `${param.key}=${param.value} (${param.reason})`).join("; ")}.
          {chips.length === 0 && (
            <>
              {" "}
              <button type="button" onClick={resetFilters} className="link-quiet cursor-pointer">
                reset filters
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function BrowseResults({
  items,
  componentType,
  setFilter,
  filters,
}: {
  items: RegistryItem[];
  componentType: ComponentType;
  filters: BrowseFilters;
  setFilter: (key: FilterParamKey, value: string | null) => void;
}) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-subtext">No {typeLabelPlural[componentType].toLowerCase()} found</p>;
  }
  const isPlugins = componentType === "plugin";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="results-grid">
      {items.map((item) => (
        <ItemCard
          key={`${item.slug}-${item.type}-${item.pluginType ?? ""}`}
          item={item}
          browseType={componentType}
          onSourceClick={(source) => setFilter("source", source)}
          onScopeClick={(scope) => setFilter("scope", scope)}
          onToolClick={(tool) => setFilter("tool", tool)}
          onPluginTypeClick={isPlugins ? (pluginType) => setFilter("pluginType", pluginType) : undefined}
          onDateClick={() => setFilter(filters.sortField === "updated" ? "sortAsc" : "sortField", filters.sortField === "updated" ? (filters.sortAsc ? "false" : "true") : "updated")}
        />
      ))}
    </div>
  );
}

function BrowsePage({ componentType }: { componentType: ComponentType }) {
  const { items, filteredItems, filters, context, ignored, setFilter, resetFilters } = useBrowseFilters(componentType);
  const label = typeLabelPlural[componentType];
  usePageMeta(categoryMeta(componentType, items.length));

  return (
    <div className="mx-auto max-w-[var(--content-w)] px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 flex items-center gap-2 text-lg font-bold text-text">
          <TypeIcon type={componentType} size={20} className={typeTextColors[componentType]} />
          {label}
        </h1>
        <p className="text-subtext" aria-live="polite">
          {filteredItems.length} {pluralize(componentType, filteredItems.length)} available
          {items.length !== filteredItems.length && <span className="text-text-dim"> (filtered from {items.length})</span>}
        </p>
      </div>

      <BrowseFilterBar filters={filters} context={context} placeholder={`Search ${label.toLowerCase()}...`} setFilter={setFilter} />
      <ActiveFilters filters={filters} labels={context.labels} ignored={ignored} setFilter={setFilter} resetFilters={resetFilters} />
      <BrowseResults items={filteredItems} componentType={componentType} filters={filters} setFilter={setFilter} />
    </div>
  );
}

export function Browse() {
  const { type } = useParams<{ type: string }>();
  useScrollRestoration();
  const componentType = type ? pathToType(type) : null;
  if (!componentType) return <NotFound />;
  // keyed so switching category resets every piece of page state
  return <BrowsePage key={componentType} componentType={componentType} />;
}
