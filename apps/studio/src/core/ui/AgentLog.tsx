import { useEffect, useMemo, useRef } from "react";
import type { AgentJobEvent } from "@/api/agentJob";
import { SafeMarkdown } from "./SafeMarkdown";

/** One line of a run, still knowing what kind of line it is. */
export type LogLine = Pick<AgentJobEvent, "kind" | "text">;

/** A plain line of output — what a raw process stream gives, with no turns in it. */
export const plainLine = (text: string): LogLine => ({ kind: "text", text });

type Block = { markdown: boolean; text: string };

/**
 * Consecutive lines of the same kind, joined.
 *
 * Markdown is not a line at a time — a fence, a list or a table only means
 * anything whole — so prose is joined before it is rendered. Everything else is
 * joined too, but stays preformatted: a tool trace and a command's JSON are
 * lines, and reflowing them into a paragraph is how they became unreadable.
 */
export function blocksOf(lines: LogLine[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    const markdown = line.kind === "markdown";
    const last = blocks.at(-1);
    if (last && last.markdown === markdown) last.text += `\n${line.text}`;
    else blocks.push({ markdown, text: line.text });
  }
  return blocks;
}

/** Within a few pixels of the bottom, which is where "following the output" means. */
const atBottom = (element: HTMLElement): boolean => element.scrollHeight - element.scrollTop - element.clientHeight < 24;

/**
 * What a running agent is doing, as it does it — in the window it would have had
 * in a terminal, because that is what it is.
 *
 * It follows the newest line only while the reader is already at the bottom.
 * Scrolling back to read something and being dragged forward again by the next
 * line makes a long run impossible to read.
 *
 * Ten lines tall whether or not there are ten: a box that grows from one line
 * makes every early message look like the whole story, and the panel jumps as
 * the job proceeds. `fill` is for the finished view, where the log is the only
 * thing left to read and the dialog is already at its full height.
 */
export function AgentLog({ lines, fill = false }: { lines: LogLine[]; fill?: boolean }) {
  const view = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const blocks = useMemo(() => blocksOf(lines), [lines]);

  useEffect(() => {
    const element = view.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [blocks]);

  if (lines.length === 0) return null;
  return (
    <div className={`mt-3 flex min-h-0 flex-col overflow-hidden border border-neutral-700 ${fill ? "flex-1" : ""}`}>
      <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-neutral-700 bg-neutral-960 px-2">
        <span className="size-2 rounded-full bg-neutral-600" aria-hidden="true" />
        <span className="size-2 rounded-full bg-neutral-600" aria-hidden="true" />
        <span className="size-2 rounded-full bg-neutral-600" aria-hidden="true" />
        <span className="ml-1.5 text-xss tracking-wider text-neutral-500 uppercase">agent output</span>
      </div>
      <div
        ref={view}
        onScroll={(event) => (following.current = atBottom(event.currentTarget))}
        // Ten lines at this size, plus the padding: `min-h` in lines rather than
        // a magic pixel height, so it holds if the type scale moves.
        className={`min-h-[calc(10*1.45em+1rem)] overflow-auto bg-neutral-960/50 p-3 leading-relaxed ${fill ? "flex-1" : "max-h-80"}`}
        aria-live="polite"
        aria-label="agent output"
      >
        {blocks.map((block, index) =>
          block.markdown ? (
            <div key={index} className="formatted-preview text-neutral-300">
              <SafeMarkdown>{block.text}</SafeMarkdown>
            </div>
          ) : (
            <pre key={index} className="whitespace-pre-wrap text-neutral-400">
              {block.text}
            </pre>
          )
        )}
      </div>
    </div>
  );
}
