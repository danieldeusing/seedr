import { useCallback, useEffect, useRef, useState } from "react";
import type { FileTreeNode } from "@seedr/shared";
import { formatErrors, isFirstParty } from "@seedr/registry-ops/pure";
import { fs, openPath } from "@/api/fs";
import { safeExternalUrl, useExternalLink } from "@/core/externalUrl";
import { PaneResizeHandle } from "@/core/PaneResizeHandle";
import { useStudio } from "./store";
import { useRememberedSize } from "@/core/remembered";
import { SafeMarkdown } from "@/core/ui/SafeMarkdown";
import { loadFileTree, type StudioItem } from "./registry";
import { FileExplorer } from "./FileExplorer";
import { RemoveButton } from "./RemoveButton";
import { SourcePanel } from "./SourcePanel";
import { NO_OPS, useCanMutate } from "./repoCapability";
import { testRefusal } from "@/features/test/testStore";
import { FlaskConical, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil } from "lucide-react";
import { IconButton } from "@/core/ui/IconButton";

interface DetailProps {
  item: StudioItem;
  onEdit?(): void;
  onTest?(): void;
}

const FIELDS = ["name", "type", "slug", "version", "sourceType", "description", "compatibility", "author", "externalUrl", "targetScope", "pluginType", "updatedAt", "contentHash"] as const;

function renderValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).filter(Boolean).join(" · ");
  return String(value);
}

/** A value that goes somewhere: the forward doc-link, gated by the open-in-browser dialog. */
function ExternalValue({ url, label }: { url: string; label: string }) {
  const request = useExternalLink((s) => s.request);
  // `local://<path>` names a registry the site serves itself — a private
  // instance's items all carry one, because their repository is private and a
  // raw GitHub URL would 404. There is nowhere for a browser to go, so it reads
  // as the value it is instead of as a link that does nothing when clicked.
  if (!safeExternalUrl(url)) return <>{label}</>;
  return (
    <button type="button" className="doc-link doc-link--forward break-all" onClick={() => request(url)}>
      {label}
    </button>
  );
}

/** The item.json fields, with the two values that go somewhere as gated links. */
function MetaFields({ item }: { item: StudioItem["item"] }) {
  const author = item.author;
  return (
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-xs">
            {FIELDS.map((field) => (
              <div key={field} className="contents">
                <dt className="text-primary">{field}</dt>
                <dd className="break-words text-muted-foreground">
                  {field === "externalUrl" && typeof item.externalUrl === "string" ? (
                    <ExternalValue url={item.externalUrl} label={item.externalUrl} />
                  ) : field === "author" && author ? (
                    <>
                      {author.name}
                      {author.url && (
                        <>
                          {" · "}
                          <ExternalValue url={author.url} label={author.url} />
                        </>
                      )}
                    </>
                  ) : (
                    renderValue(item[field])
                  )}
                </dd>
              </div>
            ))}
          </dl>
  );
}

/** One item: its metadata, its validation state, its files — read-only. */
/** Below this pane width the meta column stacks on top of the files. */
const STACK_BELOW_PX = 860;

export function Detail({ item, onEdit, onTest }: DetailProps) {
  const hasOps = useCanMutate();
  const [tree, setTree] = useState<FileTreeNode[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [metaWidth, setMetaWidth] = useRememberedSize("studio-meta-width", 340);
  const [metaCollapsed, setMetaCollapsed] = useState(false);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [stacked, setStacked] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStacked(entry.contentRect.width < STACK_BELOW_PX);
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  /**
   * How many times the registry has been reloaded.
   *
   * A dependency, not decoration: an item's path is the same after its files
   * change on disk, so neither the tree nor the preview has any other way to
   * know that what it read is stale. Without it, a file edited or restored
   * outside the app looked like the app ignoring it.
   */
  const revision = useStudio((state) => state.revision);

  useEffect(() => {
    let cancelled = false;
    setTree(null);
    setTreeError(null);
    loadFileTree(fs, item.dir).then(
      (nodes) => {
        if (!cancelled) setTree(nodes);
      },
      (error: Error) => {
        if (!cancelled) setTreeError(error.message);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [item.dir, revision]);

  const fetchContent = useCallback((relativePath: string) => fs.readText(`${item.dir}/${relativePath}`), [item.dir, revision]);

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="prompt text-xs">cat {item.dir}/item.json</p>
            <h1 className="glow mt-2 text-xl font-bold">{item.item.name ?? item.slug}</h1>
          </div>
          <span className="flex items-center gap-3">
            {onTest && !testRefusal(item) && (
              <IconButton
                icon={FlaskConical}
                ariaLabel={`test install ${item.slug}`}
                tip={hasOps ? "test install — the real CLI, into a scratch directory" : NO_OPS}
                onClick={onTest}
                disabled={!hasOps}
              />
            )}
            {onEdit && isFirstParty(item.item.sourceType) && (
              <IconButton icon={Pencil} ariaLabel={`edit ${item.slug}`} tip={hasOps ? "edit this item" : NO_OPS} onClick={onEdit} disabled={!hasOps} />
            )}
            <RemoveButton item={item} />
          </span>
        </div>
        {item.errors.length > 0 && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            Invalid: {formatErrors(item.errors)}
          </p>
        )}
      </header>
      <div ref={bodyRef} className={`flex min-h-0 flex-1 overflow-hidden ${stacked ? "flex-col" : ""}`}>
        {metaCollapsed ? (
          <CollapsedStrip side="left" label="meta" tip="show metadata" stacked={stacked} onExpand={() => setMetaCollapsed(false)} />
        ) : (
          <div
            style={stacked || filesCollapsed ? undefined : { width: metaWidth }}
            className={`flex shrink-0 flex-col overflow-hidden ${stacked ? "max-h-[45%] border-b border-border" : "border-r border-border"} ${filesCollapsed && !stacked ? "min-w-0 flex-1" : ""}`}
            data-testid="meta-pane"
          >
            <div className="flex h-[28px] shrink-0 items-center gap-2 border-b border-border px-3">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">meta</span>
              <span className="flex-1" />
              <button type="button" onClick={() => setMetaCollapsed(true)} aria-label="hide metadata" data-tip="hide metadata" className="text-muted-foreground hover:text-primary">
                <PanelLeftClose className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <MetaFields item={item.item} />
          <SourcePanel item={item} />
          {item.item.longDescription && (
            <section className="mt-6">
              <p className="prompt text-xs">cat "tl;dr.md"</p>
              {/* The TL;DR is written in markdown by contract — bullets, bold
                  category names, backticked identifiers — so it is read as
                  markdown rather than shown as its own source. */}
              <div className="formatted-preview mt-2 text-xs text-muted-foreground">
                <SafeMarkdown>{item.item.longDescription}</SafeMarkdown>
              </div>
            </section>
          )}
            </div>
          </div>
        )}
        {!metaCollapsed && !filesCollapsed && !stacked && (
          <PaneResizeHandle label="resize metadata" onResize={(delta) => setMetaWidth((width) => Math.max(240, width + delta))} />
        )}
        {filesCollapsed ? (
          <CollapsedStrip side="right" label="content" tip="show content" stacked={stacked} onExpand={() => setFilesCollapsed(false)} />
        ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-[28px] shrink-0 items-center gap-2 border-b border-border px-3">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">content</span>
            <span className="flex-1" />
            <button type="button" onClick={() => setFilesCollapsed(true)} aria-label="hide content" data-tip="hide content" className="text-muted-foreground hover:text-primary">
              <PanelRightClose className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-4">
          <ContentBody
            tree={tree}
            treeError={treeError}
            slug={item.slug}
            onFetchContent={fetchContent}
            onOpenFile={(rel) => void openPath(`${item.dir}/${rel}`)}
          />
          </div>
        </div>
        )}
      </div>
    </article>
  );
}

interface ContentBodyProps {
  tree: FileTreeNode[] | null;
  treeError: string | null;
  slug: string;
  onFetchContent(relativePath: string): Promise<string>;
  onOpenFile(relativePath: string): void;
}

/** The content zone's four states: error, loading, metadata-only, or the explorer. */
function ContentBody({ tree, treeError, slug, onFetchContent, onOpenFile }: ContentBodyProps) {
  if (treeError) {
    return (
      <p className="text-sm text-red-400" role="alert">
        {treeError}
      </p>
    );
  }
  if (tree === null) return <p className="text-sm text-neutral-500">loading…</p>;
  if (tree.length === 0) return <p className="text-sm text-neutral-500">metadata only — no content files</p>;
  return <FileExplorer files={tree} rootName={slug} onFetchContent={onFetchContent} onOpenFile={onOpenFile} />;
}

interface CollapsedStripProps {
  side: "left" | "right";
  label: string;
  tip: string;
  stacked: boolean;
  onExpand(): void;
}

/** What a hidden pane leaves behind: a slim strip that names it and brings it back. */
function CollapsedStrip({ side, label, tip, stacked, onExpand }: CollapsedStripProps) {
  const Icon = side === "left" ? PanelLeftOpen : PanelRightOpen;
  if (stacked) {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={tip}
        data-tip={tip}
        className={`flex h-8 shrink-0 items-center gap-2 px-3 text-xs font-bold tracking-wider text-muted-foreground uppercase hover:text-primary ${side === "left" ? "border-b" : "border-t"} border-border`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={tip}
      data-tip={tip}
      className={`flex w-8 shrink-0 flex-col items-center gap-2 pt-2 text-xs font-bold tracking-wider text-muted-foreground uppercase hover:text-primary ${side === "left" ? "border-r" : "border-l"} border-border`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span aria-hidden="true" style={{ writingMode: "vertical-rl" }}>
        {label}
      </span>
    </button>
  );
}
