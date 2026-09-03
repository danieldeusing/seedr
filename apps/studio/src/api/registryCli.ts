import type { OpResult, RegistryOp, SourceStatus } from "@seedr/registry-ops/pure";
import { runProcess, type RunOutcome } from "./agent";

/**
 * Every mutation goes through the repo's own operations CLI, which runs it as a
 * transaction (preconditions, apply, compile, verify, rollback). The webview
 * never copies, deletes or compiles; it hands a JSON operation to the checkout
 * it is looking at and reads the result back.
 */
export const REGISTRY_OP_TIMEOUT_MS = 180_000;

/** Exactly what `registry-op.ts run` prints: the OpResult fields spread flat, plus the transaction's. */
export interface RegistryOpOutcome extends OpResult {
  ok: true;
  changedPaths: string[];
  headBefore: string;
}

export interface RepoIdentity {
  owner: string | null;
  repo: string | null;
  defaultBranch: string | null;
  authorName: string | null;
  remoteUrl: string | null;
  externalUrlTemplate: string | null;
}

/**
 * Where the operations CLI runs, and on what. Normally both are the open
 * checkout. A registry whose own tooling predates that CLI — a fork made before
 * it existed — has none to run, so the CLI runs from the default checkout with
 * `--repo` naming the open one. The transaction takes a repo root and runs git
 * inside it, so the work still happens where the registry is.
 */
export interface OpsInvocation {
  args: string[];
  inDefaultRepo: boolean;
}

export function opsInvocation(open: { root: string; hasOps: boolean } | null, args: string[]): OpsInvocation {
  const borrowed = open !== null && !open.hasOps;
  return {
    args: ["tsx", "scripts/registry-op.ts", ...(borrowed ? ["--repo", open.root] : []), ...args],
    inDefaultRepo: borrowed,
  };
}

/**
 * The open checkout, as the api layer needs to know it. The store sets this
 * whenever the checkout changes rather than the api reaching into a feature.
 */
let openCheckout: { root: string; hasOps: boolean } | null = null;
export const setOpsCheckout = (checkout: { root: string; hasOps: boolean } | null): void => {
  openCheckout = checkout;
};

/**
 * The open checkout's absolute path, empty before one is chosen. An agent run
 * needs it because not every CLI takes the working directory it is spawned in
 * (see the opencode adapter).
 */
export const openRepoRoot = (): string => openCheckout?.root ?? "";

/** `npx tsx scripts/registry-op.ts …`; npx resolves the `.cmd` shim on Windows. */
const cli = (...args: string[]): OpsInvocation => opsInvocation(openCheckout, args);

/**
 * The operation's own message, out of whatever the toolchain printed around it.
 * `npx` warns about unknown env config on some machines — six lines of it — and
 * the one sentence that says what went wrong was arriving underneath, where a
 * reader stops looking. The CLI prefixes its own errors, so they can be picked
 * out; anything else is passed through whole rather than guessed at.
 */
export function operationError(outcome: RunOutcome): string {
  const stderr = outcome.stderr.trim();
  const own = stderr.split("\n").filter((line) => line.trim().startsWith("registry-op:"));
  return own.length > 0 ? own.join("\n") : stderr || outcome.stdout.trim() || `exit code ${outcome.exitCode}`;
}

function parseJsonStdout<T>(outcome: RunOutcome, what: string): T {
  if (outcome.status !== "ok") {
    throw new Error(`${what} ${outcome.status === "failed" ? "failed" : outcome.status}: ${operationError(outcome)}`);
  }
  try {
    return JSON.parse(outcome.stdout) as T;
  } catch {
    throw new Error(`${what}: unreadable result: ${outcome.stdout.slice(0, 200)}`);
  }
}

/** What an operation acts on, for the task id and the error text. `set-labels` acts on the catalogue, not an item. */
const opTarget = (op: RegistryOp): string => ("type" in op ? `${op.type}/${op.slug}` : "labels");

export async function runRegistryOp(op: RegistryOp, taskId = `op-${op.kind}-${opTarget(op).replace("/", "-")}`, run: typeof runProcess = runProcess): Promise<RegistryOpOutcome> {
  const outcome = await run({ taskId, program: "npx", ...cli("run", "--op", "-"), stdin: JSON.stringify(op), cwd: "", timeoutMs: REGISTRY_OP_TIMEOUT_MS });
  return parseJsonStdout<RegistryOpOutcome>(outcome, `${op.kind} ${opTarget(op)}`);
}

/** The state hash an update or remove must present — read from disk by the CLI at that moment. */
export async function itemHash(type: string, slug: string, run: typeof runProcess = runProcess): Promise<string> {
  const outcome = await run({ taskId: `registry-hash-${type}-${slug}`, program: "npx", ...cli("hash", type, slug), cwd: "", timeoutMs: 60_000 });
  return parseJsonStdout<{ hash: string }>(outcome, `hash ${type}/${slug}`).hash;
}

/**
 * Where an item stands against the folder it was copied from.
 *
 * Asked of the CLI rather than read here: the folder is outside the checkout,
 * and the host's filesystem bridge refuses every path that is.
 */
export async function sourceStatusOf(type: string, slug: string, run: typeof runProcess = runProcess): Promise<SourceStatus> {
  const outcome = await run({ taskId: `registry-source-${type}-${slug}`, program: "npx", ...cli("source-status", type, slug), cwd: "", timeoutMs: 60_000 });
  return parseJsonStdout<SourceStatus>(outcome, `source-status ${type}/${slug}`);
}

/** Every item that records an origin, and where each stands — one run for the lot. */
export async function allSourceStatuses(run: typeof runProcess = runProcess): Promise<(SourceStatus & { type: string; slug: string })[]> {
  const outcome = await run({ taskId: "registry-source-all", program: "npx", ...cli("source-status"), cwd: "", timeoutMs: 60_000 });
  // `?? []` because this parses another process's output: a CLI that answered
  // something else should leave the list empty, not crash the window.
  return parseJsonStdout<{ items?: (SourceStatus & { type: string; slug: string })[] }>(outcome, "source-status").items ?? [];
}

/**
 * Where a synced item stands against the repository the sync copies it from:
 * `behind` is what the next sync would change, `unknown` says why it could not
 * be compared. First-party items are absent — they have no upstream.
 */
export interface UpstreamStatus {
  type: string;
  slug: string;
  state: "current" | "behind" | "unknown";
  reason?: string;
  upstream?: { repo: string; sha: string; path: string };
  /** Only for `behind`: when upstream last changed the item. */
  upstreamUpdatedAt?: string;
}

/**
 * Every synced item against its upstream — the daily sync's question, asked on
 * demand. It reaches GitHub, so it gets the operation timeout rather than the
 * minute the local reads get.
 */
export async function upstreamStatuses(run: typeof runProcess = runProcess): Promise<{ checkedAt: string; items: UpstreamStatus[] }> {
  const outcome = await run({ taskId: "registry-upstream-all", program: "npx", ...cli("upstream-status"), cwd: "", timeoutMs: REGISTRY_OP_TIMEOUT_MS });
  // Defaults for the same reason `allSourceStatuses` has them: another process's output.
  const answer = parseJsonStdout<{ checkedAt?: string; items?: UpstreamStatus[] }>(outcome, "upstream-status");
  return { checkedAt: answer.checkedAt ?? "", items: answer.items ?? [] };
}

/** What the source folder has that the copy here does not, as a unified diff. */
export async function sourceDiffOf(type: string, slug: string, run: typeof runProcess = runProcess): Promise<string> {
  const outcome = await run({ taskId: `registry-source-diff-${type}-${slug}`, program: "npx", ...cli("source-diff", type, slug), cwd: "", timeoutMs: 60_000 });
  return parseJsonStdout<{ diff?: string }>(outcome, `source-diff ${type}/${slug}`).diff ?? "";
}

export async function repoIdentity(run: typeof runProcess = runProcess): Promise<RepoIdentity> {
  const outcome = await run({ taskId: "registry-identity", program: "npx", ...cli("identity"), cwd: "", timeoutMs: 60_000 });
  return parseJsonStdout<RepoIdentity>(outcome, "identity");
}
