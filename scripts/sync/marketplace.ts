/**
 * Claude Code marketplace descriptors (`.claude-plugin/marketplace.json`).
 *
 * A marketplace entry's `source` takes one of these forms:
 *   - a string path relative to the marketplace repo ("./plugins/x", "./external_plugins/x", "./")
 *   - { source: "url",        url, ref?, sha? }            — a whole repository
 *   - { source: "git-subdir", url, path, ref?, sha? }      — a directory of a repository
 *   - { source: "github",     repo: "owner/repo", ref?, sha? }
 * When both `ref` and `sha` exist, `sha` is the effective pin.
 */

import type { GitHubClient } from "./github.js";
import type { PluginSource } from "./types.js";
import { parseGitHubRepoUrl } from "./utils.js";

export interface MarketplaceAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface MarketplaceEntry {
  name: string;
  description?: string;
  version?: string;
  author?: MarketplaceAuthor;
  source: string | Record<string, unknown>;
  strict?: boolean;
  lspServers?: Record<string, unknown>;
  skills?: string[];
  homepage?: string;
  category?: string;
}

export interface MarketplaceFile {
  name: string;
  renames: Record<string, string>;
  plugins: MarketplaceEntry[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validate the marketplace file shape. Throws on anything the sync cannot interpret safely. */
export function parseMarketplace(json: unknown, origin: string): MarketplaceFile {
  if (!isObject(json)) throw new Error(`${origin}: marketplace.json is not an object`);
  if (typeof json.name !== "string" || json.name.length === 0) throw new Error(`${origin}: marketplace.json has no "name"`);
  if (!Array.isArray(json.plugins)) throw new Error(`${origin}: marketplace.json has no "plugins" array`);

  const renames: Record<string, string> = {};
  if (json.renames !== undefined) {
    if (!isObject(json.renames)) throw new Error(`${origin}: "renames" must be an object`);
    for (const [from, to] of Object.entries(json.renames)) {
      if (typeof to !== "string" || to.length === 0) throw new Error(`${origin}: rename of "${from}" has no target name`);
      renames[from] = to;
    }
  }

  const plugins: MarketplaceEntry[] = [];
  const seen = new Set<string>();
  json.plugins.forEach((entry: unknown, index) => {
    if (!isObject(entry)) throw new Error(`${origin}: plugins[${index}] is not an object`);
    if (typeof entry.name !== "string" || entry.name.length === 0) throw new Error(`${origin}: plugins[${index}] has no "name"`);
    if (seen.has(entry.name)) throw new Error(`${origin}: plugin "${entry.name}" is listed twice`);
    seen.add(entry.name);
    if (typeof entry.source !== "string" && !isObject(entry.source)) {
      throw new Error(`${origin}: plugin "${entry.name}" has no usable "source"`);
    }
    const author = isObject(entry.author) && typeof entry.author.name === "string" && entry.author.name.length > 0
      ? {
          name: entry.author.name,
          ...(typeof entry.author.email === "string" && { email: entry.author.email }),
          ...(typeof entry.author.url === "string" && { url: entry.author.url }),
        }
      : undefined;
    plugins.push({
      name: entry.name,
      ...(typeof entry.description === "string" && { description: entry.description }),
      ...(typeof entry.version === "string" && { version: entry.version }),
      ...(author && { author }),
      source: entry.source as string | Record<string, unknown>,
      ...(typeof entry.strict === "boolean" && { strict: entry.strict }),
      ...(isObject(entry.lspServers) && { lspServers: entry.lspServers }),
      ...(Array.isArray(entry.skills) && entry.skills.every((s) => typeof s === "string") && { skills: entry.skills as string[] }),
      ...(typeof entry.homepage === "string" && { homepage: entry.homepage }),
      ...(typeof entry.category === "string" && { category: entry.category }),
    });
  });

  return { name: json.name, renames, plugins };
}

/** Follow the rename chain for `name` (a marketplace may rename a plugin more than once). */
export function applyRenames(name: string, renames: Record<string, string>): string {
  let current = name;
  const visited = new Set<string>();
  while (renames[current] !== undefined && !visited.has(current)) {
    visited.add(current);
    current = renames[current]!;
  }
  return current;
}

/** Where a plugin's content lives, before the commit is pinned. */
export interface UnpinnedSource {
  kind: PluginSource["kind"];
  /** "owner/repo" of the repository holding the content. */
  repo: string;
  /** Directory inside that repository, "" for the root. */
  path: string;
  /** Clone URL for url/git-subdir/github kinds. */
  url?: string;
  ref?: string;
  sha?: string;
}

/** Strip "./" and trailing slashes from a marketplace-relative path. */
export function normalizeRelativePath(raw: string): string {
  return raw.replace(/^(\.\/)+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Interpret a marketplace `source` descriptor. `marketplaceRepo` is the "owner/repo" the
 * marketplace file was read from, `marketplaceSha` the commit it was read at.
 */
export function describeSource(entry: MarketplaceEntry, marketplaceRepo: string, marketplaceSha: string): UnpinnedSource {
  const { source } = entry;
  if (typeof source === "string") {
    const path = normalizeRelativePath(source);
    if (path.split("/").some((segment) => segment === "..")) {
      throw new Error(`plugin "${entry.name}": source path "${source}" escapes the marketplace repository`);
    }
    if (path === "") {
      return { kind: "url", repo: marketplaceRepo, path: "", url: `https://github.com/${marketplaceRepo}.git`, sha: marketplaceSha };
    }
    return { kind: "marketplace-path", repo: marketplaceRepo, path, sha: marketplaceSha };
  }

  const kind = source.source;
  const ref = typeof source.ref === "string" && source.ref.length > 0 ? source.ref : undefined;
  const sha = typeof source.sha === "string" && /^[0-9a-f]{40}$/.test(source.sha) ? source.sha : undefined;
  if (source.sha !== undefined && sha === undefined) {
    throw new Error(`plugin "${entry.name}": source sha ${JSON.stringify(source.sha)} is not a 40-character commit SHA`);
  }

  if (kind === "github") {
    if (typeof source.repo !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(source.repo)) {
      throw new Error(`plugin "${entry.name}": github source needs "repo" as "owner/repo"`);
    }
    const repo = source.repo.replace(/\.git$/, "");
    return { kind: "github", repo, path: "", url: `https://github.com/${repo}.git`, ref, sha };
  }

  if (kind === "url" || kind === "git-subdir") {
    if (typeof source.url !== "string") throw new Error(`plugin "${entry.name}": ${kind} source has no "url"`);
    const parsed = parseGitHubRepoUrl(source.url);
    if (!parsed) throw new Error(`plugin "${entry.name}": only GitHub repositories are supported, got ${source.url}`);
    if (kind === "url") {
      return { kind: "url", repo: parsed.repo, path: "", url: parsed.cloneUrl, ref, sha };
    }
    if (typeof source.path !== "string") throw new Error(`plugin "${entry.name}": git-subdir source has no "path"`);
    const path = normalizeRelativePath(source.path);
    if (path === "" || path.split("/").some((segment) => segment === "..")) {
      throw new Error(`plugin "${entry.name}": git-subdir path ${JSON.stringify(source.path)} is not a directory inside the repository`);
    }
    return { kind: "git-subdir", repo: parsed.repo, path, url: parsed.cloneUrl, ref, sha };
  }

  throw new Error(`plugin "${entry.name}": unsupported source kind ${JSON.stringify(kind)}`);
}

/** An UnpinnedSource whose commit has been resolved. */
export interface PinnedSource extends UnpinnedSource {
  sha: string;
}

/** Pin a source to a commit: the declared sha, else the declared ref, else the default branch. */
export async function pinSource(source: UnpinnedSource, client: GitHubClient): Promise<PinnedSource> {
  if (source.sha) return { ...source, sha: source.sha };
  const ref = source.ref ?? (await client.getDefaultBranch(source.repo));
  const { sha } = await client.getCommit(source.repo, ref);
  return { ...source, sha };
}

/** The `pluginSource` written to item.json. */
export function toPluginSource(pinned: PinnedSource): PluginSource {
  return {
    kind: pinned.kind,
    ...((pinned.kind === "marketplace-path" || pinned.kind === "git-subdir") && { path: pinned.path }),
    ...(pinned.url && { url: pinned.url }),
    ...(pinned.ref && { ref: pinned.ref }),
    sha: pinned.sha,
  };
}
