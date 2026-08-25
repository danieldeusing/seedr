import { onProcessOutput, runProcess, type RunOutcome } from "./agent";

/**
 * A job an agent does *in* the checkout — adding a community item, publishing a
 * branch — as opposed to the tool-free, one-turn drafting adapter.
 *
 * The difference is deliberate and visible: a job names the tools it allows, and
 * Claude Code denies everything else (in `-p` there is no one to ask, so a tool
 * outside the list fails and is reported rather than silently granted). The
 * prompt travels on stdin, the run streams as JSONL so the user can watch, and
 * the task id is the cancel key.
 */
export const AGENT_JOB_TIMEOUT_MS = 900_000;

export interface AgentJobEvent {
  kind: "system" | "text" | "tool" | "error";
  text: string;
}

export interface AgentJobResult {
  ok: boolean;
  /** The agent's final message, or the failure. */
  text: string;
  denials: string[];
}

interface StreamContent {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
}

/** One line of `--output-format stream-json --verbose`, as something a person can read. */
export function parseStreamLine(line: string): AgentJobEvent[] {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    // Anything the CLI writes outside the stream (a warning, a stack) is still worth showing.
    return line.trim() ? [{ kind: "system", text: line }] : [];
  }
  if (event.type === "system" && event.subtype === "init") {
    return [{ kind: "system", text: `session started · ${String(event.model ?? "")} · ${String(event.permissionMode ?? "")}` }];
  }
  if (event.type === "assistant") {
    const message = event.message as { content?: StreamContent[] } | undefined;
    return (message?.content ?? []).flatMap((block): AgentJobEvent[] => {
      if (block.type === "text" && block.text?.trim()) return [{ kind: "text", text: block.text.trim() }];
      if (block.type === "tool_use") return [{ kind: "tool", text: `${block.name ?? "tool"} ${summariseInput(block.input)}`.trim() }];
      return [];
    });
  }
  if (event.type === "result") {
    const text = typeof event.result === "string" ? event.result : "";
    return event.is_error ? [{ kind: "error", text: text || "the agent failed" }] : [];
  }
  return [];
}

/** The one field of a tool call worth a log line — a path, a command, a URL. */
function summariseInput(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const record = input as Record<string, unknown>;
  for (const key of ["command", "file_path", "path", "url", "pattern", "skill"]) {
    const value = record[key];
    if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  }
  return "";
}

/** The `result` envelope, whatever the output format — the job's verdict. */
export function jobResult(outcome: RunOutcome): AgentJobResult {
  if (outcome.status !== "ok" && outcome.status !== "failed") {
    return { ok: false, text: `the agent run ${outcome.status}`, denials: [] };
  }
  const lines = outcome.stdout.split("\n").filter((line) => line.trim());
  for (const line of lines.reverse()) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type !== "result") continue;
      const denials = Array.isArray(event.permission_denials)
        ? event.permission_denials.map((denial) => String((denial as { tool_name?: unknown }).tool_name ?? "a tool"))
        : [];
      const text = typeof event.result === "string" ? event.result : "";
      return { ok: !event.is_error && outcome.status === "ok", text, denials };
    } catch {
      // Not the envelope; keep looking backwards.
    }
  }
  return { ok: false, text: outcome.stderr.trim() || outcome.stdout.trim() || `exit code ${outcome.exitCode}`, denials: [] };
}

export interface AgentJobRequest {
  taskId: string;
  prompt: string;
  /** Exactly the tools this job may use, e.g. `Read`, `Bash(git status:*)`. */
  allowedTools: string[];
  program?: string;
  timeoutMs?: number;
  onEvent?(event: AgentJobEvent): void;
}

export function agentJobArgs(allowedTools: string[]): string[] {
  return ["-p", "--output-format", "stream-json", "--verbose", "--allowedTools", allowedTools.join(",")];
}

export async function runAgentJob(
  { taskId, prompt, allowedTools, program = "claude", timeoutMs = AGENT_JOB_TIMEOUT_MS, onEvent }: AgentJobRequest,
  run: typeof runProcess = runProcess
): Promise<AgentJobResult> {
  const unlisten = onEvent ? await onProcessOutput(taskId, ({ line }) => parseStreamLine(line).forEach(onEvent)) : null;
  try {
    return jobResult(await run({ taskId, program, args: agentJobArgs(allowedTools), stdin: prompt, cwd: "", timeoutMs }));
  } finally {
    unlisten?.();
  }
}
