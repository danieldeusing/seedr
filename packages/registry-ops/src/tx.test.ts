import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { makeTempDir } from "./test/tempDir.js";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { itemStateHash } from "./hash.js";
import { LONG, git, makeRepo } from "./test/fixtures.js";
import { TransactionError, runRegistryTransaction } from "./tx.js";
import type { AddLocalOp, RemoveOp } from "./ops/types.js";

function makeSource(): string {
  const dir = makeTempDir("seedr-tx-source-");
  writeFileSync(join(dir, "SKILL.md"), "# Tx skill\n");
  return dir;
}

const addOp = (): AddLocalOp => ({
  v: 1,
  kind: "add-local",
  type: "skill",
  slug: "tx-skill",
  sourcePath: makeSource(),
  name: "Tx Skill",
  description: "Transactional.",
  longDescription: LONG,
  compatibility: ["claude"],
  author: { name: "Fork Owner" },
});

const status = (repo: string) => git(repo, "status", "--porcelain", "--untracked-files=all");
const lockPath = (repo: string) => join(repo, ".git", "seedr-ops.lock");

describe("runRegistryTransaction", () => {
  test("rolls back when the operation touched a path outside its allowlist", async () => {
    const repo = makeRepo();
    const strayFile = join(repo, "registry", "skills", "stray.md");

    // The transaction's core promise (AGENTS.md): only the item's own paths and
    // the manifests may change. Only the happy path was tested — this branch,
    // the actual guarantee, had none. The stray write is made real, then seen
    // through the injected git runner exactly as a real `status` would report it.
    // status runs twice: the clean-worktree precondition, then the verify. The
    // stray write belongs to the operation, i.e. after the precondition passed.
    let statusCalls = 0;
    const runner = async (args: string[], cwd: string) => {
      if (args[0] === "status" && ++statusCalls === 2) writeFileSync(strayFile, "stray\n");
      return git(cwd, ...args);
    };

    await expect(runRegistryTransaction(addOp(), { repoRoot: repo, git: runner })).rejects.toThrow(
      /outside its allowlist/
    );

    // rollback restored the worktree: the stray file and the new item are gone
    expect(existsSync(strayFile)).toBe(false);
    expect(existsSync(join(repo, "registry", "skills", "tx-skill"))).toBe(false);
    expect(status(repo)).toBe("");
  });

  test("applies, compiles, and reports only allowlisted changed paths", async () => {
    const repo = makeRepo();
    const { result, changedPaths, headBefore } = await runRegistryTransaction(addOp(), { repoRoot: repo });

    expect(result.item?.slug).toBe("tx-skill");
    expect(headBefore).toMatch(/^[0-9a-f]{40}$/);
    expect(changedPaths.sort()).toEqual(["registry/manifest.json", "registry/skills/manifest.json", "registry/skills/tx-skill/SKILL.md", "registry/skills/tx-skill/item.json"].sort());
    expect(JSON.parse(readFileSync(join(repo, "registry", "skills", "manifest.json"), "utf8")).items.map((i: { slug: string }) => i.slug)).toContain("tx-skill");
    expect(existsSync(lockPath(repo))).toBe(false);
  });

  test("refuses a dirty worktree before touching anything", async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "untracked.txt"), "wip\n");
    await expect(runRegistryTransaction(addOp(), { repoRoot: repo })).rejects.toThrow(/uncommitted changes/);
    expect(existsSync(join(repo, "registry", "skills", "tx-skill"))).toBe(false);
  });

  test("rolls back completely when the operation itself fails", async () => {
    const repo = makeRepo();
    const op: RemoveOp = { v: 1, kind: "remove", type: "skill", slug: "alpha", sourceType: "seedr", expectedHash: "0000000000000000" };
    await expect(runRegistryTransaction(op, { repoRoot: repo })).rejects.toThrow(/changed since it was read/);
    expect(status(repo)).toBe("");
  });

  test("rolls back when a postcondition fails, leaving the worktree exactly as before", async () => {
    const repo = makeRepo();
    // A git runner that reports HEAD moving mid-transaction: the verify phase must refuse and restore.
    let reads = 0;
    const movingHead = async (args: string[], cwd: string) => {
      const out = git(cwd, ...args);
      if (args[0] === "rev-parse" && args[1] === "HEAD") return `${out.slice(0, 39)}${reads++ === 0 ? "0" : "1"}`;
      return out;
    };
    await expect(runRegistryTransaction(addOp(), { repoRoot: repo, git: movingHead })).rejects.toThrow(/HEAD moved/);
    expect(status(repo)).toBe("");
    expect(existsSync(join(repo, "registry", "skills", "tx-skill"))).toBe(false);
  });

  test("refuses while another live process holds the lock, and takes over a stale one", async () => {
    const repo = makeRepo();
    const lock = lockPath(repo);
    mkdirSync(join(repo, ".git"), { recursive: true });
    writeFileSync(lock, JSON.stringify({ pid: process.pid, time: Date.now() }));
    await expect(runRegistryTransaction(addOp(), { repoRoot: repo })).rejects.toThrow(/Another registry operation is running/);

    writeFileSync(lock, JSON.stringify({ pid: process.pid, time: Date.now() - 60 * 60 * 1000 }));
    const { result } = await runRegistryTransaction(addOp(), { repoRoot: repo, lockStaleMs: 1000 });
    expect(result.item?.slug).toBe("tx-skill");
  });

  test("a remove transaction verifies the directory is gone", async () => {
    const repo = makeRepo();
    const op: RemoveOp = {
      v: 1,
      kind: "remove",
      type: "skill",
      slug: "alpha",
      sourceType: "seedr",
      expectedHash: itemStateHash(join(repo, "registry"), "skill", "alpha") as string,
    };
    const { changedPaths } = await runRegistryTransaction(op, { repoRoot: repo });
    expect(changedPaths).toEqual(expect.arrayContaining(["registry/skills/alpha/item.json", "registry/skills/manifest.json"]));
    expect(existsSync(join(repo, "registry", "skills", "alpha"))).toBe(false);
  });

  test("a malformed payload never reaches the lock", async () => {
    const repo = makeRepo();
    await expect(runRegistryTransaction({ v: 1, kind: "remove" }, { repoRoot: repo })).rejects.toThrow(/Invalid operation/);
    expect(existsSync(lockPath(repo))).toBe(false);
  });

  test("TransactionError carries the phase", async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "dirty.txt"), "x");
    const error = await runRegistryTransaction(addOp(), { repoRoot: repo }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransactionError);
    expect((error as TransactionError).phase).toBe("precondition");
  });
});
