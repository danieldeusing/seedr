import type { CanonicalCodingAgent } from "@seedr/shared";
import type { RunOutcome } from "@/api/agent";
import type { AgentJobEvent } from "@/api/agentJob";
import { AGENT_PROGRAMS } from "@/features/settings/agentSettings";
import { DRAFT_SCHEMA } from "./metadataContract";

/**
 * Every coding agent here runs one prompt without a terminal and prints what it
 * did. What differs is the spelling — where the prompt goes, how tools are
 * permitted, what the output looks like around the answer. That spelling is all
 * an adapter is.
 *
 * Every shape below was run against the CLI installed on 2026-08-24, not read
 * off `--help`: Claude Code 2.1.226, GitHub Copilot 1.0.78, codex-cli 0.147.0,
 * opencode 1.18.16, agy 1.1.11. Two of them only failed when actually run —
 * `agy -p` swallows the next argument as its prompt unless the prompt is
 * attached to the flag, and every plain-text agent frames its answer with
 * banners, echoes and token counts.
 */
export interface AgentInvocation {
  args: string[];
  /** Set when this agent reads the prompt from stdin rather than argv. */
  stdin?: string;
}

/**
 * What a job needs to be allowed to do, said once in terms that mean the same
 * thing everywhere. Tool *names* are not portable — Claude Code calls them
 * `Read` and `Bash(git:*)`, Copilot calls the same things `view` and
 * `bash(git:*)`, and codex and opencode have no allowlist at all — so a job
 * names capabilities and each adapter spells them.
 */
export type JobCapability = "read" | "edit" | "search" | "skills" | "web" | "shell" | `shell:${string}`;

/**
 * What no job may run, whatever else it is allowed. `git` is the line: a job
 * that authors or edits a capability has every reason to run the maintainer's
 * own tooling — a skill's `init_skill.py`, `mkdir`, a formatter — and no reason
 * to commit, push or rewrite history. Publishing is the one job that gets git,
 * and it gets it by naming it.
 */
export const DENIED_SHELL = "git";

const shellPrefix = (capability: JobCapability): string | null => (capability.startsWith("shell:") ? capability.slice("shell:".length) : null);

/** Whether a job intends to change anything, which is the only tool question codex and agy answer. */
export const writesFiles = (capabilities: JobCapability[]): boolean => capabilities.some((capability) => capability === "edit" || capability.startsWith("shell"));

const CLAUDE_TOOLS: Record<Exclude<JobCapability, "shell" | `shell:${string}`>, string[]> = {
  read: ["Read"],
  edit: ["Write", "Edit"],
  search: ["Glob", "Grep"],
  skills: ["Skill"],
  web: ["WebFetch"],
};

// Copilot answers two different names for the same tool: it *lists* `bash`, and
// its permission system calls it `shell`. Verified by running the same command
// twice — `--allow-tool bash` was denied, `--allow-tool shell` ran it.
const COPILOT_TOOLS: Record<Exclude<JobCapability, "shell" | `shell:${string}`>, string[]> = {
  read: ["view"],
  edit: ["create", "edit"],
  search: ["grep", "glob"],
  skills: ["skill"],
  web: ["web_fetch"],
};

const spell = (capabilities: JobCapability[], table: Record<string, string[]>, shell: (prefix: string) => string, anyShell: string): string[] =>
  capabilities.flatMap((capability) => {
    if (capability === "shell") return [anyShell];
    const prefix = shellPrefix(capability);
    return prefix ? [shell(prefix)] : (table[capability] ?? []);
  });

/** True when a job may run commands at large, rather than named ones. */
const hasOpenShell = (capabilities: JobCapability[]): boolean => capabilities.includes("shell");

export interface AgentAdapter {
  /** The binary; the settings page can point this at another path. */
  program: string;
  /** One prompt, no tools, answering with JSON. */
  draft(prompt: string): AgentInvocation;
  /** One prompt that may do the named things inside the checkout. */
  job(prompt: string, capabilities: JobCapability[]): AgentInvocation;
  /** True when this CLI can be told to answer against a JSON schema. */
  schemaEnforced: boolean;
  /** One line of the agent's output, as something a person can read. */
  readLine(line: string): AgentJobEvent[];
  /** The whole run: did it work, and what did it say at the end. */
  readOutcome(outcome: RunOutcome): { ok: boolean; text: string; denials: string[] };
}

const line = (kind: AgentJobEvent["kind"], value: string): AgentJobEvent[] => (value.trim() ? [{ kind, text: value.trim() }] : []);

const parseJson = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * Every complete JSON object in a plain-text answer, in the order they appear.
 * An agent that cannot be held to a schema still answers correctly — it just
 * frames the answer with a banner, an echo of the prompt or a token count, and
 * some print more than one object (codex repeats its answer; agy follows it
 * with a summary of what it just did). Which one is the answer is not something
 * the framing tells you, so the caller validates them in turn.
 */
export function jsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
      const character = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth++;
      else if (character === "}") {
        depth--;
        if (depth !== 0) continue;
        const block = text.slice(start, index + 1);
        if (parseJson(block)) {
          candidates.push(block);
          start = index;
        }
        break;
      }
    }
  }
  return candidates;
}

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
 * Claude Code's print mode: `{"type":"assistant",…}` turns and a final
 * `{"type":"result",…}`, with tools named by an allowlist.
 */
function readClaudeLine(text: string): AgentJobEvent[] {
  const event = parseJson(text);
  if (!event) return line("system", text);
  if (event.type === "system" && event.subtype === "init") {
    return [{ kind: "system", text: `session started · ${String(event.model ?? "")} · ${String(event.permissionMode ?? "")}`.trim() }];
  }
  if (event.type === "assistant") {
    const message = event.message as { content?: { type?: string; text?: string; name?: string; input?: unknown }[] } | undefined;
    return (message?.content ?? []).flatMap((block): AgentJobEvent[] => {
      if (block.type === "text") return line("text", block.text ?? "");
      if (block.type === "tool_use") return [{ kind: "tool", text: `${block.name ?? "tool"} ${summariseInput(block.input)}`.trim() }];
      return [];
    });
  }
  if (event.type === "result" && event.is_error) return line("error", typeof event.result === "string" ? event.result : "the agent failed");
  return [];
}

function readClaudeOutcome(outcome: RunOutcome): { ok: boolean; text: string; denials: string[] } {
  for (const text of outcome.stdout.split("\n").filter((l) => l.trim()).reverse()) {
    const event = parseJson(text);
    if (event?.type !== "result") continue;
    const denials = Array.isArray(event.permission_denials) ? event.permission_denials.map((denial) => String((denial as { tool_name?: unknown }).tool_name ?? "a tool")) : [];
    return { ok: !event.is_error && outcome.status === "ok", text: typeof event.result === "string" ? event.result : "", denials };
  }
  return { ok: false, text: outcome.stderr.trim() || outcome.stdout.trim() || `exit code ${outcome.exitCode}`, denials: [] };
}

/**
 * agy prints its own shape, not Claude's: `{"event":"init"|"step_update"|"result"}`
 * with the answer arriving as `text_delta` on an `agent_response` step.
 */
function readAgyLine(text: string): AgentJobEvent[] {
  const event = parseJson(text);
  if (!event) return line("system", text);
  if (event.event === "init") {
    const init = event.init as { permission_mode?: string; tools?: unknown[] } | undefined;
    return [{ kind: "system", text: `session started · ${init?.permission_mode ?? ""} · ${init?.tools?.length ?? 0} tools` }];
  }
  if (event.event === "step_update") {
    const step = event.step_update as { text_delta?: string; step_type?: string; state?: string } | undefined;
    if (step?.text_delta) return line("text", step.text_delta);
    if (step?.state === "ACTIVE" && step.step_type && step.step_type !== "agent_response") return [{ kind: "tool", text: step.step_type }];
    return [];
  }
  if (event.event === "result") {
    const result = event.result as { status?: string; response?: string } | undefined;
    return result?.status === "SUCCESS" ? [] : line("error", result?.response ?? "the agent failed");
  }
  return [];
}

/** Both of agy's output formats end in the same envelope, bare or under `result`. */
function readAgyOutcome(outcome: RunOutcome): { ok: boolean; text: string; denials: string[] } {
  for (const text of outcome.stdout.split("\n").filter((l) => l.trim()).reverse()) {
    const event = parseJson(text);
    const envelope = (event?.event === "result" ? (event.result as Record<string, unknown>) : event) ?? null;
    if (!envelope || typeof envelope.status !== "string") continue;
    const response = typeof envelope.response === "string" ? envelope.response : "";
    return { ok: envelope.status === "SUCCESS" && outcome.status === "ok", text: response, denials: [] };
  }
  return { ok: false, text: outcome.stderr.trim() || outcome.stdout.trim() || `exit code ${outcome.exitCode}`, denials: [] };
}

/** An agent that just prints: the exit code is the verdict, stdout is the answer. */
function readPlainOutcome(outcome: RunOutcome): { ok: boolean; text: string; denials: string[] } {
  const said = outcome.stdout.trim();
  return { ok: outcome.status === "ok", text: said || outcome.stderr.trim() || `exit code ${outcome.exitCode}`, denials: [] };
}

export const ADAPTERS: Record<CanonicalCodingAgent, AgentAdapter> = {
  // `--tools ""` removes every tool; `--max-turns 1` additionally bounds the run.
  claude: {
    program: AGENT_PROGRAMS.claude,
    draft: (prompt) => ({ args: ["-p", "--output-format", "json", "--json-schema", JSON.stringify(DRAFT_SCHEMA), "--tools", "", "--max-turns", "1"], stdin: prompt }),
    job: (prompt, capabilities) => ({
      args: [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--allowedTools",
        spell(capabilities, CLAUDE_TOOLS, (prefix) => `Bash(${prefix}:*)`, "Bash").join(","),
        ...(hasOpenShell(capabilities) ? ["--disallowedTools", `Bash(${DENIED_SHELL}:*)`] : []),
      ],
      stdin: prompt,
    }),
    schemaEnforced: true,
    readLine: readClaudeLine,
    readOutcome: readClaudeOutcome,
  },

  // agy's `-p` is a value flag: left bare it eats the next argument as the
  // prompt and runs something else entirely, so the prompt is attached to it.
  // Its `--json-schema` shapes the *tool result*, not the answer — asking for
  // one got back a summary of the work instead of the work — so a draft here
  // takes the same text path as the other plain agents.
  antigravity: {
    program: AGENT_PROGRAMS.antigravity,
    draft: (prompt) => ({ args: [`--print=${prompt}`, "--output-format", "json", "--disable-slash-commands"] }),
    job: (prompt, capabilities) => ({ args: [`--print=${prompt}`, "--output-format", "stream-json", "--mode", writesFiles(capabilities) ? "accept-edits" : "plan"] }),
    schemaEnforced: false,
    readLine: readAgyLine,
    readOutcome: readAgyOutcome,
  },

  // Copilot takes the prompt on argv and permits tools one flag at a time; with
  // no --allow-tool it can still answer, which is what a draft needs.
  copilot: {
    program: AGENT_PROGRAMS.copilot,
    draft: (prompt) => ({ args: ["--no-color", "--log-level", "none", "-p", prompt] }),
    job: (prompt, capabilities) => ({
      args: [
        "--no-color",
        "--log-level",
        "none",
        ...spell(capabilities, COPILOT_TOOLS, (prefix) => `shell(${prefix}:*)`, "shell").flatMap((tool) => ["--allow-tool", tool]),
        ...(hasOpenShell(capabilities) ? ["--deny-tool", `shell(${DENIED_SHELL}:*)`] : []),
        "-p",
        prompt,
      ],
    }),
    schemaEnforced: false,
    readLine: (text) => line("text", text),
    readOutcome: readPlainOutcome,
  },

  // `codex exec` reads the prompt from stdin when the argument is `-`, and its
  // sandbox is the tool boundary: read-only for a draft, workspace-write for a
  // job that has to change files.
  codex: {
    program: AGENT_PROGRAMS.codex,
    draft: (prompt) => ({ args: ["exec", "--color", "never", "-s", "read-only", "-"], stdin: prompt }),
    job: (prompt, capabilities) => ({ args: ["exec", "--color", "never", "-s", writesFiles(capabilities) ? "workspace-write" : "read-only", "-"], stdin: prompt }),
    schemaEnforced: false,
    readLine: (text) => line("text", text),
    readOutcome: readPlainOutcome,
  },

  // opencode takes the message as positional words; one argument is one message.
  opencode: {
    program: AGENT_PROGRAMS.opencode,
    draft: (prompt) => ({ args: ["run", prompt] }),
    job: (prompt) => ({ args: ["run", prompt] }),
    schemaEnforced: false,
    readLine: (text) => line("text", text),
    readOutcome: readPlainOutcome,
  },
};

export const adapterFor = (agent: CanonicalCodingAgent): AgentAdapter => ADAPTERS[agent];
