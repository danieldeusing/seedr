import { useMemo, useState } from "react";
import type { CanonicalCodingAgent, ComponentType } from "@seedr/shared";
import { AGENT_LABELS, ALL_TYPES, CANONICAL_AGENTS, canonicalAgents, isFirstParty, typeDirName } from "@seedr/registry-ops/pure";
import { RepoMenu } from "./RepoMenu";
import { useStudio } from "./store";
import { ArrowDownToLine, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, FolderX, GitBranch, GitCompareArrows, Pencil, PencilLine, Plus, Rows3, Settings, Unlink } from "lucide-react";
import { IconButton } from "@/core/ui/IconButton";
import { Input } from "@/core/ui/Input";
import { CodingAgentIcon } from "@/core/CodingAgentIcon";
import { useRowStyle, type RowStyle } from "@/core/rowStyle";
import { ThemeMenu } from "@/core/ThemeMenu";
import { countByType, type StudioItem } from "./registry";
import { NO_OPS, useCanMutate } from "./repoCapability";
import type { Selection } from "./store";

interface ExplorerProps {
  items: StudioItem[];
  problems: string[];
  selected: Selection | null;
  onSelect(selection: Selection): void;
  /** The explorer owns the workspace controls, configr-style: add in the header, the rest in the footer. */
  onAddCapability(): void;
  onGitStatus(): void;
  onSettings(): void;
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
export function sourceMode(sourceType: string | undefined): { text: string; editable: boolean; tip: string } {
  if (isFirstParty(sourceType)) return { text: "rw-", editable: true, tip: "seedr — this registry's own item; editable here" };
  return { text: "r--", editable: false, tip: `${sourceType ?? "synced"} — refreshed by the sync; read-only here` };
}

/** The row's two indicators, as brand marks or as the `rw-`/`cgaxo` text. */
/**
 * A mark on the row when an item and the folder it was copied from have parted
 * company. Nothing is shown for `current`, or for an item that records no
 * origin: an unmarked row means there is nothing to answer for, which is most
 * of them.
 */
const SOURCE_MARK: Record<string, { icon: typeof Pencil; tone: string; tip: string }> = {
  behind: { icon: ArrowDownToLine, tone: "text-amber-400", tip: "The source folder has changed — this item is behind it" },
  edited: { icon: PencilLine, tone: "text-primary", tip: "Edited here since the last copy from its source folder" },
  diverged: { icon: GitCompareArrows, tone: "text-destructive", tip: "The source folder and this item have each changed" },
  missing: { icon: FolderX, tone: "text-destructive", tip: "The source folder it was copied from is gone" },
  orphaned: { icon: Unlink, tone: "text-amber-400", tip: "Its source folder is remembered, but the item is not in this checkout — another branch, or removed" },
};

/** The mark for one row, or undefined when it has nothing to answer for. */
function useSourceMark(type: string, slug: string) {
  const state = useStudio((store) => store.sourceStates[`${type}/${slug}`]?.state);
  return state ? SOURCE_MARK[state] : undefined;
}

/**
 * One capability in the list. Its own component because the source mark is read
 * from the store, and a hook cannot be called inside the loop that renders these.
 */
function CapabilityRow({
  type,
  slug,
  item,
  errors,
  active,
  rowStyle,
  onSelect,
}: {
  type: ComponentType;
  slug: string;
  item: StudioItem["item"];
  errors: number;
  active: boolean;
  rowStyle: RowStyle;
  onSelect(selection: { type: ComponentType; slug: string }): void;
}) {
  const mark = useSourceMark(type, slug);
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={() => onSelect({ type, slug })}
      className={`flex w-full cursor-pointer items-center gap-3 px-2 py-0.5 text-left text-sm transition-colors ${active ? "bg-violet-500/20 text-neutral-200" : "text-neutral-300 hover:bg-neutral-960/50 hover:text-neutral-200"}`}
    >
      <RowIndicators item={item} style={rowStyle} />
      {/* The name takes the mark's colour as well as the icon: on a wide explorer
          the icon sits at the far edge, and a colour on the name keeps the sign
          next to the thing it is about. */}
      <span className={`truncate ${mark ? `font-medium ${mark.tone}` : ""}`}>{item.name ?? slug}</span>
      {mark && (
        <span className={`source-mark ml-auto shrink-0 ${mark.tone}`} data-tip={mark.tip} aria-label={mark.tip} role="img">
          <mark.icon className="size-3" aria-hidden="true" />
        </span>
      )}
      {errors > 0 && (
        <span className={`${mark ? "" : "ml-auto "}text-destructive`} data-tip={`${errors} validation problem(s)`} aria-label={`${errors} validation problems`}>
          !
        </span>
      )}
    </button>
  );
}

function RowIndicators({ item, style }: { item: StudioItem["item"]; style: RowStyle }) {
  const mode = sourceMode(item.sourceType);
  if (style === "text") {
    const agents = agentMatrix(item.compatibility ?? []);
    return (
      <>
        <span data-tip={mode.tip} className="shrink-0 text-neutral-500">
          {mode.text}
        </span>
        <span data-tip={agents.tip} className="shrink-0 text-neutral-500">
          {agents.text}
        </span>
      </>
    );
  }
  const supported = new Set(canonicalAgents(item.compatibility ?? []));
  return (
    <>
      {/* only the editable state is marked; read-only is the unmarked default */}
      <span data-tip={mode.editable ? mode.tip : undefined} className="w-3 shrink-0 text-neutral-500">
        {mode.editable && <Pencil className="size-3" aria-label="editable" />}
      </span>
      <span className="flex w-16 shrink-0 items-center gap-0.5">
        {CANONICAL_AGENTS.filter((agent) => supported.has(agent)).map((agent) => (
          <CodingAgentIcon key={agent} agent={agent} />
        ))}
      </span>
    </>
  );
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
export function Explorer({ items, problems, selected, onSelect, onAddCapability, onGitStatus, onSettings }: ExplorerProps) {
  const counts = countByType(items);
  const hasOps = useCanMutate();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<ComponentType>>(new Set());
  const rowStyle = useRowStyle((s) => s.style);
  const sourceCheckError = useStudio((store) => store.sourceCheckError);
  const uncommitted = useStudio((store) => store.uncommitted);
  // Only a fetch that got through can say this; `behind` is 0 both when the
  // checkout is current and when it never managed to ask, and those must not
  // look alike. The title bar carries the unreachable case in words.
  const remote = useStudio((store) => store.remote);
  const behind = remote?.fetched ? remote.behind : 0;
  const setRowStyle = useRowStyle((s) => s.setStyle);

  // Every type is listed, empty ones included: a registry with no agents is a
  // fact about it, and hiding the group makes the gap look like a missing
  // feature. While searching, only the groups that still match are shown.
  const populatedTypes = useMemo(() => ALL_TYPES.filter((type) => items.some((i) => i.type === type)), [items]);
  const searching = query.trim().length > 0;
  const shownTypes = searching ? populatedTypes : ALL_TYPES;

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
        <p className="mt-2 text-xs">
          Add the first one with <code className="text-primary">/add-seedr</code> in Claude Code, or right here:
        </p>
        <span className="mt-3 inline-flex items-center gap-2">
          <IconButton icon={Plus} ariaLabel="add capability" tip={hasOps ? "Add a capability to the registry" : NO_OPS} accentColor="violet" onClick={onAddCapability} disabled={!hasOps} />
          <span className="text-sm text-neutral-500">add capability</span>
        </span>
      </div>
    );
  }

  const allCollapsed = populatedTypes.every((type) => collapsed.has(type));
  return (
    <nav aria-label="Registry" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-[36px] shrink-0 items-center gap-1.5 border-b border-neutral-700 bg-neutral-800/40 px-3">
        <span className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Explorer</span>
        <span className="flex-1" />
        <IconButton icon={Plus} ariaLabel="add capability" tip={hasOps ? "Add a capability to the registry" : NO_OPS} accentColor="violet" size="xs" onClick={onAddCapability} disabled={!hasOps} />
        <IconButton
          icon={allCollapsed ? ChevronsUpDown : ChevronsDownUp}
          ariaLabel={allCollapsed ? "expand all groups" : "collapse all groups"}
          tip={allCollapsed ? "expand all groups" : "collapse all groups"}
          size="xs"
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(ALL_TYPES))}
        />
      </div>
      <div className="flex shrink-0 items-center border-b border-neutral-700 px-3 py-2">
        <Input value={query} onChange={setQuery} placeholder="search capabilities…" ariaLabel="search capabilities" search variant="filled" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sourceCheckError && (
          <section className="mb-4 border-l-2 border-l-amber-500 py-1 pl-2.5 text-sm" role="alert">
            <p className="font-medium text-amber-400">Source marks unavailable</p>
            <p className="mt-1 text-neutral-500">{sourceCheckError}</p>
          </section>
        )}
        {problems.length > 0 && (
          <section className="mb-4 border-l-2 border-l-red-500 py-1 pl-2.5 text-sm" role="alert">
            <p className="font-medium text-red-400">{problems.length} unreadable item file(s)</p>
            <ul className="mt-1 space-y-1 text-neutral-500">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </section>
        )}
        {shownTypes.map((type) => {
          const ofType = items.filter((i) => i.type === type).filter((i) => !searching || matches(i, query.trim()));
          // While searching, a group only shows when it still has matches.
          if (searching && ofType.length === 0) return null;
          const empty = ofType.length === 0;
          const isCollapsed = (!searching && collapsed.has(type)) || empty;
          return (
            <section key={type} className="mb-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => (empty ? undefined : toggle(type))}
                data-tip={empty ? `No ${typeDirName(type)} in this registry yet` : undefined}
                aria-disabled={empty || undefined}
                className={`flex w-full items-center gap-1 px-1 py-0.5 text-left text-sm font-medium transition-colors ${empty ? "cursor-default text-neutral-600" : "cursor-pointer text-accent-400 hover:bg-neutral-960/50"}`}
              >
                {empty ? <ChevronRight className="size-3 shrink-0 opacity-40" /> : isCollapsed ? <ChevronRight className="size-3 shrink-0" /> : <ChevronDown className="size-3 shrink-0" />}
                {typeDirName(type)}/ <span className="font-normal text-neutral-500">{searching ? `${ofType.length}/${counts[type]}` : counts[type]}</span>
              </button>
              {!isCollapsed && (
                <ul>
                  {ofType.map(({ slug, item, errors }) => {
                    return (
                      <li key={slug}>
                        <CapabilityRow
                          type={type}
                          slug={slug}
                          item={item}
                          errors={errors.length}
                          active={sameKey(selected, type, slug)}
                          rowStyle={rowStyle}
                          onSelect={onSelect}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {searching && populatedTypes.every((type) => items.filter((i) => i.type === type).filter((i) => matches(i, query.trim())).length === 0) && (
          <p className="p-3 text-sm text-neutral-500">No capability matches “{query.trim()}”.</p>
        )}
      </div>
      <div className="flex h-[36px] shrink-0 items-center gap-1.5 border-t border-neutral-700 px-2">
        <details className="dropdown relative">
          <summary aria-label={`row style: ${rowStyle}`} data-tip="How rows show ownership and agents" className="flex h-7 w-9 cursor-pointer list-none items-center justify-center gap-0.5 border border-neutral-500/30 text-neutral-400 transition-colors hover:border-neutral-500/40 hover:bg-neutral-500/20 hover:text-neutral-300">
            <Rows3 className="size-3.5" aria-hidden="true" />
            <ChevronDown className="size-3 rotate-180" aria-hidden="true" />
          </summary>
          <div className="absolute bottom-full left-0 z-[9999] mb-2 overflow-hidden border border-neutral-600 bg-[var(--popover)] py-1 whitespace-nowrap shadow-xl" role="menu" aria-label="row style">
            {(["icons", "text"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="menuitem"
                className={`flex w-full cursor-pointer items-center gap-2 px-4 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700 ${option === rowStyle ? "bg-violet-500/20 text-neutral-200" : "text-neutral-400"}`}
                aria-current={option === rowStyle ? "true" : undefined}
                onClick={(event) => {
                  setRowStyle(option);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                {option === "icons" ? "icons" : "text (rw- · cgaxo)"}
              </button>
            ))}
          </div>
        </details>
        <ThemeMenu direction="up" align="left" />
        <span className="relative inline-flex">
          <IconButton
            icon={GitBranch}
            ariaLabel="git"
            tip={[
              behind > 0 ? `${behind} commit(s) on ${remote?.upstream ?? "the remote"} not pulled yet — this list is out of date` : "",
              uncommitted > 0 ? `${uncommitted} uncommitted path(s) — every registry operation refuses until they are committed` : "",
            ]
              .filter(Boolean)
              .join(" · ") || "Branch, changes, and publishing them"}
            onClick={onGitStatus}
          />
          {uncommitted > 0 && (
            <span className="count-badge" aria-label={`${uncommitted} uncommitted paths`}>
              {uncommitted > 99 ? "99+" : uncommitted}
            </span>
          )}
          {behind > 0 && (
            <span className="behind-badge" aria-label={`${behind} commits to pull`}>
              {behind > 99 ? "99+" : behind}
            </span>
          )}
        </span>
        <IconButton icon={Settings} ariaLabel="settings" tip="Coding agents Studio can run" onClick={onSettings} />
        <span className="flex-1" />
        <RepoMenu />
      </div>
    </nav>
  );
}
