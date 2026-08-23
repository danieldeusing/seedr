/**
 * Community items: registry entries added by hand that point at a third-party repository
 * through `externalUrl`. Each one is its own sync source — a failure carries that single
 * item over unchanged and never deletes it (an upstream repository that vanished is a
 * decision for a human, not for the cron job).
 *
 * Every run re-pins the item to the head of the repository's default branch. When the
 * repository ships its own `.claude-plugin/marketplace.json`, the matching entry decides
 * where the plugin lives (root → `url`, subdirectory → `marketplace-path`) and fills
 * `marketplaceRef`; otherwise the path from `externalUrl` is used as-is.
 */

import {
  MARKETPLACE_FILE,
  PLUGIN_JSON,
  assertBuiltItemValid,
  buildMarketplacePlugin,
  cloneUrl,
  describeError,
  loadMarketplace,
  treeUrl,
  type SourceContext,
} from "./anthropic.js";
import { classifyPlugin, collectContent, findEntry, parseJsonEntry, withDeclaredLicense } from "./content.js";
import { NotFoundError } from "./github.js";
import { finalizeItem } from "./item.js";
import { normalizeRelativePath, type MarketplaceEntry, type MarketplaceFile } from "./marketplace.js";
import type { GitTreeItem, ManifestItem, SourceResult } from "./types.js";
import { itemKey } from "./types.js";
import { parseFrontmatter, parseGitHubTreeUrl, type PluginJson } from "./utils.js";

interface RepoHead {
  repo: string;
  branch: string;
  sha: string;
  tree: GitTreeItem[];
}

/**
 * Find the marketplace entry describing this item: by slug, then by the name declared in
 * the plugin.json at the item's current path, then by a unique local-path match.
 */
export function findMarketplaceEntry(
  marketplace: MarketplaceFile,
  item: ManifestItem,
  currentPath: string,
  pluginJsonName: string | null,
): MarketplaceEntry | null {
  const bySlug = marketplace.plugins.find((entry) => entry.name === item.slug);
  if (bySlug) return bySlug;
  if (pluginJsonName) {
    const byName = marketplace.plugins.find((entry) => entry.name === pluginJsonName);
    if (byName) return byName;
  }
  const byPath = marketplace.plugins.filter(
    (entry) => typeof entry.source === "string" && normalizeRelativePath(entry.source) === currentPath,
  );
  return byPath.length === 1 ? byPath[0]! : null;
}

async function readPluginJsonName(ctx: SourceContext, head: RepoHead, path: string): Promise<string | null> {
  const pluginJsonPath = path ? `${path}/${PLUGIN_JSON}` : PLUGIN_JSON;
  const blob = head.tree.find((entry) => entry.type === "blob" && entry.path === pluginJsonPath);
  if (!blob) return null;
  try {
    const json = JSON.parse(await ctx.client.getRawText(head.repo, head.sha, pluginJsonPath, blob.sha)) as PluginJson;
    return typeof json.name === "string" ? json.name : null;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

async function refreshPlugin(ctx: SourceContext, item: ManifestItem, head: RepoHead, path: string): Promise<ManifestItem> {
  const hasMarketplace = head.tree.some((entry) => entry.type === "blob" && entry.path === MARKETPLACE_FILE);
  const marketplace = hasMarketplace ? await loadMarketplace(ctx.client, head.repo, head.sha) : null;
  const entry = marketplace ? findMarketplaceEntry(marketplace, item, path, await readPluginJsonName(ctx, head, path)) : null;

  if (marketplace && entry) {
    ctx.log(`    ${item.slug}: using entry "${entry.name}" of marketplace "${marketplace.name}"`);
    return buildMarketplacePlugin(
      ctx,
      { entry, existing: item, slug: item.slug, marketplace: { name: marketplace.name, repo: head.repo, sha: head.sha, tree: head.tree } },
      "community",
    );
  }

  // No marketplace entry describes this item: the externalUrl path is the plugin directory.
  const content = await collectContent(ctx.client, { repo: head.repo, sha: head.sha, path }, head.tree);
  const pluginJson = parseJsonEntry<PluginJson>(content, PLUGIN_JSON);
  if (!pluginJson) throw new Error(`no ${PLUGIN_JSON} in ${head.repo}/${path || "."} at ${head.sha}`);
  const classification = classifyPlugin(content, { pluginJson, existing: item });
  const updatedAt = (await ctx.client.getLastCommitDate(head.repo, head.sha, path)) ?? item.updatedAt;
  const author = pluginJson.author?.name ? { name: pluginJson.author.name, ...(pluginJson.author.url && { url: pluginJson.author.url }) } : item.author;
  const marketplaceName = marketplace?.name ?? item.marketplace;

  const fresh = finalizeItem(
    {
      slug: item.slug,
      name: item.name,
      type: "plugin",
      description: pluginJson.description ?? item.description,
      compatibility: item.compatibility,
      ...classification,
      sourceType: "community",
      author,
      externalUrl: treeUrl(head.repo, head.sha, path),
      ...(marketplaceName && { marketplace: marketplaceName }),
      ...(pluginJson.version && { version: pluginJson.version }),
      sourceRevision: head.sha,
      ...(content.contentDigest && { contentDigest: content.contentDigest }),
      ...(content.contentHash && { contentHash: content.contentHash }),
      pluginSource:
        path === ""
          ? { kind: "url", url: cloneUrl(head.repo), ref: head.branch, sha: head.sha }
          : { kind: "git-subdir", path, url: cloneUrl(head.repo), ref: head.branch, sha: head.sha },
      license: withDeclaredLicense(content.license, pluginJson.license),
      ...(updatedAt && { updatedAt }),
      contents: { files: content.files },
    },
    item,
  );
  assertBuiltItemValid(fresh);
  if (content.skipped.length > 0) ctx.log(`    skipped non-regular files in ${item.slug}: ${content.skipped.join(", ")}`);
  return fresh;
}

/** Skills read their description from SKILL.md; other content types keep the curated one. */
async function refreshContentItem(ctx: SourceContext, item: ManifestItem, head: RepoHead, path: string): Promise<ManifestItem> {
  const content = await collectContent(ctx.client, { repo: head.repo, sha: head.sha, path }, head.tree);
  const skillMd = item.type === "skill" ? findEntry(content, "SKILL.md") : null;
  if (item.type === "skill" && !skillMd) throw new Error(`no SKILL.md in ${head.repo}/${path || "."} at ${head.sha}`);
  const frontmatter = skillMd ? parseFrontmatter(skillMd.toString("utf-8")) : null;
  const updatedAt = (await ctx.client.getLastCommitDate(head.repo, head.sha, path)) ?? item.updatedAt;

  const fresh = finalizeItem(
    {
      slug: item.slug,
      name: item.name,
      type: item.type,
      description: frontmatter?.description ?? item.description,
      compatibility: item.compatibility,
      sourceType: "community",
      author: item.author,
      externalUrl: treeUrl(head.repo, head.sha, path),
      sourceRevision: head.sha,
      ...(content.contentDigest && { contentDigest: content.contentDigest }),
      ...(content.contentHash && { contentHash: content.contentHash }),
      license: content.license,
      ...(updatedAt && { updatedAt }),
      contents: { files: content.files },
    },
    item,
  );
  assertBuiltItemValid(fresh);
  if (content.skipped.length > 0) ctx.log(`    skipped non-regular files in ${item.slug}: ${content.skipped.join(", ")}`);
  return fresh;
}

/** Re-sync one community item from the head of its repository's default branch. */
export async function syncCommunityItem(ctx: SourceContext, item: ManifestItem): Promise<SourceResult> {
  const owned = [itemKey(item)];
  try {
    if (!item.externalUrl) return { status: "failed", owned, reason: "no externalUrl" };
    const parsed = parseGitHubTreeUrl(item.externalUrl);
    if (!parsed) return { status: "failed", owned, reason: `externalUrl ${item.externalUrl} is not a GitHub tree URL` };

    const branch = await ctx.client.getDefaultBranch(parsed.repo);
    const { sha } = await ctx.client.getCommit(parsed.repo, branch);
    const tree = await ctx.client.getTree(parsed.repo, sha);
    const head: RepoHead = { repo: parsed.repo, branch, sha, tree };

    const updated =
      item.type === "plugin" ? await refreshPlugin(ctx, item, head, parsed.path) : await refreshContentItem(ctx, item, head, parsed.path);
    ctx.log(`  ✓ ${item.slug} (${parsed.repo}@${sha.slice(0, 7)})`);
    return { status: "complete", owned, items: [updated], failedItems: [], renamed: [] };
  } catch (error) {
    ctx.log(`  ✗ ${item.slug}: ${describeError(error)}`);
    return { status: "failed", owned, reason: describeError(error) };
  }
}
