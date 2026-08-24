import { useEffect, useState } from "react";
import type { FileTreeNode } from "@seedr/shared";
import { formatErrors } from "@seedr/registry-ops/pure";
import { fs, openPath } from "@/api/fs";
import { loadFileTree, type StudioItem } from "./registry";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
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

/** One item: its metadata, its validation state, its files — read-only. */
export function Detail({ item, onEdit, onTest }: DetailProps) {
  const [tree, setTree] = useState<FileTreeNode[] | null>(null);
  const [file, setFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTree(null);
    setFile(null);
    loadFileTree(fs, item.dir).then((nodes) => {
      if (!cancelled) setTree(nodes);
    });
    return () => {
      cancelled = true;
    };
  }, [item.dir]);

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
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] overflow-hidden">
        <div className="overflow-y-auto border-r border-border p-6">
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-xs">
            {FIELDS.map((field) => (
              <div key={field} className="contents">
                <dt className="text-primary">{field}</dt>
                <dd className="break-words text-muted-foreground">{renderValue(item.item[field])}</dd>
              </div>
            ))}
          </dl>
          {item.item.longDescription && (
            <section className="mt-6">
              <p className="prompt text-xs">cat "tl;dr.md"</p>
              <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.item.longDescription}</p>
            </section>
          )}
          <section className="mt-6">
            <p className="prompt text-xs">tree {item.slug}/</p>
            {tree === null ? (
              <p className="mt-2 text-xs text-muted-foreground">loading…</p>
            ) : tree.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">metadata only — no content files</p>
            ) : (
              <FileTree nodes={tree} selected={file} onSelect={setFile} />
            )}
          </section>
        </div>
        <div className="min-h-0 overflow-hidden">
          {file ? (
            <FileViewer path={`${item.dir}/${file}`} onOpen={() => openPath(`${item.dir}/${file}`)} />
          ) : (
            <div className="p-6 text-xs text-muted-foreground">Select a file to read it.</div>
          )}
        </div>
      </div>
    </article>
  );
}
