import type { RegistryItem } from "@seedr/shared";

/**
 * Immutable source resolution — the CLI side of §1 of docs/registry-integrity.md.
 *
 * Content of a remote item is fetched at the commit recorded in the registry
 * (`sourceRevision`, or `pluginSource.sha` / `marketplaceRef.sha` for
 * plugins), never from a moving branch. Only `https://github.com/<owner>/<repo>`
 * sources are understood; anything else fails closed with "unsupported source
 * host". Items that carry no revision field at all are legacy and keep the
 * branch-based URL derived from `externalUrl`.
 */

const GITHUB_REPO_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(.*))?$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const RAW_HOST = "https://raw.githubusercontent.com";

export interface GitHubRepo {
  owner: string;
  repo: string;
  /** Whatever followed `<owner>/<repo>/` in the URL, e.g. `tree/main/skills/pdf`. */
  rest: string;
}

export interface ResolvedSource {
  /** Raw base URL of the item's own directory. */
  baseUrl: string;
  /** Raw base URL of the repository root at the same revision (license files live here). */
  rootUrl: string;
  /** The commit the URLs are pinned to; `null` for legacy branch-based items. */
  revision: string | null;
}

/**
 * Parse `https://github.com/<owner>/<repo>[.git][/<rest>]`. Returns `null` for
 * every other host or shape — callers must treat that as "unsupported".
 */
export function parseGitHubRepo(url: string): GitHubRepo | null {
  const match = GITHUB_REPO_PATTERN.exec(url);
  if (!match) return null;
  const owner = match[1]!;
  const repo = match[2]!;
  if (owner.includes("..") || repo.includes("..") || owner.startsWith(".") || repo.startsWith(".")) {
    return null;
  }
  return { owner, repo, rest: match[3] ?? "" };
}

/** Validate and normalise a repository-relative path: no empty, `.` or `..` segments, no backslashes. */
export function assertSafeRepoPath(path: string, what: string): string {
  const trimmed = path.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "";
  for (const segment of trimmed.split("/")) {
    if (segment === "" || segment === "." || segment === ".." || segment.includes("\\")) {
      throw new Error(`Unsafe ${what}: ${JSON.stringify(path)}`);
    }
  }
  return trimmed;
}

function assertCommitSha(value: string | undefined, what: string): string {
  if (!value || !COMMIT_SHA_PATTERN.test(value)) {
    throw new Error(`Invalid ${what}: ${JSON.stringify(value)} (expected 40 lowercase hex characters)`);
  }
  return value;
}

function rawUrl(owner: string, repo: string, ref: string, path: string): string {
  const base = `${RAW_HOST}/${owner}/${repo}/${ref}`;
  return path ? `${base}/${path}` : base;
}

/**
 * Split a GitHub `externalUrl` into repository and in-repo path.
 * `https://github.com/o/r/tree/<branch>/<path>` → branch + path; a bare
 * repository URL (or `/tree/<branch>` with no path) means the repository root.
 */
function parseExternalUrl(externalUrl: string): { owner: string; repo: string; branch: string | null; path: string } {
  const parsed = parseGitHubRepo(externalUrl);
  if (!parsed) {
    throw new Error(`unsupported source host: ${externalUrl}`);
  }
  if (parsed.rest === "") {
    return { owner: parsed.owner, repo: parsed.repo, branch: null, path: "" };
  }
  const treeMatch = /^tree\/([^/]+)(?:\/(.*))?$/.exec(parsed.rest);
  if (!treeMatch) {
    throw new Error(`unsupported source URL: ${externalUrl}`);
  }
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    branch: treeMatch[1]!,
    path: assertSafeRepoPath(treeMatch[2] ?? "", "externalUrl path"),
  };
}

/** The commit a plugin's content is pinned to, if the registry recorded one. */
export function getEffectiveSourceRevision(item: RegistryItem): string | undefined {
  return item.pluginSource?.sha ?? item.sourceRevision;
}

function resolvePluginSource(item: RegistryItem): ResolvedSource {
  const source = item.pluginSource!;
  const what = `pluginSource of "${item.slug}"`;

  if (source.kind === "marketplace-path") {
    const marketplace = item.marketplaceRef;
    if (!marketplace) {
      throw new Error(`${what} is marketplace-path but the item has no marketplaceRef`);
    }
    const repo = parseGitHubRepo(marketplace.url);
    if (!repo) throw new Error(`unsupported source host: ${marketplace.url}`);
    const sha = assertCommitSha(marketplace.sha || source.sha, `marketplaceRef.sha of "${item.slug}"`);
    const path = assertSafeRepoPath(source.path ?? "", `${what} path`);
    return {
      baseUrl: rawUrl(repo.owner, repo.repo, sha, path),
      rootUrl: rawUrl(repo.owner, repo.repo, sha, ""),
      revision: sha,
    };
  }

  if (!source.url) {
    throw new Error(`${what} (${source.kind}) has no url`);
  }
  const repo = parseGitHubRepo(source.url);
  if (!repo) throw new Error(`unsupported source host: ${source.url}`);
  const sha = assertCommitSha(source.sha, `pluginSource.sha of "${item.slug}"`);
  const path = source.kind === "git-subdir" ? assertSafeRepoPath(source.path ?? "", `${what} path`) : "";
  return {
    baseUrl: rawUrl(repo.owner, repo.repo, sha, path),
    rootUrl: rawUrl(repo.owner, repo.repo, sha, ""),
    revision: sha,
  };
}

/**
 * Resolve where a remote item's content is fetched from.
 *
 * - `pluginSource` present → the marketplace source descriptor at its `sha`.
 * - `sourceRevision` present → `externalUrl`'s repository and path at that commit.
 * - neither → legacy: `externalUrl`'s branch (only for items predating the contract).
 *
 * Throws for any non-GitHub host or malformed revision — the CLI never
 * guesses a download location.
 */
export function resolveItemSource(item: RegistryItem): ResolvedSource {
  if (item.pluginSource) {
    return resolvePluginSource(item);
  }

  if (!item.externalUrl) {
    throw new Error(`Item "${item.slug}" has no externalUrl to fetch from`);
  }
  const { owner, repo, branch, path } = parseExternalUrl(item.externalUrl);

  if (item.sourceRevision !== undefined) {
    const sha = assertCommitSha(item.sourceRevision, `sourceRevision of "${item.slug}"`);
    return { baseUrl: rawUrl(owner, repo, sha, path), rootUrl: rawUrl(owner, repo, sha, ""), revision: sha };
  }

  const ref = branch ?? "main";
  return { baseUrl: rawUrl(owner, repo, ref, path), rootUrl: rawUrl(owner, repo, ref, ""), revision: null };
}
