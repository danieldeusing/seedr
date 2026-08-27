import { useEffect, useMemo, useRef } from "react";
import { FileText, Type, Wand2 } from "lucide-react";
import type { AgentJobEvent } from "@/api/agentJob";
import { PaneResizeHandle } from "@/core/PaneResizeHandle";
import { useRememberedChoice, useRememberedSize } from "@/core/remembered";
import { SafeMarkdown } from "./SafeMarkdown";

/** One line of a run, still knowing what kind of line it is. */
export type LogLine = Pick<AgentJobEvent, "kind" | "text">;

/** A plain line of output — what a raw process stream gives, with no turns in it. */
export const plainLine = (text: string): LogLine => ({ kind: "text", text });

/**
 * How much of the output to read as markdown.
 *
 * `auto` trusts the agent: only Claude Code reports its turns structurally
 * enough to know which of them are prose. Every other CLI reports each line of
 * output as text, so under `formatted` their traces reflow into paragraphs and
 * indented JSON becomes a column of code blocks — which is why the choice is
 * offered rather than decided here.
 */
export const LOG_MODES = ["auto", "formatted", "raw"] as const;
export type LogMode = (typeof LOG_MODES)[number];

const MODE_LABELS: Record<LogMode, string> = {
  auto: "as the agent wrote it",
  formatted: "all as markdown",
  raw: "raw text",
};

type Block = { markdown: boolean; text: string };

/**
 * Consecutive lines of the same kind, joined.
 *
 * Markdown is not a line at a time — a fence, a list or a table only means
 * anything whole — so prose is joined before it is rendered. Everything else is
 * joined too, but stays preformatted: a tool trace and a command's JSON are
 * lines, and reflowing them into a paragraph is how they became unreadable.
 */
export function blocksOf(lines: LogLine[], mode: LogMode = "auto"): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    const markdown = mode === "raw" ? false : mode === "formatted" || line.kind === "markdown";
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
 * Ten lines tall to begin with, whether or not there are ten: a box that grows
 * from one line makes every early message look like the whole story, and the
 * panel jumps as the job proceeds. Ten is only a start — the bottom edge drags,
 * and where it is dragged to is where the next run opens. `fill` is for the
 * finished view, where the log is the only thing left to read and the dialog is
 * already at its full height, so there is nothing to choose.
 */
/** Ten lines at `text-xs` plus the padding, which is where the box used to stop. */
const TEN_LINES = 190;
const SHORTEST = 90;
export function AgentLog({ lines, fill = false }: { lines: LogLine[]; fill?: boolean }) {
  const view = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [mode, setMode] = useRememberedChoice<LogMode>("studio-agent-log-mode", LOG_MODES, "auto");
  const blocks = useMemo(() => blocksOf(lines, mode), [lines, mode]);
  const [height, setHeight] = useRememberedSize("studio-agent-log-height", TEN_LINES);

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
        <span className="flex-1" />
        <div className="flex items-center border border-neutral-600">
          {([["auto", Wand2], ["formatted", FileText], ["raw", Type]] as const).map(([value, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={MODE_LABELS[value]}
              aria-pressed={mode === value}
              data-tip={MODE_LABELS[value]}
              className={`flex size-4 cursor-pointer items-center justify-center transition-colors ${mode === value ? "bg-violet-500/20 text-violet-300" : "text-neutral-500 hover:bg-neutral-500/20 hover:text-neutral-300"}`}
              onClick={() => setMode(value)}
            >
              <Icon className="size-2.5" />
            </button>
          ))}
        </div>
      </div>
      <div
        ref={view}
        onScroll={(event) => (following.current = atBottom(event.currentTarget))}
        style={fill ? undefined : { height }}
        className={`overflow-auto bg-neutral-960/50 p-3 leading-relaxed ${fill ? "min-h-0 flex-1" : ""}`}
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
      {!fill && <PaneResizeHandle axis="y" label="resize agent output" onResize={(delta) => setHeight((current: number) => Math.max(SHORTEST, current + delta))} />}
    </div>
  );
}
