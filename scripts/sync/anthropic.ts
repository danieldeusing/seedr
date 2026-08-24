/**
 * Official sources:
 *
 *   - anthropics/skills — every `skills/<slug>` directory at the branch head, pinned to it.
 *   - anthropics/claude-plugins-official — the marketplace file is the source of truth. Each
 *     entry's `source` descriptor says where the content lives (a path inside the marketplace
 *     repo, or another repository at a pinned sha); the registry records the effective pin,
 *     the full file tree and the digest at that pin.
 *
 * Inclusion set for the marketplace: plugins the registry already carries (matched by name,
 * after `renames`) plus every entry sourced from a local `./plugins/*` or `./external_plugins/*`
 * path. The ~230 entries that point at third-party repositories are not imported wholesale;
 * widening that is a product decision.
 */

import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { validateItem } from "../lib/validate-item.js";
import { classifyPlugin, collectContent, findEntry, parseJsonEntry, withDeclaredLicense } from "./content.js";
import type { GitHubClient } from "./github.js";
import { finalizeItem } from "./item.js";
import {
  applyRenames,
  describeSource,
  parseMarketplace,
  pinSource,
  toPluginSource,
  type MarketplaceEntry,
  type MarketplaceFile,
  type PinnedSource,
} from "./marketplace.js";
import type { Author, GitTreeItem, ItemKey, ManifestItem, SourceResult, SourceType } from "./types.js";
import { itemKey } from "./types.js";
import { formatName, listDirectoryFromTree, mapConcurrent, parseFrontmatter, type PluginJson } from "./utils.js";

export const SKILLS_REPO = "anthropics/skills";
export const SKILLS_BRANCH = "main";
export const PLUGINS_REPO = "anthropics/claude-plugins-official";
export const PLUGINS_BRANCH = "main";
export const OFFICIAL_MARKETPLACE_NAME = "claude-plugins-official";
export const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";
export const PLUGIN_JSON = ".claude-plugin/plugin.json";

const ITEM_CONCURRENCY = 4;

export interface SourceContext {
  client: GitHubClient;
  /** The registry as it is on disk before this run. */
  existing: ReadonlyMap<ItemKey, ManifestItem>;
  log: (line: string) => void;
  /** Accept an upstream listing with zero entries (SYNC_ALLOW_EMPTY=1). */
  allowEmpty: boolean;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function treeUrl(repo: string, sha: string, path: string): string {
  return `https://github.com/${repo}/tree/${sha}${path ? `/${path}` : ""}`;
}

export function cloneUrl(repo: string): string {
  return `https://github.com/${repo}.git`;
}

/** Validate a freshly built item; invalid upstream data fails that item instead of the run. */
export function assertBuiltItemValid(item: ManifestItem): void {
  const errors = validateItem(item, { file: `${itemKey(item)}/item.json` });
  if (errors.length > 0) {
    throw new Error(`built item is invalid:\n      ${errors.join("\n      ")}`);
  }
}

// ---- official skills ------------------------------------------------------------------

async function buildOfficialSkill(ctx: SourceContext, slug: string, sha: string, tree: GitTreeItem[]): Promise<ManifestItem> {
  const path = `skills/${slug}`;
  const content = await collectContent(ctx.client, { repo: SKILLS_REPO, sha, path }, tree);
  const skillMd = findEntry(content, "SKILL.md");
  if (!skillMd) throw new Error(`no SKILL.md in ${path} at ${sha}`);
  const frontmatter = parseFrontmatter(skillMd.toString("utf-8"));
  if (!frontmatter?.name) throw new Error(`SKILL.md in ${path} has no frontmatter "name"`);

  const existing = ctx.existing.get(`skill/${slug}`) ?? null;
  const updatedAt = (await ctx.client.getLastCommitDate(SKILLS_REPO, sha, path)) ?? existing?.updatedAt;
  const item = finalizeItem(
    {
      slug,
      name: formatName(frontmatter.name),
      type: "skill",
      description: frontmatter.description ?? "",
      // B1 (Studio plan §5): new items carry the deprecated id too, so the CLI
      // already on npm still matches them; scripts/migrate-agent-ids.ts drops it in B2.
      compatibility: [...CANONICAL_AGENTS, "gemini"],
      sourceType: "official",
      author: { name: "Anthropic" },
      externalUrl: treeUrl(SKILLS_REPO, sha, path),
      sourceRevision: sha,
      ...(content.contentDigest && { contentDigest: content.contentDigest }),
      ...(content.contentHash && { contentHash: content.contentHash }),
      license: content.license,
      ...(updatedAt && { updatedAt }),
      contents: { files: content.files },
    },
    existing,
  );
  assertBuiltItemValid(item);
  if (content.skipped.length > 0) ctx.log(`    skipped non-regular files in ${path}: ${content.skipped.join(", ")}`);
  return item;
}

export async function syncOfficialSkills(ctx: SourceContext): Promise<SourceResult> {
  const owned = [...ctx.existing.values()]
    .filter((item) => item.type === "skill" && item.sourceType === "official")
    .map(itemKey);
  ctx.log(`\n=== Official skills (${SKILLS_REPO}@${SKILLS_BRANCH}) ===`);
  try {
    const { sha } = await ctx.client.getCommit(SKILLS_REPO, SKILLS_BRANCH);
    const tree = await ctx.client.getTree(SKILLS_REPO, sha);
    const slugs = listDirectoryFromTree(tree, "skills");
    ctx.log(`  head ${sha}, ${slugs.length} skill directories`);
    if (slugs.length === 0 && !ctx.allowEmpty) {
      return { status: "failed", owned, reason: `tree at ${sha} lists no skills/* directories (set SYNC_ALLOW_EMPTY=1 to accept an empty listing)` };
    }

    const items: ManifestItem[] = [];
    const failedItems: { key: ItemKey; reason: string }[] = [];
    await mapConcurrent(slugs, ITEM_CONCURRENCY, async (slug) => {
      try {
        items.push(await buildOfficialSkill(ctx, slug, sha, tree));
        ctx.log(`  ✓ ${slug}`);
      } catch (error) {
        failedItems.push({ key: `skill/${slug}`, reason: describeError(error) });
        ctx.log(`  ✗ ${slug}: ${describeError(error)}`);
      }
    });
    items.sort((a, b) => a.slug.localeCompare(b.slug, "en"));
    return { status: "complete", owned, items, failedItems, renamed: [] };
  } catch (error) {
    return { status: "failed", owned, reason: describeError(error) };
  }
}

// ---- official marketplace plugins ---------------------------------------------------------

interface IncludedEntry {
  entry: MarketplaceEntry;
  /** The registry item this entry updates, if any (its slug may be the entry's old name). */
  existing: ManifestItem | null;
}

function isLocalPath(entry: MarketplaceEntry): boolean {
  return typeof entry.source === "string";
}

function pickAuthor(entry: MarketplaceEntry | null, pluginJson: PluginJson | null, existing: ManifestItem | null, fallback: string): Author {
  const declared = entry?.author?.name ? entry.author : pluginJson?.author?.name ? pluginJson.author : null;
  if (declared?.name) {
    return { name: declared.name, ...(declared.url && { url: declared.url }) };
  }
  return existing?.author ?? { name: fallback };
}

export interface PluginBuildInput {
  entry: MarketplaceEntry;
  marketplace: { name: string; repo: string; sha: string; tree: GitTreeItem[] };
  existing: ManifestItem | null;
  /** Slug to write; differs from entry.name only while a rename is applied. */
  slug: string;
}

/** Build one plugin item from a marketplace entry. Shared with the community source (a repo's own marketplace). */
export async function buildMarketplacePlugin(ctx: SourceContext, input: PluginBuildInput, sourceTypeOverride?: SourceType): Promise<ManifestItem> {
  const { entry, marketplace, existing, slug } = input;
  const pinned: PinnedSource = await pinSource(describeSource(entry, marketplace.repo, marketplace.sha), ctx.client);
  const tree =
    pinned.repo === marketplace.repo && pinned.sha === marketplace.sha ? marketplace.tree : await ctx.client.getTree(pinned.repo, pinned.sha);
  const content = await collectContent(ctx.client, { repo: pinned.repo, sha: pinned.sha, path: pinned.path }, tree);

  const pluginJson = parseJsonEntry<PluginJson>(content, PLUGIN_JSON);
  if (!pluginJson && entry.strict !== false) {
    throw new Error(`no ${PLUGIN_JSON} in ${pinned.repo}/${pinned.path || "."} at ${pinned.sha} (strict plugin)`);
  }

  const sourceType: SourceType =
    sourceTypeOverride ?? (pinned.kind === "marketplace-path" && pinned.path.startsWith("plugins/") ? "official" : "community");
  const classification = classifyPlugin(content, {
    pluginJson,
    lspServers: entry.lspServers,
    inlineSkills: entry.skills,
    existing,
  });
  const version = entry.version ?? pluginJson?.version;
  const updatedAt = (await ctx.client.getLastCommitDate(pinned.repo, pinned.sha, pinned.path)) ?? existing?.updatedAt;

  const item = finalizeItem(
    {
      slug,
      name: formatName(entry.name),
      type: "plugin",
      description: entry.description ?? pluginJson?.description ?? "",
      compatibility: ["claude"],
      ...classification,
      sourceType,
      author: pickAuthor(entry, pluginJson, existing, sourceType === "official" ? "Anthropic" : "Community"),
      externalUrl: treeUrl(pinned.repo, pinned.sha, pinned.path),
      marketplace: marketplace.name,
      ...(version && { version }),
      ...(entry.strict !== undefined && { strict: entry.strict }),
      ...(entry.lspServers && { lspServers: entry.lspServers }),
      ...(entry.skills && entry.skills.length > 0 && { skills: entry.skills }),
      sourceRevision: pinned.sha,
      ...(content.contentDigest && { contentDigest: content.contentDigest }),
      ...(content.contentHash && { contentHash: content.contentHash }),
      pluginSource: toPluginSource(pinned),
      marketplaceRef: { name: marketplace.name, url: cloneUrl(marketplace.repo), sha: marketplace.sha },
      license: withDeclaredLicense(content.license, pluginJson?.license),
      ...(updatedAt && { updatedAt }),
      contents: { files: content.files },
    },
    existing,
  );
  assertBuiltItemValid(item);
  if (content.skipped.length > 0) ctx.log(`    skipped non-regular files in ${entry.name}: ${content.skipped.join(", ")}`);
  return item;
}

export async function loadMarketplace(client: GitHubClient, repo: string, sha: string): Promise<MarketplaceFile> {
  const text = await client.getRawText(repo, sha, MARKETPLACE_FILE);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${repo}@${sha} ${MARKETPLACE_FILE} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  return parseMarketplace(json, `${repo}@${sha}`);
}

export function officialPluginsOwnedByField(existing: ReadonlyMap<ItemKey, ManifestItem>): ItemKey[] {
  return [...existing.values()]
    .filter(
      (item) =>
        item.type === "plugin" && (item.marketplaceRef?.name === OFFICIAL_MARKETPLACE_NAME || item.marketplace === OFFICIAL_MARKETPLACE_NAME),
    )
    .map(itemKey);
}

export async function syncOfficialPlugins(ctx: SourceContext): Promise<SourceResult> {
  const ownedByField = officialPluginsOwnedByField(ctx.existing);
  ctx.log(`\n=== Official marketplace (${PLUGINS_REPO}@${PLUGINS_BRANCH}) ===`);
  try {
    const { sha } = await ctx.client.getCommit(PLUGINS_REPO, PLUGINS_BRANCH);
    const tree = await ctx.client.getTree(PLUGINS_REPO, sha);
    const marketplace = await loadMarketplace(ctx.client, PLUGINS_REPO, sha);
    if (marketplace.name !== OFFICIAL_MARKETPLACE_NAME) {
      return {
        status: "failed",
        owned: ownedByField,
        reason: `marketplace at ${sha} is named "${marketplace.name}", expected "${OFFICIAL_MARKETPLACE_NAME}"`,
      };
    }
    ctx.log(`  head ${sha}, ${marketplace.plugins.length} marketplace entries, ${Object.keys(marketplace.renames).length} renames`);
    if (marketplace.plugins.length === 0) {
      ctx.log(`  marketplace explicitly lists zero plugins`);
    }

    const entriesByName = new Map(marketplace.plugins.map((entry) => [entry.name, entry]));
    const included = new Map<string, IncludedEntry>();
    const renamed: { from: ItemKey; to: ItemKey }[] = [];
    const owned = new Set<ItemKey>(ownedByField);

    for (const item of ctx.existing.values()) {
      if (item.type !== "plugin") continue;
      const name = applyRenames(item.slug, marketplace.renames);
      const entry = entriesByName.get(name);
      if (!entry) continue;
      included.set(name, { entry, existing: item });
      owned.add(itemKey(item));
      if (name !== item.slug) renamed.push({ from: itemKey(item), to: `plugin/${name}` });
    }
    for (const entry of marketplace.plugins) {
      if (isLocalPath(entry) && !included.has(entry.name)) included.set(entry.name, { entry, existing: null });
    }
    ctx.log(`  inclusion set: ${included.size} entries (${[...included.values()].filter((e) => e.existing).length} existing)`);

    const items: ManifestItem[] = [];
    const failedItems: { key: ItemKey; reason: string }[] = [];
    await mapConcurrent([...included.values()], ITEM_CONCURRENCY, async ({ entry, existing }) => {
      try {
        items.push(
          await buildMarketplacePlugin(ctx, { entry, existing, slug: entry.name, marketplace: { name: marketplace.name, repo: PLUGINS_REPO, sha, tree } }),
        );
        ctx.log(`  ✓ ${entry.name}${existing && existing.slug !== entry.name ? ` (renamed from ${existing.slug})` : ""}`);
      } catch (error) {
        failedItems.push({ key: existing ? itemKey(existing) : `plugin/${entry.name}`, reason: describeError(error) });
        ctx.log(`  ✗ ${entry.name}: ${describeError(error)}`);
      }
    });
    items.sort((a, b) => a.slug.localeCompare(b.slug, "en"));
    return { status: "complete", owned: [...owned], items, failedItems, renamed };
  } catch (error) {
    return { status: "failed", owned: ownedByField, reason: describeError(error) };
  }
}
