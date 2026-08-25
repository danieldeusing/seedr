import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { compileRegistry } from "./compile.js";
import { defaultGit, type GitRunner } from "./identity.js";
import { applyOp } from "./ops/apply.js";
import { parseOp } from "./ops/parse.js";
import type { OpResult, RegistryOp } from "./ops/types.js";
import { itemExists, readItem, readLabels } from "./read.js";
import { itemDir } from "./fsPaths.js";
import { ALL_TYPES, typeDirName } from "./paths.js";
import { formatErrors, validateItem } from "./validate.js";

export interface TransactionOptions {
  repoRoot: string;
  /** Defaults to `<repoRoot>/registry`. */
  registryDir?: string;
  git?: GitRunner;
  /** Defaults to `seedr-ops.lock` in the repo's git directory (worktrees have their own). */
  lockPath?: string;
  /** A lock older than this is considered abandoned. */
  lockStaleMs?: number;
}

export interface TransactionResult {
  result: OpResult;
  headBefore: string;
  /** Repo-relative paths git reports as changed by the operation. */
  changedPaths: string[];
}

export class TransactionError extends Error {
  constructor(
    message: string,
    readonly phase: "precondition" | "apply" | "verify" | "rollback",
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "TransactionError";
  }
}

const DEFAULT_LOCK_STALE_MS = 10 * 60 * 1000;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Take the cross-process lock or throw; returns the release function. */
function acquireLock(lockPath: string, staleMs: number): () => void {
  mkdirSync(dirname(lockPath), { recursive: true });
  if (existsSync(lockPath)) {
    let holder: { pid?: number; time?: number } = {};
    try {
      holder = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
      // unreadable lock: treat as stale below
    }
    const fresh = typeof holder.time === "number" && Date.now() - holder.time < staleMs;
    if (fresh && typeof holder.pid === "number" && pidAlive(holder.pid)) {
      throw new TransactionError(`Another registry operation is running (pid ${holder.pid}); try again when it finishes`, "precondition");
    }
    rmSync(lockPath, { force: true });
  }
  try {
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, time: Date.now() }), { flag: "wx" });
  } catch {
    throw new TransactionError("Another registry operation took the lock first; try again", "precondition");
  }
  return () => rmSync(lockPath, { force: true });
}

function statusPaths(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .flatMap((path) => (path.includes(" -> ") ? path.split(" -> ") : [path]))
    .map((path) => path.replace(/^"|"$/g, ""));
}

const toPosix = (path: string): string => path.split("\\").join("/");

/**
 * Run one registry operation as a transaction:
 *
 * 1. preconditions — lock, clean worktree, record HEAD;
 * 2. apply — the operation, then compile;
 * 3. verify — the item's post-state, that only allowlisted paths changed, and
 *    that HEAD did not move;
 * 4. on any failure, restore `registry/` to HEAD, which the clean-worktree
 *    precondition makes an exact rollback.
 */
export async function runRegistryTransaction(rawOp: unknown, options: TransactionOptions): Promise<TransactionResult> {
  const op = parseOp(rawOp);
  const repoRoot = resolve(options.repoRoot);
  const registryDir = options.registryDir ?? join(repoRoot, "registry");
  const git = options.git ?? defaultGit;
  const registryRel = toPosix(relative(repoRoot, registryDir));
  if (registryRel.startsWith("..")) throw new TransactionError("registryDir must be inside repoRoot", "precondition");

  // `.git` is a file in a linked worktree; ask git where the real directory is.
  const lockPath = options.lockPath ?? join(await git(["rev-parse", "--absolute-git-dir"], repoRoot), "seedr-ops.lock");
  const release = acquireLock(lockPath, options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS);
  try {
    const dirty = await git(["status", "--porcelain", "--untracked-files=all"], repoRoot);
    if (dirty) {
      throw new TransactionError("The worktree has uncommitted changes; commit or stash them first so the operation's diff stays its own", "precondition");
    }
    const headBefore = await git(["rev-parse", "HEAD"], repoRoot);

    const rollback = async (cause: unknown, phase: TransactionError["phase"]): Promise<never> => {
      try {
        await git(["checkout", "--", registryRel], repoRoot);
        // -x removes gitignored strays too: rollback means exactly HEAD, nothing else.
        await git(["clean", "-fdqx", "--", registryRel], repoRoot);
      } catch (rollbackError) {
        throw new TransactionError(
          `Rollback failed: ${(rollbackError as Error).message} — after ${phase} error: ${(cause as Error).message}`,
          "rollback",
          { cause }
        );
      }
      if (cause instanceof TransactionError) throw cause;
      throw new TransactionError(`${phase} failed: ${(cause as Error).message}`, phase, { cause });
    };

    let result: OpResult;
    try {
      result = applyOp(registryDir, op);
      compileRegistry(registryDir);
    } catch (error) {
      return rollback(error, "apply");
    }

    try {
      verifyPostconditions(registryDir, op);
      const changedPaths = statusPaths(await git(["status", "--porcelain", "--untracked-files=all"], repoRoot));
      // Every manifest is compile's output and may legitimately change — including one
      // that was stale before this operation. Item content may change only under the
      // operation's own (type, slug), and the catalogue only under its own operation.
      const allowed = new Set([`${registryRel}/manifest.json`, ...ALL_TYPES.map((type) => `${registryRel}/${typeDirName(type)}/manifest.json`)]);
      const catalogueOp = op.kind === "set-labels";
      if (catalogueOp) allowed.add(`${registryRel}/labels.json`);
      const itemPrefix = catalogueOp ? null : `${registryRel}/${typeDirName(op.type)}/${op.slug}/`;
      const stray = changedPaths.filter((path) => !allowed.has(path) && !(itemPrefix !== null && path.startsWith(itemPrefix)));
      if (stray.length > 0) throw new TransactionError(`Operation touched paths outside its allowlist: ${stray.join(", ")}`, "verify");
      if ((await git(["rev-parse", "HEAD"], repoRoot)) !== headBefore) throw new TransactionError("HEAD moved during the operation", "verify");
      return { result, headBefore, changedPaths };
    } catch (error) {
      return rollback(error, "verify");
    }
  } finally {
    release();
  }
}

function verifyPostconditions(registryDir: string, op: RegistryOp): void {
  if (op.kind === "set-labels") {
    // Reads the file back through the strict parser: what was written must be
    // exactly what the next reader — compile, Studio, the web app — will get.
    const written = readLabels(registryDir);
    if (JSON.stringify(written) !== JSON.stringify(op.labels)) {
      throw new TransactionError("The label catalogue on disk does not match the operation after apply", "verify");
    }
    return;
  }
  const exists = itemExists(registryDir, op.type, op.slug);
  if (op.kind === "remove") {
    if (exists || existsSync(itemDir(registryDir, op.type, op.slug))) throw new TransactionError("Item directory still exists after remove", "verify");
    return;
  }
  if (!exists) throw new TransactionError("item.json is missing after apply", "verify");
  const errors = validateItem(readItem(registryDir, op.type, op.slug), { expectedType: op.type, expectedSlug: op.slug });
  if (errors.length > 0) throw new TransactionError(`Item is invalid after apply: ${formatErrors(errors)}`, "verify");
}
