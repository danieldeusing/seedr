import { useEffect, useState } from "react";
import { fs } from "@/api/fs";

interface FileViewerProps {
  /** Repo-relative path. */
  path: string;
  onOpen(): void;
}

type ViewerState = { kind: "loading" } | { kind: "text"; content: string } | { kind: "error"; message: string };

/**
 * Read-only text view. A syntax-highlighted <pre> rather than an editor: the
 * files are small markdown, shell and JSON, and "open with the default app" is
 * the path for anything more (plan §12).
 */
export function FileViewer({ path, onOpen }: FileViewerProps) {
  const [state, setState] = useState<ViewerState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fs.readText(path).then(
      (content) => {
        if (!cancelled) setState({ kind: "text", content });
      },
      (error: Error) => {
        if (!cancelled) setState({ kind: "error", message: error.message });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2 text-xs">
        <span className="truncate text-muted-foreground">{path}</span>
        <button type="button" onClick={onOpen} className="btn-terminal btn-terminal--ghost btn-terminal--compact">
          open with default app
        </button>
      </header>
      {state.kind === "loading" && <p className="p-4 text-xs text-muted-foreground">loading…</p>}
      {state.kind === "error" && (
        <p className="p-4 text-xs text-destructive" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === "text" && (
        <pre className="min-h-0 flex-1 overflow-auto p-4 text-xs leading-relaxed" data-testid="file-content">
          {state.content}
        </pre>
      )}
    </section>
  );
}
