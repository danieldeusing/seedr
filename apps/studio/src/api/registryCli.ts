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

/** `npx tsx scripts/registry-op.ts …` in the repo root; npx resolves the `.cmd` shim on Windows. */
const cliArgs = (...args: string[]): string[] => ["tsx", "scripts/registry-op.ts", ...args];

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

export async function runRegistryOp(op: RegistryOp, taskId = `op-${op.kind}-${op.type}-${op.slug}`, run: typeof runProcess = runProcess): Promise<RegistryOpOutcome> {
  const outcome = await run({ taskId, program: "npx", args: cliArgs("run", "--op", "-"), stdin: JSON.stringify(op), cwd: "", timeoutMs: REGISTRY_OP_TIMEOUT_MS });
  return parseJsonStdout<RegistryOpOutcome>(outcome, `${op.kind} ${op.type}/${op.slug}`);
}

/** The state hash an update or remove must present — read from disk by the CLI at that moment. */
export async function itemHash(type: string, slug: string, run: typeof runProcess = runProcess): Promise<string> {
  const outcome = await run({ taskId: `registry-hash-${type}-${slug}`, program: "npx", args: cliArgs("hash", type, slug), cwd: "", timeoutMs: 60_000 });
  return parseJsonStdout<{ hash: string }>(outcome, `hash ${type}/${slug}`).hash;
}

export async function repoIdentity(run: typeof runProcess = runProcess): Promise<RepoIdentity> {
  const outcome = await run({ taskId: "registry-identity", program: "npx", args: cliArgs("identity"), cwd: "", timeoutMs: 60_000 });
  return parseJsonStdout<RepoIdentity>(outcome, "identity");
}
