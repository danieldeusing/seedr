import { memo, useEffect, useMemo, useRef } from "react";
import { FileText, Type, Wand2 } from "lucide-react";
import type { LogLine } from "@/core/logLines";
import { PaneResizeHandle } from "@/core/PaneResizeHandle";
import { useRememberedChoice, useRememberedSize } from "@/core/remembered";
import { SafeMarkdown } from "./SafeMarkdown";

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

/**
 * A run of consecutive tool calls, or one piece of output.
 *
 * Calls are grouped because that is how they happen — an agent looks at six
 * things before it says anything — and a log that lists them one under another
 * buries the sentence that follows. Grouped, they are one line until opened.
 */
type Block =
  | { calls: LogLine[]; markdown?: never; text?: never; repeats?: never }
  | { calls?: never; markdown: boolean; text: string; repeats: number };

/**
 * The same message, however many times it came, is one message.
 *
 * A CLI with a broken MCP server reports the failure on every model call — ten
 * identical auth errors in an eighteen-line log, saying one thing ten times.
 * The timestamp is what makes them look distinct, so it is not what they are
 * compared by. Only plain output is collapsed: what an agent says and what it
 * runs are events, and two identical ones really did happen twice.
 */
const withoutTimestamp = (text: string): string => text.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s*/, "");

/**
 * What to render, given the lines and how they are to be read.
 *
 * Markdown runs are joined — a fence, a list or a table only means anything
 * whole. Plain lines are deliberately *not* joined, each staying its own block.
 * Joined, a streaming agent grew one enormous `<pre>` that React rebuilt on
 * every arriving line, and a job long enough left the mode buttons taking
 * whole seconds to answer. Separate, an arriving line adds one element and
 * every earlier one is left alone.
 */
export function blocksOf(lines: LogLine[], mode: LogMode = "auto"): Block[] {
  const blocks: Block[] = [];
  const shown = new Map<string, Block>();
  for (const line of lines) {
    if (line.kind === "tool" && mode !== "raw") {
      const last = blocks.at(-1);
      if (last?.calls) last.calls.push(line);
      else blocks.push({ calls: [line] });
      continue;
    }
    const markdown = mode === "raw" ? false : mode === "formatted" || line.kind === "markdown";
    if (!markdown && (line.kind === "text" || line.kind === "tool")) {
      const already = shown.get(withoutTimestamp(line.text));
      if (already?.repeats !== undefined) {
        already.repeats += 1;
        continue;
      }
      const block = { markdown: false, text: line.text, repeats: 1 };
      shown.set(withoutTimestamp(line.text), block);
      blocks.push(block);
      continue;
    }
    const last = blocks.at(-1);
    if (markdown && last?.markdown) last.text += `\n${line.text}`;
    else blocks.push({ markdown, text: line.text, repeats: 1 });
  }
  return blocks;
}

/**
 * One block, rendered once. Only the newest changes as output arrives, so
 * everything above it must be allowed to stay exactly as it is.
 */
/** A run of calls: how many, and which, once opened. */
const CallGroup = memo(function CallGroup({ calls }: { calls: LogLine[] }) {
  return (
    <details className="my-1">
      <summary className="cursor-pointer list-none text-neutral-500 transition-colors hover:text-neutral-300">
        <span className="mr-1 inline-block transition-transform">▸</span>
        Ran {calls.length} {calls.length === 1 ? "command" : "commands"}
      </summary>
      <ul className="mt-1 ml-4 space-y-0.5">
        {calls.map((call, index) => (
          <li key={index} className="flex gap-2">
            <span className="shrink-0 text-primary">{call.text}</span>
            <span className="min-w-0 truncate text-neutral-500">{call.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
});

const LogBlock = memo(function LogBlock({ markdown, text, repeats }: { markdown: boolean; text: string; repeats: number }) {
  return markdown ? (
    <div className="formatted-preview text-neutral-300">
      <SafeMarkdown>{text}</SafeMarkdown>
    </div>
  ) : (
    <pre className="whitespace-pre-wrap text-neutral-400">
      {text}
      {repeats > 1 && <span className="text-neutral-500"> ×{repeats}</span>}
    </pre>
  );
});

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
        // No `aria-live`: this region changes many times a second and runs to a
        // thousand lines, so announcing it would announce nothing usable and
        // cost a subtree diff per line.
        aria-label="agent output"
      >
        {blocks.map((block, index) =>
          block.calls ? (
            <CallGroup key={index} calls={block.calls} />
          ) : (
            <LogBlock key={index} markdown={block.markdown} text={block.text} repeats={block.repeats} />
          )
        )}
      </div>
      {!fill && <PaneResizeHandle axis="y" label="resize agent output" onResize={(delta) => setHeight((current: number) => Math.max(SHORTEST, current + delta))} />}
    </div>
  );
}
