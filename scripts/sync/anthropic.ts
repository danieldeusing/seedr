/**
 * Official sources:
 *
 *   - anthropics/skills — every `skills/<slug>` directory at the branch head, pinned to it.
 *   - Anthropic's marketplaces (MARKETPLACES, in order of precedence) — each marketplace file
 *     is the source of truth for the plugins it lists, and every entry is imported (decided
 *     2026-09-09; until then the official marketplace's third-party entries stayed out). An
 *     entry's `source` descriptor says where the content lives (a path inside the marketplace
 *     repo, or another repository at a pinned sha); the registry records the effective pin,
 *     the full file tree and the digest at that pin. A slug an earlier marketplace claimed is
 *     left to it.
 *
 * Thousands of entries are too many to rebuild daily, so an entry whose pin has not moved
 * keeps its item as it is (SYNC_REBUILD=1 rebuilds anyway), and a new item gets a first
 * longDescription drafted from its own files (tldr.ts) — curated afterwards, like `name`.
 */

import { CANONICAL_AGENTS, derivePluginCompatibility, storageAgents } from "@seedr/registry-ops/pure";
import { validateItem } from "../lib/validate-item.js";
import { classifyPlugin, collectContent, findEntry, parseJsonEntry, resolvePluginComponents, withDeclaredLicense, type CollectedContent } from "./content.js";
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
import { draftLongDescription } from "./tldr.js";
import type { Author, GitTreeItem, ItemKey, ManifestItem, SourceResult, SourceType } from "./types.js";
import { itemKey } from "./types.js";
import { formatName, listDirectoryFromTree, mapConcurrent, parseFrontmatter, type PluginJson } from "./utils.js";

export const SKILLS_REPO = "anthropics/skills";
export const SKILLS_BRANCH = "main";
export const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";
export const PLUGIN_JSON = ".claude-plugin/plugin.json";

export interface MarketplaceSource {
  /** The marketplace's own `name`, which its file must confirm; also the `@<name>` of `claude plugin install`. */
  name: string;
  /** "owner/repo" and the branch the marketplace file is read from. */
  repo: string;
  branch: string;
  /** sourceType of entries whose content lives in the marketplace repo itself; entries pointing elsewhere are always community. */
  hostedSourceType: SourceType;
}

export const OFFICIAL_MARKETPLACE: MarketplaceSource = {
  name: "claude-plugins-official",
  repo: "anthropics/claude-plugins-official",
  branch: "main",
  hostedSourceType: "official",
};

export const KNOWLEDGE_WORK_MARKETPLACE: MarketplaceSource = {
  name: "knowledge-work-plugins",
  repo: "anthropics/knowledge-work-plugins",
  branch: "main",
  hostedSourceType: "official",
};

export const COMMUNITY_MARKETPLACE: MarketplaceSource = {
  name: "claude-community",
  repo: "anthropics/claude-plugins-community",
  branch: "main",
  hostedSourceType: "community",
};

/** In order of precedence: a slug two marketplaces list belongs to the first. */
export const MARKETPLACES: readonly MarketplaceSource[] = [OFFICIAL_MARKETPLACE, KNOWLEDGE_WORK_MARKETPLACE, COMMUNITY_MARKETPLACE];

const ITEM_CONCURRENCY = 4;

export interface SourceContext {
  client: GitHubClient;
  /** The registry as it is on disk before this run. */
  existing: ReadonlyMap<ItemKey, ManifestItem>;
  log: (line: string) => void;
  /** Accept an upstream listing with zero entries (SYNC_ALLOW_EMPTY=1). */
  allowEmpty: boolean;
  /** Rebuild mirror items whose pin has not moved (SYNC_REBUILD=1). */
  rebuild: boolean;
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
      // B1: all agents, downgraded to the ids the published CLI understands
      // (STORAGE_ALIASES in registry-ops is the one flip point for B2).
      compatibility: storageAgents(CANONICAL_AGENTS),
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

function pickAuthor(entry: MarketplaceEntry | null, pluginJson: PluginJson | null, existing: ManifestItem | null, fallback: string): Author {
  const declared = entry?.author?.name ? entry.author : pluginJson?.author?.name ? pluginJson.author : null;
  if (declared?.name) {
    return { name: declared.name, ...(declared.url && { url: declared.url }) };
  }
  return existing?.author ?? { name: fallback };
}

export interface PluginBuildInput {
  entry: MarketplaceEntry;
  marketplace: { name: string; repo: string; sha: string; tree: GitTreeItem[]; hostedSourceType: SourceType };
  existing: ManifestItem | null;
  /** Slug to write; differs from entry.name only while a rename is applied. */
  slug: string;
  /** Draft a longDescription from the plugin's own files when the item has none yet. */
  draftLongDescription?: boolean;
}

/** A first longDescription for a new marketplace item, or null with a note when its files say too little. */
function draftFor(ctx: SourceContext, input: PluginBuildInput, pinned: PinnedSource, content: CollectedContent, pluginJson: PluginJson | null): string | null {
  const draft = draftLongDescription({
    name: input.entry.name,
    marketplace: input.marketplace.name,
    repo: pinned.repo,
    path: pinned.path,
    summary: input.entry.description,
    components: resolvePluginComponents(content, { pluginJson, inlineSkills: input.entry.skills }),
    content,
  });
  if (!draft) ctx.log(`    ${input.entry.name}: its files say too little for a longDescription; the description gate will ask for one`);
  return draft;
}

/** Build one plugin item from a marketplace entry. Shared with the community source (a repo's own marketplace). */
export async function buildMarketplacePlugin(ctx: SourceContext, input: PluginBuildInput): Promise<ManifestItem> {
  const { entry, marketplace, existing, slug } = input;
  const pinned: PinnedSource = await pinSource(describeSource(entry, marketplace.repo, marketplace.sha), ctx.client);
  const tree =
    pinned.repo === marketplace.repo && pinned.sha === marketplace.sha ? marketplace.tree : await ctx.client.getTree(pinned.repo, pinned.sha);
  const content = await collectContent(ctx.client, { repo: pinned.repo, sha: pinned.sha, path: pinned.path }, tree);

  // plugin.json is optional (plugins-reference): without it the marketplace
  // entry names the plugin and components are discovered from the directory.
  // `strict` only decides which side is the authority when both declare them.
  const pluginJson = parseJsonEntry<PluginJson>(content, PLUGIN_JSON);

  // Whose REPOSITORY the content is in, not which folder of it.
  //
  // This read `path.startsWith("plugins/")`, so the 15 plugins Anthropic keeps
  // in `external_plugins/` — github, linear, terraform, playwright — were
  // labelled "Community contribution" in a marketplace Anthropic publishes.
  // Nothing ever said external_plugins were community; the directory test was
  // written for the ones under plugins/ and everything else fell through the
  // default. Asking which repository the content was pinned to answers the
  // question the badge actually asks — who published this — and cannot be
  // fooled by a directory nobody anticipated.
  //
  // An entry whose source points at somebody else's repository is still
  // community, which is the case this has to keep getting right: being listed
  // in the official marketplace is not the same as being published by Anthropic.
  const sourceType: SourceType = pinned.repo === marketplace.repo ? marketplace.hostedSourceType : "community";
  const classification = classifyPlugin(content, {
    pluginJson,
    lspServers: entry.lspServers,
    inlineSkills: entry.skills,
    existing,
  });
  const version = entry.version ?? pluginJson?.version;
  const updatedAt = (await ctx.client.getLastCommitDate(pinned.repo, pinned.sha, pinned.path)) ?? existing?.updatedAt;
  const longDescription = input.draftLongDescription && existing?.longDescription === undefined ? draftFor(ctx, input, pinned, content, pluginJson) : null;

  const item = finalizeItem(
    {
      slug,
      name: entry.displayName ?? formatName(entry.name),
      type: "plugin",
      description: entry.description ?? pluginJson?.description ?? "",
      ...(longDescription && { longDescription }),
      compatibility: storageAgents(derivePluginCompatibility(classification)),
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
  // From the archive, which the entries hosted in the marketplace repo read anyway; the raw host limits per file.
  const bytes = (await client.getArchive(repo, sha)).get(MARKETPLACE_FILE);
  if (!bytes) throw new Error(`${repo}@${sha} has no ${MARKETPLACE_FILE}`);
  const text = bytes.toString("utf-8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${repo}@${sha} ${MARKETPLACE_FILE} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  return parseMarketplace(json, `${repo}@${sha}`);
}

/** Existing plugins that say they came from this marketplace. */
export function marketplacePluginsOwnedByField(existing: ReadonlyMap<ItemKey, ManifestItem>, marketplaceName: string): ItemKey[] {
  return [...existing.values()]
    .filter((item) => item.type === "plugin" && (item.marketplaceRef?.name === marketplaceName || item.marketplace === marketplaceName))
    .map(itemKey);
}

/**
 * A mirror item is kept as it is when the entry still pins the commit and path it was built
 * from: the same commit holds the same files, so rebuilding would only spend requests.
 */
function pinUnchanged(source: MarketplaceSource, entry: MarketplaceEntry, existing: ManifestItem, marketplaceSha: string): boolean {
  if (existing.slug !== entry.name || existing.marketplaceRef?.name !== source.name || !existing.pluginSource) return false;
  const declared = describeSource(entry, source.repo, marketplaceSha);
  if (!declared.sha) return false;
  return JSON.stringify(toPluginSource({ ...declared, sha: declared.sha })) === JSON.stringify(existing.pluginSource);
}

/**
 * Sync one marketplace. `claimed` holds the plugin keys earlier sources own or produced this
 * run; this marketplace neither builds nor owns them, whatever it lists.
 */
export async function syncMarketplace(ctx: SourceContext, source: MarketplaceSource, claimed: ReadonlySet<ItemKey>): Promise<SourceResult> {
  const ownedByField = marketplacePluginsOwnedByField(ctx.existing, source.name).filter((key) => !claimed.has(key));
  ctx.log(`\n=== Marketplace ${source.name} (${source.repo}@${source.branch}) ===`);
  try {
    const { sha } = await ctx.client.getCommit(source.repo, source.branch);
    const tree = await ctx.client.getTree(source.repo, sha);
    const marketplace = await loadMarketplace(ctx.client, source.repo, sha);
    if (marketplace.name !== source.name) {
      return {
        status: "failed",
        owned: ownedByField,
        reason: `marketplace at ${sha} is named "${marketplace.name}", expected "${source.name}"`,
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
      if (item.type !== "plugin" || claimed.has(itemKey(item))) continue;
      const name = applyRenames(item.slug, marketplace.renames);
      const entry = entriesByName.get(name);
      if (!entry || claimed.has(`plugin/${name}`)) continue;
      included.set(name, { entry, existing: item });
      owned.add(itemKey(item));
      if (name !== item.slug) renamed.push({ from: itemKey(item), to: `plugin/${name}` });
    }
    for (const entry of marketplace.plugins) {
      if (!included.has(entry.name) && !claimed.has(`plugin/${entry.name}`)) included.set(entry.name, { entry, existing: null });
    }
    ctx.log(`  inclusion set: ${included.size} entries (${[...included.values()].filter((e) => e.existing).length} existing)`);

    const items: ManifestItem[] = [];
    const failedItems: { key: ItemKey; reason: string }[] = [];
    let kept = 0;
    await mapConcurrent([...included.values()], ITEM_CONCURRENCY, async ({ entry, existing }) => {
      if (!ctx.rebuild && existing && pinUnchanged(source, entry, existing, sha)) {
        items.push(existing);
        kept++;
        return;
      }
      try {
        items.push(
          await buildMarketplacePlugin(ctx, {
            entry,
            existing,
            slug: entry.name,
            marketplace: { name: marketplace.name, repo: source.repo, sha, tree, hostedSourceType: source.hostedSourceType },
            draftLongDescription: true,
          }),
        );
        ctx.log(`  ✓ ${entry.name}${existing && existing.slug !== entry.name ? ` (renamed from ${existing.slug})` : ""}`);
      } catch (error) {
        failedItems.push({ key: existing ? itemKey(existing) : `plugin/${entry.name}`, reason: describeError(error) });
        ctx.log(`  ✗ ${entry.name}: ${describeError(error)}`);
      }
    });
    if (kept > 0) ctx.log(`  kept ${kept} item(s) whose pin has not moved`);
    items.sort((a, b) => a.slug.localeCompare(b.slug, "en"));
    return { status: "complete", owned: [...owned], items, failedItems, renamed };
  } catch (error) {
    return { status: "failed", owned: ownedByField, reason: describeError(error) };
  }
}
