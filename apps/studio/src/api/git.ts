import { runProcess, type RunOutcome } from "./agent";

/**
 * Git, read-only (plan §6.6: status and diff in v1, no commit or push). Runs the
 * system git through the bounded executor in the repo root.
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

/** The unified diff of one path — tracked changes only; an untracked file is shown by reading it. */
export async function gitDiff(path: string, run: typeof runProcess = runProcess): Promise<string> {
  const outcome = await run({ taskId: `git-diff-${path}`, program: "git", args: ["diff", "--no-color", "HEAD", "--", path], cwd: "", timeoutMs: 30_000 });
  return check(outcome, "git diff");
}
