import { useEffect, useRef } from "react";
import { SafeMarkdown } from "./SafeMarkdown";

/** The marker the stores put in front of a tool call, and nothing else. */
const TOOL_MARKER = "· ";

type Block = { tool: true; lines: string[] } | { tool: false; text: string };

/**
 * Consecutive lines of the same kind, together.
 *
 * Per line would be wrong: what an agent says is markdown, and markdown is not
 * a line at a time — a fenced block, a list or a table only means anything
 * whole. Splitting them is how a `list` command's JSON arrived on screen as
 * forty ragged paragraphs.
 */
export function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    const isTool = line.startsWith(TOOL_MARKER);
    const last = blocks.at(-1);
    if (isTool && last?.tool) last.lines.push(line);
    else if (!isTool && last && !last.tool) last.text += `\n${line}`;
    else blocks.push(isTool ? { tool: true, lines: [line] } : { tool: false, text: line });
  }
  return blocks;
}

/**
 * What a running agent is doing, as it does it — in the window it would have
 * had in a terminal, because that is what it is.
 *
 * The agent's own messages are rendered as the markdown they are written in:
 * headings, lists and fenced code arrived as their own source before this, so
 * output meant to be read came out looking like output nobody had read. Tool
 * calls stay one terse line each; they are a trace, not prose.
 *
 * Ten lines tall whether or not there are ten: a box that grows from one line
 * makes every early message look like the whole story, and the panel jumps as
 * the job proceeds. It scrolls with the output, so the newest line is on screen.
 *
 * `fill` is for the finished view, where the log is the only thing left to read
 * and the dialog is already at its full height.
 */
export function AgentLog({ lines, fill = false }: { lines: string[]; fill?: boolean }) {
  const view = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = view.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

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
        // Ten lines at this size, plus the padding: `min-h` in lines rather than
        // a magic pixel height, so it holds if the type scale moves.
        className={`formatted-preview min-h-[calc(10*1.45em+1rem)] overflow-auto bg-neutral-960/50 p-3 leading-relaxed ${fill ? "flex-1" : "max-h-80"}`}
        aria-live="polite"
        aria-label="agent output"
      >
        {blocksOf(lines).map((block, index) =>
          block.tool ? (
            <pre key={index} className="whitespace-pre-wrap text-neutral-500">
              {block.lines.join("\n")}
            </pre>
          ) : (
            <div key={index} className="text-neutral-400">
              <SafeMarkdown>{block.text}</SafeMarkdown>
            </div>
          )
        )}
      </div>
    </div>
  );
}
