import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useUpdateParams } from "@/hooks/useUpdateParams";
import Fuse from "fuse.js";
// toolr-design-ignore-next-line
import { Sprout, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip";
import { FilterDropdown } from "@/components/FilterDropdown";
import { ItemCard } from "@/components/ItemCard";
import { typeIcons } from "@/components/TypeIcon";
import { getAllItems, getTypeCounts, fuseOptions } from "@/lib/registry";
import { pluralize } from "@/lib/text";
import type { ComponentType, CodingAgent, SourceType, ScopeType } from "@/lib/types";
import { typeTextColors, typeLabelPlural } from "@/lib/colors";

// Only descriptions for types shown on home page
const typeDescriptions: Record<ComponentType, string> = {
  skill: "Reusable prompts and workflows",
  hook: "Event-driven automation",
  agent: "Autonomous task runners",
  plugin: "Extended functionality",
  command: "CLI shortcuts and aliases",
  settings: "Configuration presets",
  mcp: "Model Context Protocol servers",
};

const displayTypes: ComponentType[] = [
  "skill",
  "hook",
  "agent",
  "plugin",
  "command",
  "settings",
  "mcp",
];

import { agentOptions, sourceOptions, scopeOptions } from "@/lib/filterOptions";

export function Home() {
  const { searchParams, setSearchParams, updateParams } = useUpdateParams();
  useScrollRestoration();

  // Read state from URL search params
  const query = searchParams.get("q") ?? "";
  const toolFilter = (searchParams.get("tool") as CodingAgent | null);
  const sourceFilter = (searchParams.get("source") as SourceType | null);
  const scopeFilter = (searchParams.get("scope") as ScopeType | null);

  const setQuery = (value: string) => {
    // When clearing query, also clear filters
    if (!value) {
      setSearchParams({}, { replace: true });
    } else {
      updateParams({ q: value });
    }
  };
  const setToolFilter = (value: string) => updateParams({ tool: value || null });
  const setSourceFilter = (value: string) => {
    // Clear scope filter when switching away from toolr
    if (value !== "toolr") {
      updateParams({ source: value || null, scope: null });
    } else {
      updateParams({ source: value });
    }
  };
  const setScopeFilter = (value: string) => updateParams({ scope: value || null });

  const allItems = getAllItems();
  const counts = getTypeCounts();

  const fuse = useMemo(() => new Fuse(allItems, fuseOptions), [allItems]);

  const searchResults = useMemo(() => {
    if (!query) return null;

    let results = fuse.search(query).map((r) => r.item);

    if (toolFilter) {
      results = results.filter((item) => item.compatibility.includes(toolFilter));
    }

    if (sourceFilter) {
      results = results.filter((item) => (item.sourceType ?? "toolr") === sourceFilter);
    }

    if (scopeFilter) {
      results = results.filter((item) => (item.targetScope ?? "project") === scopeFilter);
    }

    return results;
  }, [query, toolFilter, sourceFilter, scopeFilter, fuse]);

  const hasActiveFilters = toolFilter !== null || sourceFilter !== null || scopeFilter !== null;

  const resetFilters = () => {
    updateParams({ tool: null, source: null, scope: null });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero */}
      <div className="text-center mb-8">
        <Sprout className="w-6 h-6 text-primary mx-auto mb-2" />
        <h1 className="text-md text-primary mb-8">
          Seed your Coding Agents with capabilities
        </h1>

        <div className="max-w-md mx-auto">
          <Input
            type="search"
            placeholder="Search skills, hooks, agents, MCP servers..."
            value={query}
            onChange={setQuery}
          />
        </div>
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text">
              {searchResults.length} {pluralize("result", searchResults.length)}{" "}
              for "{query}"
            </h2>

            <div className="flex items-center gap-2">
              <FilterDropdown
                value={sourceFilter ?? ""}
                options={sourceOptions}
                onChange={setSourceFilter}
                allLabel="Source"
              />

              {sourceFilter === "toolr" && (
                <FilterDropdown
                  value={scopeFilter ?? ""}
                  options={scopeOptions}
                  onChange={setScopeFilter}
                  allLabel="Scope"
                />
              )}

              <FilterDropdown
                value={toolFilter ?? ""}
                options={agentOptions}
                onChange={setToolFilter}
                allLabel="Coding Agent"
              />

              {hasActiveFilters && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      className="h-7 text-destructive"
                      aria-label="Reset all filters"
                      onClick={resetFilters}
                    >
                      <X className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset all filters</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((item) => (
                <ItemCard key={`${item.slug}-${item.type}-${item.pluginType ?? ""}`} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-subtext">No items found</p>
          )}
        </div>
      )}

      {/* Type Cards */}
      {!searchResults && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {displayTypes.map((type) => {
              const Icon = typeIcons[type];
              return (
                <Link
                  key={type}
                  to={`/${type}s`}
                  className="bg-surface border border-overlay rounded-lg p-3 text-center hover:border-overlay-hover hover:bg-active transition-all group"
                >
                  <Icon className={`w-8 h-8 mx-auto mb-3 ${typeTextColors[type]} opacity-60 group-hover:opacity-100 transition-opacity`} />
                  <div className="text-lg font-bold text-text mb-1">
                    {counts[type]}
                  </div>
                  <div className="text-sm text-text mb-2">{typeLabelPlural[type]}</div>
                  <div className="text-xs text-subtext">{typeDescriptions[type]}</div>
                </Link>
              );
            })}
          </div>

          {/* Curation notice */}
          <div className="mt-8 text-center text-sm text-text-dim max-w-2xl mx-auto">
            <p>
              Quality over quantity. One well-crafted capability beats a thousand mediocre ones.
              We only include official capabilities, first-party creations, and carefully
              vetted community contributions.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
