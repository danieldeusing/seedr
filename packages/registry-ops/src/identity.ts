import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Runs `git` with the given args in `cwd` and returns trimmed stdout; injectable for tests. */
export type GitRunner = (args: string[], cwd: string) => Promise<string>;

export const defaultGit: GitRunner = async (args, cwd) => {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  // Only the end is trimmed: a porcelain status line can start with a space (" D path").
  return stdout.trimEnd();
};

export interface RepoIdentity {
  /** e.g. "acme" — the GitHub owner, when the origin remote is a GitHub URL. */
  owner: string | null;
  repo: string | null;
  defaultBranch: string | null;
  /** `git config user.name`, the only author name the repo can vouch for. */
  authorName: string | null;
  remoteUrl: string | null;
}

const GITHUB_REMOTE = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/;

async function tryGit(git: GitRunner, args: string[], cwd: string): Promise<string | null> {
  try {
    const out = await git(args, cwd);
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Derive who this registry belongs to from the repo itself — never from a
 * constant. A fork gets its own owner, repo and default branch, or nulls, which
 * callers must treat as "omit the field", not "fall back to upstream".
 */
export async function deriveRepoIdentity(repoRoot: string, git: GitRunner = defaultGit): Promise<RepoIdentity> {
  const remoteUrl = await tryGit(git, ["remote", "get-url", "origin"], repoRoot);
  const match = remoteUrl ? GITHUB_REMOTE.exec(remoteUrl) : null;
  const head = await tryGit(git, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repoRoot);
  return {
    owner: match?.[1] ?? null,
    repo: match?.[2] ?? null,
    defaultBranch: head ? head.replace(/^origin\//, "") : null,
    authorName: await tryGit(git, ["config", "user.name"], repoRoot),
    remoteUrl,
  };
}

/** The GitHub tree URL for an item directory, or null when the repo cannot vouch for one. */
export function itemExternalUrl(identity: RepoIdentity, registryRelativeDir: string): string | null {
  if (!identity.owner || !identity.repo || !identity.defaultBranch) return null;
  return `https://github.com/${identity.owner}/${identity.repo}/tree/${identity.defaultBranch}/${registryRelativeDir}`;
}
