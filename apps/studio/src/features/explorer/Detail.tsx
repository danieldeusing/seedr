import { useCallback, useEffect, useState } from "react";
import type { FileTreeNode } from "@seedr/shared";
import { formatErrors } from "@seedr/registry-ops/pure";
import { fs, openPath } from "@/api/fs";
import { useExternalLink } from "@/core/externalUrl";
import { loadFileTree, type StudioItem } from "./registry";
import { FileExplorer } from "./FileExplorer";
import { RemoveButton } from "./RemoveButton";
import { testRefusal } from "@/features/test/testStore";

interface DetailProps {
  item: StudioItem;
  onEdit?(): void;
  onTest?(): void;
}

const FIELDS = ["name", "type", "slug", "sourceType", "description", "compatibility", "author", "externalUrl", "targetScope", "pluginType", "updatedAt", "contentHash"] as const;

function renderValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).filter(Boolean).join(" · ");
  return String(value);
}

/** A value that goes somewhere: the forward doc-link, gated by the open-in-browser dialog. */
function ExternalValue({ url, label }: { url: string; label: string }) {
  const request = useExternalLink((s) => s.request);
  return (
    <button type="button" className="doc-link doc-link--forward break-all" onClick={() => request(url)}>
      {label}
    </button>
  );
}

/** One item: its metadata, its validation state, its files — read-only. */
export function Detail({ item, onEdit, onTest }: DetailProps) {
  const [tree, setTree] = useState<FileTreeNode[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);

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
  }, [item.dir]);

  const fetchContent = useCallback((relativePath: string) => fs.readText(`${item.dir}/${relativePath}`), [item.dir]);

  const author = item.item.author;
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
              <button type="button" onClick={onTest} className="btn-terminal btn-terminal--ghost btn-terminal--compact">
                test install
              </button>
            )}
            {onEdit && item.item.sourceType === "toolr" && (
              <button type="button" onClick={onEdit} className="btn-terminal btn-terminal--ghost btn-terminal--compact btn-terminal--edit" aria-label={`edit ${item.slug}`} />
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
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] overflow-hidden">
        <div className="overflow-y-auto border-r border-border p-6">
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-xs">
            {FIELDS.map((field) => (
              <div key={field} className="contents">
                <dt className="text-primary">{field}</dt>
                <dd className="break-words text-muted-foreground">
                  {field === "externalUrl" && typeof item.item.externalUrl === "string" ? (
                    <ExternalValue url={item.item.externalUrl} label={item.item.externalUrl} />
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
                    renderValue(item.item[field])
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {item.item.longDescription && (
            <section className="mt-6">
              <p className="prompt text-xs">cat "tl;dr.md"</p>
              <p className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{item.item.longDescription}</p>
            </section>
          )}
        </div>
        <div className="min-h-0 overflow-hidden p-4">
          {treeError ? (
            <p className="text-xs text-destructive" role="alert">
              {treeError}
            </p>
          ) : tree === null ? (
            <p className="text-xs text-muted-foreground">loading…</p>
          ) : tree.length === 0 ? (
            <p className="text-xs text-muted-foreground">metadata only — no content files</p>
          ) : (
            <FileExplorer files={tree} rootName={item.slug} onFetchContent={fetchContent} onOpenFile={(rel) => void openPath(`${item.dir}/${rel}`)} />
          )}
        </div>
      </div>
    </article>
  );
}
