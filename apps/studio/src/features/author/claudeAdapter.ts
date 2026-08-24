import { runProcess, type RunOutcome } from "@/api/agent";
import { buildPrompt, DRAFT_SCHEMA, parseDraft, type DraftRequest, type DraftResult } from "./metadataContract";

/**
 * The Claude Code adapter — the one certified in P4 (plan §6.2).
 *
 * Flags verified against Claude Code 2.1.226 on 2026-08-22 and re-probed at
 * runtime: `-p` (non-interactive, prompt on stdin), `--output-format json`,
 * `--json-schema` (structured output), `--max-turns 1`. One turn is the
 * tool-free bound: the model cannot complete a tool round-trip inside it, so
 * there is nothing to hijack and nothing to half-apply.
 */
export const CLAUDE_MIN_VERSION = [2, 1, 0] as const;
export const DRAFT_TIMEOUT_MS = 120_000;

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

/** Runs `claude --version` and `claude --help`; disables the adapter with a reason rather than degrading. */
export async function probeClaude(run: typeof runProcess = runProcess): Promise<AdapterProbe> {
  const versionRun = await run({ taskId: "probe-claude-version", program: "claude", args: ["--version"], timeoutMs: 15_000 });
  if (versionRun.status === "not-found") {
    return { available: false, version: null, diagnostic: "Claude Code is not installed or not on PATH: npm install -g @anthropic-ai/claude-code" };
  }
  const version = versionOf(versionRun.stdout);
  if (versionRun.status !== "ok" || !version) {
    return { available: false, version: null, diagnostic: `claude --version failed: ${versionRun.stderr || versionRun.stdout || versionRun.status}` };
  }
  if (!atLeast(version, CLAUDE_MIN_VERSION)) {
    return { available: false, version, diagnostic: `Claude Code ${version} is too old; ${CLAUDE_MIN_VERSION.join(".")} or newer is required` };
  }
  const helpRun = await run({ taskId: "probe-claude-help", program: "claude", args: ["--help"], timeoutMs: 15_000 });
  for (const flag of ["--json-schema", "--output-format", "--max-turns"]) {
    if (!helpRun.stdout.includes(flag)) {
      return { available: false, version, diagnostic: `Claude Code ${version} lacks ${flag}; update it` };
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
  return ["-p", "--output-format", "json", "--json-schema", JSON.stringify(DRAFT_SCHEMA), "--max-turns", "1"];
}

/**
 * Ask Claude for a metadata draft. Retries once with the validation error
 * appended; a second malformed answer fails visibly.
 */
export async function draftWithClaude(request: DraftRequest, run: typeof runProcess = runProcess, taskId = `draft-${request.type}-${request.slug}`): Promise<DraftResult> {
  const base = buildPrompt(request);
  const attempt = async (index: number, prompt: string): Promise<DraftResult> => {
    const outcome = normaliseClaudeOutcome(await run({ taskId: `${taskId}-${index}`, program: "claude", args: claudeDraftArgs(), stdin: prompt, timeoutMs: DRAFT_TIMEOUT_MS }));
    if (outcome.status !== "ok") return { ok: false, errors: [`claude ${outcome.status}: ${outcome.text || "no output"}`] };
    return parseDraft(outcome.structured ?? outcome.text);
  };

  const first = await attempt(0, base);
  if (first.ok || first.errors[0]?.startsWith("claude ")) return first;
  const second = await attempt(1, `${base}\n\nYour previous answer was rejected: ${first.errors.join("; ")}. Answer again with JSON only.`);
  if (second.ok || second.errors[0]?.startsWith("claude ")) return second;
  return { ok: false, errors: ["the draft was rejected twice", ...second.errors] };
}
