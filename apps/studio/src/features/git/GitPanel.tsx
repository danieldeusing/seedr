import { useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { IconButton } from "@/core/ui/IconButton";
import { fs } from "@/api/fs";
import { gitDiff, gitSummary, type GitSummary } from "@/api/git";
import { PublishPanel } from "./PublishPanel";

type Summary = { kind: "loading" } | { kind: "ready"; summary: GitSummary } | { kind: "error"; message: string };

/** Unified-diff ink: additions succeed, removals are destructive, hunk heads point. */
function diffLineClass(line: string): string | undefined {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git") || line.startsWith("index ")) return "text-muted-foreground";
  if (line.startsWith("@@")) return "text-primary";
  if (line.startsWith("+")) return "text-success";
  if (line.startsWith("-")) return "text-destructive";
  return undefined;
}

function DiffText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <span key={index} className={diffLineClass(line)}>
          {line}
          {"\n"}
        </span>
      ))}
    </>
  );
}

/**
 * The worktree, and what to do with it: what a commit would contain, and — on
 * the publish view — the branches it should end up on.
 */
export function GitPanel() {
  const [state, setState] = useState<Summary>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [view, setView] = useState<"status" | "publish">("status");

  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    setSelected(null);
    setDiff(null);
    try {
      setState({ kind: "ready", summary: await gitSummary() });
    } catch (error) {
      setState({ kind: "error", message: (error as Error).message });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const show = async (change: { status: string; path: string }) => {
    setSelected(change.path);
    setDiff(null);
    try {
      setDiff(change.status === "??" ? await fs.readText(change.path) : await gitDiff(change.path));
    } catch (error) {
      setDiff((error as Error).message);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col text-xs">
      <header className="flex items-center gap-4 border-b border-border px-6 py-3">
        <p className="prompt">git status</p>
        {state.kind === "ready" && (
          <span className="text-muted-foreground">
            {state.summary.branch} @ {state.summary.head} · {state.summary.changes.length} changed
          </span>
        )}
        <span className="flex-1" />
        {(["status", "publish"] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-current={view === name ? "page" : undefined}
            onClick={() => setView(name)}
            className={`cursor-pointer px-2 py-0.5 transition-colors ${view === name ? "bg-violet-500/20 text-neutral-200" : "text-neutral-400 hover:bg-neutral-960/50 hover:text-neutral-200"}`}
          >
            {name}
          </button>
        ))}
        <IconButton icon={RotateCw} ariaLabel="refresh" tip="Re-read the worktree" onClick={() => void refresh()} />
      </header>
      {state.kind === "loading" && <p className="p-6 text-muted-foreground">loading…</p>}
      {state.kind === "error" && (
        <p className="p-6 text-destructive" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === "ready" && view === "publish" && <PublishPanel summary={state.summary} />}
      {state.kind === "ready" && view === "status" && (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <ul className="overflow-y-auto border-r border-border p-4">
            {state.summary.changes.length === 0 && <li className="text-muted-foreground">worktree clean — nothing to commit</li>}
            {state.summary.changes.map((change) => (
              <li key={change.path}>
                <button
                  type="button"
                  onClick={() => void show(change)}
                  aria-current={selected === change.path ? "true" : undefined}
                  className={`block w-full truncate px-2 py-1 text-left hover:bg-muted ${selected === change.path ? "bg-muted text-primary" : ""}`}
                >
                  <code className="mr-2 text-muted-foreground">{change.status}</code>
                  {change.path}
                </button>
              </li>
            ))}
          </ul>
          <pre className="min-h-0 overflow-auto p-4 leading-relaxed" data-testid="git-diff">
            {selected === null ? "Select a path to see its diff." : diff === null ? "loading…" : <DiffText text={diff} />}
          </pre>
        </div>
      )}
      <footer className="border-t border-border px-6 py-2 text-muted-foreground">Pushing to the branch the CLI reads is live for every user at once — check the diff before you publish.</footer>
    </section>
  );
}
