import type { CanonicalCodingAgent } from "@seedr/shared";
import type { RunOutcome } from "@/api/agent";
import type { AgentJobEvent } from "@/api/agentJob";
import { AGENT_PROGRAMS } from "@/features/settings/agentSettings";
import { DRAFT_SCHEMA } from "./metadataContract";

/**
 * Every coding agent here runs one prompt without a terminal and prints what it
 * did. What differs is the spelling — the flag that means "not interactive",
 * whether the prompt goes on argv or stdin, how tools are permitted and what the
 * output looks like. That spelling is all an adapter is.
 *
 * Flags verified against the CLIs installed on 2026-08-24: Claude Code 2.1.226,
 * GitHub Copilot CLI 1.0.78, codex-cli 0.147.0, opencode 1.18.16, agy 1.1.11.
 */
export interface AgentAdapter {
  /** The binary; the settings page can point this at another path. */
  program: string;
  /** Non-interactive run of a prompt with no tools, answering with JSON. */
  draftArgs(): string[];
  /** Non-interactive run that may use the named tools inside the checkout. */
  jobArgs(allowedTools: string[]): string[];
  /** True when the prompt travels on stdin; otherwise it is the last argument. */
  promptOnStdin: boolean;
  /** One line of the agent's output, as something a person can read. */
  readLine(line: string): AgentJobEvent[];
  /** The whole run: did it work, and what did it say at the end. */
  readOutcome(outcome: RunOutcome): { ok: boolean; text: string; denials: string[] };
}

const text = (kind: AgentJobEvent["kind"], value: string): AgentJobEvent[] => (value.trim() ? [{ kind, text: value.trim() }] : []);

const parseJson = (line: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** The one field of a tool call worth a log line — a path, a command, a URL. */
export function summariseInput(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const record = input as Record<string, unknown>;
  for (const key of ["command", "file_path", "path", "url", "pattern", "skill", "filePath"]) {
    const value = record[key];
    if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  }
  return "";
}

/**
 * Claude Code and Antigravity share a stream shape — `{"type":"assistant",…}`
 * turns, a final `{"type":"result",…}` — because `agy` implements the same
 * print-mode contract, down to `--json-schema`.
 */
function readClaudeStyleLine(line: string): AgentJobEvent[] {
  const event = parseJson(line);
  if (!event) return text("system", line);
  if (event.type === "system" && event.subtype === "init") {
    return [{ kind: "system", text: `session started · ${String(event.model ?? "")} · ${String(event.permissionMode ?? "")}`.trim() }];
  }
  if (event.type === "assistant") {
    const message = event.message as { content?: { type?: string; text?: string; name?: string; input?: unknown }[] } | undefined;
    return (message?.content ?? []).flatMap((block): AgentJobEvent[] => {
      if (block.type === "text") return text("text", block.text ?? "");
      if (block.type === "tool_use") return [{ kind: "tool", text: `${block.name ?? "tool"} ${summariseInput(block.input)}`.trim() }];
      return [];
    });
  }
  if (event.type === "result" && event.is_error) return text("error", typeof event.result === "string" ? event.result : "the agent failed");
  return [];
}

function readClaudeStyleOutcome(outcome: RunOutcome): { ok: boolean; text: string; denials: string[] } {
  for (const line of outcome.stdout.split("\n").filter((l) => l.trim()).reverse()) {
    const event = parseJson(line);
    if (event?.type !== "result") continue;
    const denials = Array.isArray(event.permission_denials) ? event.permission_denials.map((denial) => String((denial as { tool_name?: unknown }).tool_name ?? "a tool")) : [];
    return { ok: !event.is_error && outcome.status === "ok", text: typeof event.result === "string" ? event.result : "", denials };
  }
  return { ok: false, text: outcome.stderr.trim() || outcome.stdout.trim() || `exit code ${outcome.exitCode}`, denials: [] };
}

/** Plain-text agents: the run's own exit code is the verdict, stdout is the answer. */
function readPlainOutcome(outcome: RunOutcome): { ok: boolean; text: string; denials: string[] } {
  const said = outcome.stdout.trim();
  return { ok: outcome.status === "ok", text: said || outcome.stderr.trim() || `exit code ${outcome.exitCode}`, denials: [] };
}

const claudeStyle = (program: string, noTools: string[]): AgentAdapter => ({
  program,
  draftArgs: () => ["-p", "--output-format", "json", "--json-schema", JSON.stringify(DRAFT_SCHEMA), ...noTools],
  jobArgs: (allowedTools) => ["-p", "--output-format", "stream-json", "--verbose", "--allowedTools", allowedTools.join(",")],
  promptOnStdin: true,
  readLine: readClaudeStyleLine,
  readOutcome: readClaudeStyleOutcome,
});

export const ADAPTERS: Record<CanonicalCodingAgent, AgentAdapter> = {
  // `--tools ""` removes every tool; `--max-turns 1` additionally bounds the run.
  claude: claudeStyle(AGENT_PROGRAMS.claude, ["--tools", "", "--max-turns", "1"]),

  // agy speaks Claude Code's print mode, including --json-schema. It has no tool
  // allowlist, so a draft is bounded by plan mode, which cannot write.
  antigravity: {
    ...claudeStyle(AGENT_PROGRAMS.antigravity, ["--mode", "plan", "--disable-slash-commands"]),
    jobArgs: () => ["-p", "--output-format", "stream-json", "--mode", "accept-edits"],
  },

  // Copilot takes the prompt on argv and needs an explicit allowlist to run
  // anything unattended; `--allow-all-tools` is what its help calls required for
  // non-interactive mode, so a draft simply names no tools at all.
  copilot: {
    program: AGENT_PROGRAMS.copilot,
    draftArgs: () => ["--no-color", "--log-level", "none", "-p"],
    jobArgs: (allowedTools) => ["--no-color", "--log-level", "none", ...allowedTools.flatMap((tool) => ["--allow-tool", tool]), "-p"],
    promptOnStdin: false,
    readLine: (line) => text("text", line),
    readOutcome: readPlainOutcome,
  },

  // `codex exec` reads the prompt from stdin when the argument is `-`, and its
  // sandbox is the tool boundary: read-only for a draft, workspace-write for a
  // job that has to change files.
  codex: {
    program: AGENT_PROGRAMS.codex,
    draftArgs: () => ["exec", "--color", "never", "-s", "read-only", "-"],
    jobArgs: () => ["exec", "--color", "never", "-s", "workspace-write", "-"],
    promptOnStdin: true,
    readLine: (line) => text("text", line),
    readOutcome: readPlainOutcome,
  },

  // opencode takes the message as positional words; the prompt is one argument.
  opencode: {
    program: AGENT_PROGRAMS.opencode,
    draftArgs: () => ["run"],
    jobArgs: () => ["run"],
    promptOnStdin: false,
    readLine: (line) => text("text", line),
    readOutcome: readPlainOutcome,
  },
};

export const adapterFor = (agent: CanonicalCodingAgent): AgentAdapter => ADAPTERS[agent];
