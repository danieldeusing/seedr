import type { CanonicalCodingAgent } from "@seedr/shared";
import { runProcess, type RunOutcome } from "@/api/agent";
import { openRepoRoot } from "@/api/registryCli";
import { AGENT_LABELS } from "@seedr/registry-ops/pure";
import { adapterFor, jsonCandidates } from "./adapters";
import { buildPrompt, parseDraft, type DraftRequest, type DraftResult } from "./metadataContract";

/**
 * The Claude Code adapter — the one certified in P4 (plan §6.2).
 *
 * Flags verified against Claude Code 2.1.226 on 2026-08-22 and re-probed at
 * runtime: `-p` (non-interactive, prompt on stdin), `--output-format json`,
 * `--json-schema` (structured output), `--tools ""` (no tools), `--max-turns 1`. One turn is the
 * tool-free bound: the model cannot complete a tool round-trip inside it, so
 * there is nothing to hijack and nothing to half-apply.
 */
export const CLAUDE_MIN_VERSION = [2, 1, 0] as const;
// opencode took over 90 seconds to answer a one-line prompt on a warm machine;
// a draft is a single shot, so it waits rather than failing a slow agent.
export const DRAFT_TIMEOUT_MS = 300_000;

export interface AdapterProbe {
  available: boolean;
  version: string | null;
  /** Actionable when unavailable: what to install or fix. */
  diagnostic: string | null;
}

const versionOf = (text: string): string | null => /(\d+\.\d+\.\d+)/.exec(text)?.[1] ?? null;

const atLeast = (version: string, min: readonly [number, number, number]): boolean => {
  const parts = version.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const have = parts[i] ?? 0;
    const want = min[i] ?? 0;
    if (have !== want) return have > want;
  }
  return true;
};

/**
 * Is this agent's CLI here and usable? Every adapter is probed by `--version`;
 * Claude Code is additionally checked for the flags its draft depends on, since
 * those changed within living memory. The other CLIs' flags were verified
 * against installed versions and are not re-derived at runtime — a wrong one
 * fails the run visibly rather than silently degrading it.
 */
export async function probeAgent(agent: CanonicalCodingAgent = "claude", run: typeof runProcess = runProcess): Promise<AdapterProbe> {
  const adapter = adapterFor(agent);
  const label = AGENT_LABELS[agent];
  const versionRun = await run({ taskId: `probe-${agent}-version`, program: adapter.program, args: ["--version"], timeoutMs: 15_000 });
  if (versionRun.status === "not-found") {
    return { available: false, version: null, diagnostic: `${label} is not installed or not on PATH — set its path in settings → coding agents` };
  }
  const version = versionOf(versionRun.stdout) ?? versionOf(versionRun.stderr);
  if (versionRun.status !== "ok" || !version) {
    return { available: false, version: null, diagnostic: `${adapter.program} --version failed: ${versionRun.stderr || versionRun.stdout || versionRun.status}` };
  }
  if (agent !== "claude") return { available: true, version, diagnostic: null };

  if (!atLeast(version, CLAUDE_MIN_VERSION)) {
    return { available: false, version, diagnostic: `${label} ${version} is too old; ${CLAUDE_MIN_VERSION.join(".")} or newer is required` };
  }
  const helpRun = await run({ taskId: "probe-claude-help", program: adapter.program, args: ["--help"], timeoutMs: 15_000 });
  // `--max-turns` is accepted but not listed in --help on 2.1.226, so it cannot be probed here.
  for (const flag of ["--json-schema", "--output-format", "--tools"]) {
    if (!helpRun.stdout.includes(flag)) {
      return { available: false, version, diagnostic: `${label} ${version} lacks ${flag}; update it` };
    }
  }
  return { available: true, version, diagnostic: null };
}

/** Claude Code's `--output-format json` envelope — only the fields the adapter reads. */
interface ClaudeResultEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  permission_denials?: unknown[];
}

export interface NormalisedOutcome {
  status: "ok" | "error" | "cancelled" | "timeout";
  text: string;
  structured: unknown;
  denials: number;
}

function parseEnvelope(stdout: string): ClaudeResultEnvelope | null {
  try {
    return JSON.parse(stdout.trim()) as ClaudeResultEnvelope;
  } catch {
    return null;
  }
}

/** Normalise the raw run into a Studio-owned shape; never assume another agent's envelope. */
export function normaliseClaudeOutcome(outcome: RunOutcome): NormalisedOutcome {
  if (outcome.status === "cancelled" || outcome.status === "timeout") {
    return { status: outcome.status, text: outcome.stderr, structured: null, denials: 0 };
  }
  const envelope = parseEnvelope(outcome.stdout);
  if (!envelope || envelope.type !== "result") {
    return { status: "error", text: outcome.stderr || outcome.stdout || `exit code ${outcome.exitCode}`, structured: null, denials: 0 };
  }
  const denials = Array.isArray(envelope.permission_denials) ? envelope.permission_denials.length : 0;
  if (envelope.is_error || outcome.status !== "ok") {
    return { status: "error", text: typeof envelope.result === "string" ? envelope.result : outcome.stderr, structured: null, denials };
  }
  return {
    status: "ok",
    text: typeof envelope.result === "string" ? envelope.result : "",
    structured: envelope.structured_output ?? null,
    denials,
  };
}

export function claudeDraftArgs(): string[] {
  return adapterFor("claude").draft("", "").args;
}

/**
 * Ask an agent for a metadata draft. Retries once with the validation error
 * appended; a second malformed answer fails visibly. An agent whose CLI cannot
 * enforce a schema still answers as text, which the same validator judges — the
 * contract is the JSON we accept, not the flag that asked for it.
 */
export async function draftWith(
  agent: CanonicalCodingAgent,
  request: DraftRequest,
  run: typeof runProcess = runProcess,
  taskId = `draft-${request.type}-${request.slug}`
): Promise<DraftResult> {
  const adapter = adapterFor(agent);
  const base = buildPrompt(request);
  const failed = (message: string) => message.startsWith(`${adapter.program} `);
  const attempt = async (index: number, prompt: string): Promise<DraftResult> => {
    const invocation = adapter.draft(prompt, openRepoRoot());
    const raw = await run({ taskId: `${taskId}-${index}`, program: adapter.program, args: invocation.args, ...(invocation.stdin ? { stdin: invocation.stdin } : {}), timeoutMs: DRAFT_TIMEOUT_MS });
    const verdict = adapter.readOutcome(raw);
    // A run the user stopped, or one the watchdog ended, is not a refusal by the
    // agent — say which it was rather than blaming the answer.
    if (!verdict.ok) {
      const how = raw.status === "cancelled" || raw.status === "timeout" ? raw.status : "failed";
      return { ok: false, errors: [`${adapter.program} ${how}: ${verdict.text || "no output"}`] };
    }
    if (adapter.schemaEnforced) {
      const outcome = normaliseClaudeOutcome(raw);
      return parseDraft(outcome.structured ?? outcome.text);
    }
    // A plain-text agent frames its answer, and may print more than one object:
    // the answer is the first candidate the validator accepts, which is why the
    // rules do real work here rather than the framing.
    const candidates = jsonCandidates(verdict.text);
    let last: DraftResult = { ok: false, errors: ["the answer had no JSON in it"] };
    for (const candidate of candidates) {
      last = parseDraft(candidate);
      if (last.ok) return last;
    }
    return last;
  };

  const first = await attempt(0, base);
  if (first.ok || failed(first.errors[0] ?? "")) return first;
  const second = await attempt(1, `${base}\n\nYour previous answer was rejected: ${first.errors.join("; ")}. Answer again with JSON only.`);
  if (second.ok || failed(second.errors[0] ?? "")) return second;
  return { ok: false, errors: ["the draft was rejected twice", ...second.errors] };
}

/** An agent that just prints: the exit code is the verdict, stdout is the answer. */
export function normalisePlainOutcome(outcome: RunOutcome): NormalisedOutcome {
  if (outcome.status === "cancelled" || outcome.status === "timeout") return { status: outcome.status, text: outcome.stderr || outcome.stdout, structured: null, denials: 0 };
  if (outcome.status !== "ok") return { status: "error", text: outcome.stderr || outcome.stdout || `exit code ${outcome.exitCode}`, structured: null, denials: 0 };
  return { status: "ok", text: outcome.stdout, structured: null, denials: 0 };
}
