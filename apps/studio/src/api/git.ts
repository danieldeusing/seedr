import { runProcess, type RunOutcome } from "./agent";

/**
 * Git through the bounded executor, in the repo root, with the machine's own
 * config and credentials. Studio reads the worktree itself — status, diff,
 * branches — and hands publishing to a coding agent, which is the part that
 * needs judgement (pull, conflicts, which branch merges into which).
 */
export interface ChangedPath {
  /** The two porcelain columns, e.g. " M", "??", "A ". */
  status: string;
  path: string;
}

export interface GitSummary {
  branch: string;
  head: string;
  changes: ChangedPath[];
}

function check(outcome: RunOutcome, what: string): string {
  if (outcome.status !== "ok") throw new Error(`${what} ${outcome.status}: ${outcome.stderr.trim() || outcome.stdout.trim() || `exit code ${outcome.exitCode}`}`);
  return outcome.stdout;
}

/**
 * Porcelain v1 `-z` records → entries: NUL-separated, so paths arrive verbatim
 * (no quoting or escaping to undo). A rename carries a second record — its
 * source path — which is dropped; the first is already the destination.
 */
export function parsePorcelain(text: string): ChangedPath[] {
  const records = text.split("\0").filter(Boolean);
  const changes: ChangedPath[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i] as string;
    const status = record.slice(0, 2);
    changes.push({ status, path: record.slice(3) });
    if (status.includes("R") || status.includes("C")) i++;
  }
  return changes;
}

export async function gitSummary(run: typeof runProcess = runProcess): Promise<GitSummary> {
  const git = (taskId: string, args: string[]) => run({ taskId, program: "git", args, cwd: "", timeoutMs: 30_000 });
  const [branch, head, status] = await Promise.all([
    git("git-branch", ["rev-parse", "--abbrev-ref", "HEAD"]),
    git("git-head", ["rev-parse", "--short", "HEAD"]),
    git("git-status", ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  return { branch: check(branch, "git rev-parse").trim(), head: check(head, "git rev-parse").trim(), changes: parsePorcelain(check(status, "git status")) };
}

export interface BranchInfo {
  name: string;
  current: boolean;
  /** The remote-tracking branch, when the local one has an upstream. */
  upstream: string | null;
}

/** Every local branch, in git's own order, with the checked-out one marked. */
export async function gitBranches(run: typeof runProcess = runProcess): Promise<BranchInfo[]> {
  const outcome = await run({
    taskId: "git-branches",
    program: "git",
    args: ["for-each-ref", "--format=%(HEAD)%09%(refname:short)%09%(upstream:short)", "refs/heads"],
    cwd: "",
    timeoutMs: 30_000,
  });
  return check(outcome, "git for-each-ref")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [head = "", name = "", upstream = ""] = line.split("\t");
      return { name, current: head.trim() === "*", upstream: upstream || null };
    })
    .filter((branch) => branch.name);
}

/** The unified diff of one path — tracked changes only; an untracked file is shown by reading it. */
export async function gitDiff(path: string, run: typeof runProcess = runProcess): Promise<string> {
  const outcome = await run({ taskId: `git-diff-${path}`, program: "git", args: ["diff", "--no-color", "HEAD", "--", path], cwd: "", timeoutMs: 30_000 });
  return check(outcome, "git diff");
}

/**
 * Where this checkout stands against the branch it tracks.
 *
 * THE FETCH IS THE POINT. `git status` compares HEAD against the remote-tracking
 * ref in this checkout, which is only as fresh as the last fetch — so without
 * one it will report "up to date" however long ago another machine pushed. That
 * is the failure this is here to prevent, not a detail of it: Studio is run on
 * more than one host against the same registry, and a stale checkout shows a
 * capability list that is confidently wrong.
 *
 * Which branch is compared against is git's own answer, not a name written here.
 * `@{upstream}` is whatever the current branch tracks — `origin/main` in one
 * checkout, `origin/prod` in another — so this needs no per-repository rule and
 * cannot disagree with what a pull would actually do.
 *
 * `fetched: false` is not the same as up to date, and callers must not round it
 * to one. A laptop with no network gets an honest "could not reach the remote".
 */
export interface RemoteState {
  /** The tracking branch, e.g. `origin/main`; null when the branch has none. */
  upstream: string | null;
  /** Commits the upstream has that this checkout does not — what a pull brings. */
  behind: number;
  /** Commits made here that the upstream does not have. */
  ahead: number;
  /** Whether the numbers rest on a fetch that actually reached the remote. */
  fetched: boolean;
  /** Why it did not, when it did not. */
  fetchError: string | null;
}

export async function gitRemoteState(run: typeof runProcess = runProcess): Promise<RemoteState> {
  const git = (taskId: string, args: string[], timeoutMs = 30_000) => run({ taskId, program: "git", args, cwd: "", timeoutMs });

  const upstreamOutcome = await git("git-upstream", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  // A branch with no upstream is a normal state, not a failure: a local-only
  // branch has nothing to be behind.
  if (upstreamOutcome.status !== "ok" || upstreamOutcome.exitCode !== 0) {
    return { upstream: null, behind: 0, ahead: 0, fetched: false, fetchError: null };
  }
  const upstream = upstreamOutcome.stdout.trim();

  // Longer than the other git calls because this one is on the network, and
  // --quiet because the progress goes to stderr and is not read.
  const fetch = await git("git-fetch", ["fetch", "--quiet"], 120_000);
  const fetched = fetch.status === "ok" && fetch.exitCode === 0;
  const fetchError = fetched ? null : fetch.stderr.trim() || fetch.stdout.trim() || `git fetch exited ${fetch.exitCode}`;

  // left = in the upstream only (behind), right = here only (ahead).
  const counts = await git("git-tracking", ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
  const [behind = "0", ahead = "0"] = check(counts, "git rev-list").trim().split(/\s+/);
  return { upstream, behind: Number(behind) || 0, ahead: Number(ahead) || 0, fetched, fetchError };
}
