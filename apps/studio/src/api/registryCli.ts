import type { OpResult, RegistryOp } from "@seedr/registry-ops/pure";
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

function parseJsonStdout<T>(outcome: RunOutcome, what: string): T {
  if (outcome.status !== "ok") {
    const detail = outcome.stderr.trim() || outcome.stdout.trim() || `exit code ${outcome.exitCode}`;
    throw new Error(`${what} ${outcome.status === "failed" ? "failed" : outcome.status}: ${detail}`);
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

export async function repoIdentity(run: typeof runProcess = runProcess): Promise<RepoIdentity> {
  const outcome = await run({ taskId: "registry-identity", program: "npx", ...cli("identity"), cwd: "", timeoutMs: 60_000 });
  return parseJsonStdout<RepoIdentity>(outcome, "identity");
}
