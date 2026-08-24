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

/** Porcelain v1 lines → entries; renames keep the destination path. */
export function parsePorcelain(text: string): ChangedPath[] {
  return text
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => {
      const path = line.slice(3).replace(/^"|"$/g, "");
      return { status: line.slice(0, 2), path: path.includes(" -> ") ? (path.split(" -> ")[1] ?? path) : path };
    });
}

export async function gitSummary(run: typeof runProcess = runProcess): Promise<GitSummary> {
  const git = (taskId: string, args: string[]) => run({ taskId, program: "git", args, cwd: "", timeoutMs: 30_000 });
  const [branch, head, status] = await Promise.all([
    git("git-branch", ["rev-parse", "--abbrev-ref", "HEAD"]),
    git("git-head", ["rev-parse", "--short", "HEAD"]),
    git("git-status", ["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  return { branch: check(branch, "git rev-parse").trim(), head: check(head, "git rev-parse").trim(), changes: parsePorcelain(check(status, "git status")) };
}

/** The unified diff of one path — tracked changes only; an untracked file is shown by reading it. */
export async function gitDiff(path: string, run: typeof runProcess = runProcess): Promise<string> {
  const outcome = await run({ taskId: `git-diff-${path}`, program: "git", args: ["diff", "--no-color", "HEAD", "--", path], cwd: "", timeoutMs: 30_000 });
  return check(outcome, "git diff");
}
