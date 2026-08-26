import { useEffect, useRef } from "react";

/**
 * What a running agent is doing, as it does it. Ten lines tall whether or not
 * there are ten: a box that grows from one line makes every early message look
 * like the whole story, and the panel jumps as the job proceeds. It scrolls with
 * the output, so the newest line is the one on screen.
 */
export function AgentLog({ lines }: { lines: string[] }) {
  const view = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const element = view.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  if (lines.length === 0) return null;
  return (
    <pre
      ref={view}
      // Ten lines at this size, plus the padding: `min-h` in lines rather than a
      // magic pixel height, so it holds if the type scale moves.
      className="mt-3 max-h-80 min-h-[calc(10*1.45em+1rem)] overflow-auto border border-border bg-muted p-2 whitespace-pre-wrap"
      aria-live="polite"
      aria-label="agent output"
    >
      {lines.join("\n")}
    </pre>
  );
}
