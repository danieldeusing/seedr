import { useEffect } from "react";
import type { StudioItem } from "@/features/explorer/registry";
import { useTest } from "./testStore";

interface TestPanelProps {
  item: StudioItem;
  onDone(): void;
}

const bytes = (text: string): string => `${new TextEncoder().encode(text).length} B`;

/** A real install of one item into a scratch directory, and what it wrote. */
export function TestPanel({ item, onDone }: TestPanelProps) {
  const target = useTest((s) => s.target);
  const phase = useTest((s) => s.phase);
  const outcome = useTest((s) => s.outcome);
  const verdict = useTest((s) => s.verdict);
  const error = useTest((s) => s.error);
  const run = useTest((s) => s.run);
  const reset = useTest((s) => s.reset);

  useEffect(() => {
    // Runs once per opened item — never again because the registry watcher
    // rebuilt the item objects, and never twice under StrictMode.
    if (target?.type !== item.type || target?.slug !== item.slug) void run(item);
  }, [item, target, run]);

  return (
    <section className="flex h-full min-h-0 flex-col text-xs">
      <header className="flex items-center gap-4 border-b border-border px-6 py-3">
        <p className="prompt">
          test install {item.type}/{item.slug}
        </p>
        <span className="text-muted-foreground" role="status">
          {phase === "running" && "installing into a scratch directory…"}
          {phase === "done" && outcome && `${outcome.run.status} in ${outcome.run.durationMs} ms`}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => void run(item)} className="btn-terminal btn-terminal--ghost btn-terminal--compact" disabled={phase === "running"}>
          run again
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            onDone();
          }}
          className="btn-terminal btn-terminal--ghost btn-terminal--compact"
        >
          back
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {error && (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        )}
        {outcome && (
          <>
            <p className="prompt break-all text-muted-foreground">{outcome.command.join(" ")}</p>
            {verdict && (
              <p className={`mt-3 ${verdict.ok ? "text-primary" : "text-destructive"}`} data-testid="test-verdict">
                {verdict.ok
                  ? `installed ${Object.keys(outcome.files.files).length + outcome.files.skipped.length} files for ${verdict.roots.join(", ")}`
                  : `failed: ${verdict.problems.join("; ")}`}
              </p>
            )}
            <ul className="mt-3" aria-label="written files">
              {Object.entries(outcome.files.files).map(([rel, text]) => (
                <li key={rel} className="flex gap-3">
                  <code className="break-all">{rel}</code>
                  <span className="text-muted-foreground">{bytes(text)}</span>
                </li>
              ))}
              {outcome.files.skipped.map((rel) => (
                <li key={rel} className="flex gap-3">
                  <code className="break-all">{rel}</code>
                  <span className="text-muted-foreground">binary or large</span>
                </li>
              ))}
            </ul>
            <pre className="mt-4 whitespace-pre-wrap leading-relaxed text-muted-foreground" data-testid="test-output">
              {[outcome.run.stdout, outcome.run.stderr].filter(Boolean).join("\n")}
            </pre>
          </>
        )}
      </div>
    </section>
  );
}
