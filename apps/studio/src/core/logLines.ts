import type { AgentJobEvent } from "@/api/agentJob";

/** One line of a run, still knowing what kind of line it is. */
export type LogLine = Pick<AgentJobEvent, "kind" | "text">;

/** A plain line of output — what a raw process stream gives, with no turns in it. */
export const plainLine = (text: string): LogLine => ({ kind: "text", text });

/**
 * Collect arriving lines and hand them over once a frame.
 *
 * An agent streams faster than a screen can show: every line was a store update
 * and therefore a render, and a burst of a few hundred left the window taking
 * seconds to answer a click. Nothing is dropped — a frame's worth arrives
 * together, which is as often as it could have been seen anyway.
 */
export function batchedLog(append: (lines: LogLine[]) => void): (line: LogLine) => void {
  let pending: LogLine[] = [];
  let frame = 0;
  return (line) => {
    pending.push(line);
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const batch = pending;
      pending = [];
      append(batch);
    });
  };
}
