/**
 * Where each synced item stands against its source, without downloading any
 * content: the sync's own pin resolution, then the tree's blob shas hashed the
 * way `contentHash` was recorded. One tree per repository answers for every
 * item in it, so a full check costs a few dozen requests — inside even the
 * unauthenticated hour — and writes nothing.
 *
 * It is the daily sync's question asked by hand: which items would the next
 * run change? Studio's explorer asks it from a button; a shell asks it with
 * `registry-op.ts upstream-status`.
 */
import { isFirstParty } from "@seedr/registry-ops/pure";
import { MARKETPLACE_FILE, OFFICIAL_MARKETPLACE_NAME, PLUGINS_BRANCH, PLUGINS_REPO, SKILLS_BRANCH, SKILLS_REPO, describeError, loadMarketplace } from "./anthropic.js";
import { findMarketplaceEntry } from "./community.js";
import type { GitHubClient } from "./github.js";
import { applyRenames, describeSource, pinSource, type MarketplaceFile } from "./marketplace.js";
import type { GitTreeItem, ManifestItem } from "./types.js";
import { computeLegacyContentHash, listTreeFiles, mapConcurrent, parseGitHubTreeUrl, treeHasDirectory } from "./utils.js";

export type UpstreamState = "current" | "behind" | "unknown";

export interface UpstreamStatus {
  type: ManifestItem["type"];
  slug: string;
  state: UpstreamState;
  /** Why the state is `unknown`, or how it was decided when no content hash was recorded. */
  reason?: string;
  /** The commit and path the next sync would read this item from. */
  upstream?: { repo: string; sha: string; path: string };
  /** When the content last changed upstream — looked up only for items that are behind. */
  upstreamUpdatedAt?: string;
}

interface Pinned {
  repo: string;
  sha: string;
  path: string;
}

const CHECK_CONCURRENCY = 6;
const COMPARED_BY_COMMIT = "compared by commit: no content hash recorded until the first sync";

export async function checkUpstream(client: GitHubClient, items: readonly ManifestItem[]): Promise<UpstreamStatus[]> {
  const heads = new Map<string, Promise<string>>();
  const headOf = (repo: string, branch?: string): Promise<string> => {
    const key = `${repo}@${branch ?? ""}`;
    let head = heads.get(key);
    if (!head) {
      head = (async () => (await client.getCommit(repo, branch ?? (await client.getDefaultBranch(repo)))).sha)();
      heads.set(key, head);
    }
    return head;
  };
  const marketplaces = new Map<string, Promise<MarketplaceFile>>();
  const marketplaceAt = (repo: string, sha: string): Promise<MarketplaceFile> => {
    const key = `${repo}@${sha}`;
    let marketplace = marketplaces.get(key);
    if (!marketplace) {
      marketplace = loadMarketplace(client, repo, sha);
      marketplaces.set(key, marketplace);
    }
    return marketplace;
  };

  /** The commit and path the sync would pin this item to on its next run. */
  const resolve = async (item: ManifestItem): Promise<Pinned> => {
    if (item.type === "skill" && item.sourceType === "official") {
      return { repo: SKILLS_REPO, sha: await headOf(SKILLS_REPO, SKILLS_BRANCH), path: `skills/${item.slug}` };
    }
    if (item.type === "plugin" && (item.marketplaceRef?.name === OFFICIAL_MARKETPLACE_NAME || item.marketplace === OFFICIAL_MARKETPLACE_NAME)) {
      const sha = await headOf(PLUGINS_REPO, PLUGINS_BRANCH);
      const marketplace = await marketplaceAt(PLUGINS_REPO, sha);
      const name = applyRenames(item.slug, marketplace.renames);
      const entry = marketplace.plugins.find((candidate) => candidate.name === name);
      if (!entry) throw new Error(`no longer listed in ${OFFICIAL_MARKETPLACE_NAME}`);
      return pinSource(describeSource(entry, PLUGINS_REPO, sha), client);
    }
    if (!item.externalUrl) throw new Error("no externalUrl to check against");
    const parsed = parseGitHubTreeUrl(item.externalUrl);
    if (!parsed) throw new Error(`externalUrl ${item.externalUrl} is not a GitHub tree URL`);
    const sha = await headOf(parsed.repo);
    if (item.type === "plugin") {
      // A repository's own marketplace decides the plugin's path, as it does in the sync.
      const tree = await client.getTree(parsed.repo, sha);
      if (tree.some((entry) => entry.type === "blob" && entry.path === MARKETPLACE_FILE)) {
        const entry = findMarketplaceEntry(await marketplaceAt(parsed.repo, sha), item, parsed.path, null);
        if (entry) return pinSource(describeSource(entry, parsed.repo, sha), client);
      }
    }
    return { repo: parsed.repo, sha, path: parsed.path };
  };

  const compare = async (item: ManifestItem, pinned: Pinned, tree: readonly GitTreeItem[]): Promise<UpstreamStatus> => {
    const upstream = { repo: pinned.repo, sha: pinned.sha, path: pinned.path };
    const base = { type: item.type, slug: item.slug, upstream };
    const hash = computeLegacyContentHash(listTreeFiles(tree, pinned.path).files);
    const current = item.contentHash ? hash === item.contentHash : item.sourceRevision === pinned.sha;
    const reason = item.contentHash ? {} : { reason: COMPARED_BY_COMMIT };
    if (current) return { ...base, state: "current", ...reason };
    const updatedAt = await client.getLastCommitDate(pinned.repo, pinned.sha, pinned.path);
    return { ...base, state: "behind", ...reason, ...(updatedAt && { upstreamUpdatedAt: updatedAt }) };
  };

  const synced = items.filter((item) => !isFirstParty(item.sourceType));
  return mapConcurrent(synced, CHECK_CONCURRENCY, async (item): Promise<UpstreamStatus> => {
    try {
      const pinned = await resolve(item);
      const tree = await client.getTree(pinned.repo, pinned.sha);
      if (!treeHasDirectory(tree, pinned.path)) {
        return { type: item.type, slug: item.slug, state: "unknown", reason: `${pinned.path || "."} is gone from ${pinned.repo} at ${pinned.sha.slice(0, 7)}`, upstream: pinned };
      }
      return await compare(item, pinned, tree);
    } catch (error) {
      return { type: item.type, slug: item.slug, state: "unknown", reason: describeError(error) };
    }
  });
}
