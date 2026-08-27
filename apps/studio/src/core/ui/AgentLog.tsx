import { memo, useEffect, useMemo, useRef } from "react";
import type { LogLine } from "@/core/logLines";
import { PaneResizeHandle } from "@/core/PaneResizeHandle";
import { useRememberedSize } from "@/core/remembered";
import { SafeMarkdown } from "./SafeMarkdown";

/**
 * A run of consecutive tool calls, or one piece of output.
 *
 * Calls are grouped because that is how they happen — an agent looks at six
 * things before it says anything — and a log that lists them one under another
 * buries the sentence that follows. Grouped, they are one line until opened.
 */
/** One row inside a group: what it was, and how many times it came. */
type Entry = { text: string; detail?: string; repeats: number };

type Block =
  | { group: "tool" | "error"; entries: Entry[]; markdown?: never; text?: never; repeats?: never }
  | { group?: never; entries?: never; markdown: boolean; text: string; repeats: number };

const GROUP_LABEL: Record<"tool" | "error", (count: number) => string> = {
  tool: (count) => `Ran ${count} ${count === 1 ? "command" : "commands"}`,
  error: (count) => `${count} ${count === 1 ? "error" : "errors"}`,
};

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
export function blocksOf(lines: LogLine[]): Block[] {
  const blocks: Block[] = [];
  const shown = new Map<string, Block>();
  const grouped = new Map<string, Entry>();
  for (const line of lines) {
    // Calls and the runtime's own errors both gather: an agent looks at six
    // things before it says anything, and a CLI whose MCP server is broken logs
    // the same failure on every model call. Either way the sentence that
    // follows should not be buried under them.
    if (line.kind === "tool" || line.kind === "error") {
      const key = `${withoutTimestamp(line.text)}:${line.detail ?? ""}`;
      const already = line.kind === "error" ? grouped.get(key) : undefined;
      if (already) {
        already.repeats += 1;
        continue;
      }
      const entry: Entry = { text: line.text, detail: line.detail, repeats: 1 };
      // Only an error is worth counting instead of repeating; two identical
      // calls are two things the agent did.
      if (line.kind === "error") grouped.set(key, entry);
      const last = blocks.at(-1);
      if (last?.group === line.kind) last.entries.push(entry);
      else blocks.push({ group: line.kind, entries: [entry] });
      continue;
    }
    const markdown = line.kind === "markdown";
    if (line.kind === "text") {
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
/** A run of calls, or of runtime errors: how many, and which, once opened. */
const Group = memo(function Group({ group, entries }: { group: "tool" | "error"; entries: Entry[] }) {
  const total = entries.reduce((sum, entry) => sum + entry.repeats, 0);
  return (
    <details className="my-1">
      <summary className={`cursor-pointer list-none transition-colors hover:text-neutral-300 ${group === "error" ? "text-destructive/80" : "text-neutral-500"}`}>
        <span className="mr-1 inline-block">▸</span>
        {GROUP_LABEL[group](total)}
      </summary>
      <ul className="mt-1 ml-4 space-y-0.5">
        {entries.map((entry, index) => (
          <li key={index} className="flex gap-2">
            <span className={`shrink-0 ${group === "error" ? "text-destructive/70" : "text-primary"}`}>{entry.text}</span>
            {entry.detail && <span className="min-w-0 truncate text-neutral-500">{entry.detail}</span>}
            {entry.repeats > 1 && <span className="shrink-0 text-neutral-600">×{entry.repeats}</span>}
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
  const blocks = useMemo(() => blocksOf(lines), [lines]);
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
          block.group ? (
            <Group key={index} group={block.group} entries={block.entries} />
          ) : (
            <LogBlock key={index} markdown={block.markdown} text={block.text} repeats={block.repeats} />
          )
        )}
      </div>
      {!fill && <PaneResizeHandle axis="y" label="resize agent output" onResize={(delta) => setHeight((current: number) => Math.max(SHORTEST, current + delta))} />}
    </div>
  );
}
