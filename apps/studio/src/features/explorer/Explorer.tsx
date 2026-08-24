import { useMemo, useState } from "react";
import type { CanonicalCodingAgent, ComponentType } from "@seedr/shared";
import { AGENT_LABELS, ALL_TYPES, CANONICAL_AGENTS, canonicalAgents, typeDirName } from "@seedr/registry-ops/pure";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search, X } from "lucide-react";
import { countByType, type StudioItem } from "./registry";
import type { Selection } from "./store";

interface ExplorerProps {
  items: StudioItem[];
  problems: string[];
  selected: Selection | null;
  onSelect(selection: Selection): void;
}

const sameKey = (a: Selection | null, type: ComponentType, slug: string) => a?.type === type && a.slug === slug;

// One fixed slot per canonical agent, in canonical order — `cgaxo` reads like a
// permission string: a letter when the item supports the agent, `-` when not.
const AGENT_SLOT: Record<CanonicalCodingAgent, string> = {
  claude: "c",
  copilot: "g",
  antigravity: "a",
  codex: "x",
  opencode: "o",
};

export function agentMatrix(compatibility: readonly unknown[]): { text: string; tip: string } {
  const supported = new Set(canonicalAgents(compatibility));
  const text = CANONICAL_AGENTS.map((agent) => (supported.has(agent) ? AGENT_SLOT[agent] : "-")).join("");
  const names = CANONICAL_AGENTS.filter((agent) => supported.has(agent)).map((agent) => AGENT_LABELS[agent]);
  return { text, tip: names.length > 0 ? `for ${names.join(", ")}` : "for no agent" };
}

/** `rw-` when the item is this registry's own (editable); `r--` when a sync owns it. */
export function sourceMode(sourceType: string | undefined): { text: string; tip: string } {
  if (sourceType === "toolr") return { text: "rw-", tip: "toolr — this registry's own item; editable here" };
  return { text: "r--", tip: `${sourceType ?? "synced"} — refreshed by the sync; read-only here` };
}

const matches = (item: StudioItem, query: string): boolean => {
  const needle = query.toLowerCase();
  return item.slug.toLowerCase().includes(needle) || (item.item.name ?? "").toLowerCase().includes(needle);
};

/**
 * The registry by type: collapsible groups with counts, a search that narrows
 * every group at once, and per row the `rw-`/`r--` ownership mode plus the
 * agent matrix — which coding agents the capability is for.
 */
export function Explorer({ items, problems, selected, onSelect }: ExplorerProps) {
  const counts = countByType(items);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<ComponentType>>(new Set());

  const populatedTypes = useMemo(() => ALL_TYPES.filter((type) => items.some((i) => i.type === type)), [items]);
  const searching = query.trim().length > 0;

  const toggle = (type: ComponentType) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (items.length === 0 && problems.length === 0) {
    return (
      <div className="p-6 text-muted-foreground" data-testid="empty-registry">
        <p className="prompt">ls registry/</p>
        <p className="mt-4">This registry has no items yet.</p>
        <p className="mt-2 text-xs">Add the first one with “add capability” above, or with <code className="text-primary">/add-toolr</code> in Claude Code.</p>
      </div>
    );
  }

  const allCollapsed = populatedTypes.every((type) => collapsed.has(type));
  return (
    <nav aria-label="Registry" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Explorer</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(populatedTypes))}
          aria-label={allCollapsed ? "expand all groups" : "collapse all groups"}
          className="text-muted-foreground hover:text-primary"
        >
          {allCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
        </button>
      </div>
      <div className="relative shrink-0 border-b border-border px-3 py-2">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-5 size-3 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="search capabilities…"
          aria-label="search capabilities"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full pr-6 pl-6 text-xs"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="clear search"
            className="absolute top-1/2 right-5 -translate-y-1/2 text-muted-foreground hover:text-primary"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {problems.length > 0 && (
          <section className="mb-4 border border-destructive p-3 text-xs" role="alert">
            <p className="font-bold text-destructive">{problems.length} unreadable item file(s)</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </section>
        )}
        {populatedTypes.map((type) => {
          const ofType = items.filter((i) => i.type === type).filter((i) => !searching || matches(i, query.trim()));
          // While searching, a group only shows when it still has matches.
          if (searching && ofType.length === 0) return null;
          const isCollapsed = !searching && collapsed.has(type);
          return (
            <section key={type} className="mb-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggle(type)}
                className="flex w-full items-center gap-1 px-1 py-0.5 text-left text-xs font-bold tracking-wide text-primary hover:bg-muted"
              >
                {isCollapsed ? <ChevronRight className="size-3 shrink-0" /> : <ChevronDown className="size-3 shrink-0" />}
                {typeDirName(type)}/ <span className="font-normal text-muted-foreground">{searching ? `${ofType.length}/${counts[type]}` : counts[type]}</span>
              </button>
              {!isCollapsed && (
                <ul>
                  {ofType.map(({ slug, item, errors }) => {
                    const active = sameKey(selected, type, slug);
                    const mode = sourceMode(item.sourceType);
                    const agents = agentMatrix(item.compatibility ?? []);
                    return (
                      <li key={slug}>
                        <button
                          type="button"
                          aria-current={active ? "true" : undefined}
                          onClick={() => onSelect({ type, slug })}
                          className={`flex w-full items-center gap-2 px-2 py-0.5 text-left text-xs hover:bg-muted ${active ? "bg-muted text-primary" : ""}`}
                        >
                          <span data-tip={mode.tip} className="shrink-0 text-muted-foreground/75">
                            {mode.text}
                          </span>
                          <span data-tip={agents.tip} className="shrink-0 text-muted-foreground/75">
                            {agents.text}
                          </span>
                          <span className="truncate">{item.name ?? slug}</span>
                          {errors.length > 0 && (
                            <span className="text-destructive" data-tip={`${errors.length} validation problem(s)`} aria-label={`${errors.length} validation problems`}>
                              !
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {searching && populatedTypes.every((type) => items.filter((i) => i.type === type).filter((i) => matches(i, query.trim())).length === 0) && (
          <p className="p-3 text-xs text-muted-foreground">No capability matches “{query.trim()}”.</p>
        )}
      </div>
    </nav>
  );
}
