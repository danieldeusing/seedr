import { useEffect } from "react";
import type { StudioItem } from "@/features/explorer/registry";
import { RotateCw } from "lucide-react";
import { IconButton } from "@/core/ui/IconButton";
import { useTest } from "./testStore";

interface TestPanelProps {
  item: StudioItem;
}

const bytes = (text: string): string => `${new TextEncoder().encode(text).length} B`;

/** A real install of one item into a scratch directory, and what it wrote. */
export function TestPanel({ item }: TestPanelProps) {
  const target = useTest((s) => s.target);
  const phase = useTest((s) => s.phase);
  const outcome = useTest((s) => s.outcome);
  const verdict = useTest((s) => s.verdict);
  const error = useTest((s) => s.error);
  const run = useTest((s) => s.run);

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
        <IconButton icon={RotateCw} ariaLabel="run again" tip="run the test install again" onClick={() => void run(item)} disabled={phase === "running"} spin={phase === "running"} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {error && (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        )}
        {outcome && (
          <>
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
            {/* The run itself reads as what it is: a terminal window. */}
            <div className="mt-4 overflow-hidden border border-neutral-700">
              <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-neutral-700 bg-neutral-960 px-2">
                <span className="size-2 rounded-full bg-neutral-600" aria-hidden="true" />
                <span className="size-2 rounded-full bg-neutral-600" aria-hidden="true" />
                <span className="size-2 rounded-full bg-neutral-600" aria-hidden="true" />
                <span className="ml-1.5 text-xss tracking-wider text-neutral-500 uppercase">console — scratch directory</span>
              </div>
              <div className="bg-neutral-960/50 p-3">
                <p className="prompt break-all">{outcome.command.join(" ")}</p>
                <pre className="mt-2 leading-relaxed whitespace-pre-wrap text-neutral-400" data-testid="test-output">
                  {[outcome.run.stdout, outcome.run.stderr].filter(Boolean).join("\n")}
                </pre>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
