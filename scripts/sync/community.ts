/**
 * Sync manually-added community items from their GitHub repos.
 * Re-fetches metadata, file trees, and last commit dates.
 */

import {
  GITHUB_RAW,
  fetchJson,
  fetchText,
  fetchLastCommitDate,
  fetchRepoTree,
  extractSubtree,
  computeContentHash,
  formatName,
  parsePluginContents,
} from "./utils.js";
import type { PluginJson } from "./utils.js";
import type { ManifestItem, PluginContents, ParsedPluginContents } from "./types.js";

interface MarketplaceJson {
  name: string;
}

/**
 * Parse owner/repo and optional subpath from an externalUrl.
 * Handles: https://github.com/owner/repo/tree/main/subpath
 */
function parseExternalUrl(url: string): { repo: string; basePath: string } | null {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)(?:\/tree\/[^/]+\/?(.*)?)?/);
  if (!match) return null;
  return { repo: match[1], basePath: match[2] || "" };
}

async function refreshPlugin(item: ManifestItem, repo: string, basePath: string): Promise<ManifestItem> {
  const pluginJsonUrl = `${GITHUB_RAW}/${repo}/main/${basePath ? basePath + "/" : ""}.claude-plugin/plugin.json`;
  const marketplaceJsonUrl = `${GITHUB_RAW}/${repo}/main/.claude-plugin/marketplace.json`;
  const [pluginJson, marketplaceJson] = await Promise.all([
    fetchJson<PluginJson & { mcpServers?: Record<string, unknown> }>(pluginJsonUrl),
    fetchJson<MarketplaceJson>(marketplaceJsonUrl),
  ]);

  const repoTree = await fetchRepoTree(repo);
  const updatedAt = await fetchLastCommitDate(repo, basePath || ".");
  const contentHash = repoTree.length > 0 ? computeContentHash(repoTree, basePath) : null;
  const files = repoTree.length > 0 ? extractSubtree(repoTree, basePath, 6) : [];

  const result: ManifestItem = {
    ...item,
    ...(pluginJson && { description: pluginJson.description }),
    ...(!item.name && pluginJson && { name: formatName(pluginJson.name || item.slug) }),
    ...(pluginJson?.author && { author: { name: pluginJson.author.name, url: pluginJson.author.url } }),
    ...(marketplaceJson?.name && { marketplace: marketplaceJson.name }),
    ...(contentHash && { contentHash }),
    ...(updatedAt && { updatedAt }),
    contents: files.length > 0 ? { files } : item.contents ?? {},
  };

  // Reclassify plugin type from file tree (preserve integration if manually set)
  if (files.length > 0 && item.pluginType !== "integration") {
    const parsed = parsePluginContents(files);

    // Detect MCP servers declared in plugin.json (not visible in file tree)
    if (pluginJson?.mcpServers) {
      const names = Object.keys(pluginJson.mcpServers);
      if (names.length > 0 && !parsed.mcpServers) {
        parsed.mcpServers = names;
      }
    }

    const contentKeyToType: Record<string, string> = {
      skills: "skill", agents: "agent", hooks: "hook",
      commands: "command", mcpServers: "mcp",
    };
    const typeCounts: Record<string, number> = {};
    for (const [key, typeName] of Object.entries(contentKeyToType)) {
      const arr = parsed[key as keyof ParsedPluginContents];
      if (Array.isArray(arr) && arr.length > 0) {
        typeCounts[typeName] = arr.length;
      }
    }
    const typeNames = Object.keys(typeCounts);

    if (typeNames.length === 0) {
      result.pluginType = "package";
      result.package = {};
      delete result.wrapper;
    } else if (typeNames.length === 1) {
      result.pluginType = "wrapper";
      result.wrapper = typeNames[0];
      delete result.package;
    } else {
      result.pluginType = "package";
      result.package = typeCounts;
      delete result.wrapper;
    }
  }

  return result;
}

async function refreshSkill(item: ManifestItem, repo: string, basePath: string): Promise<ManifestItem> {
  const skillMdUrl = `${GITHUB_RAW}/${repo}/main/${basePath ? basePath + "/" : ""}SKILL.md`;
  const content = await fetchText(skillMdUrl);

  let name = item.name;
  let description = item.description;

  if (content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const frontmatter = match[1];
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (nameMatch && !item.name) name = formatName(nameMatch[1].trim());
      if (descMatch) description = descMatch[1].trim();
    }
  }

  const repoTree = await fetchRepoTree(repo);
  const updatedAt = await fetchLastCommitDate(repo, basePath || ".");
  const contentHash = repoTree.length > 0 ? computeContentHash(repoTree, basePath) : null;
  const files = repoTree.length > 0 ? extractSubtree(repoTree, basePath, 6) : [];

  return {
    ...item,
    name,
    description,
    ...(contentHash && { contentHash }),
    ...(updatedAt && { updatedAt }),
    ...(files.length > 0 && { contents: { files } }),
  };
}

/**
 * Re-sync manually-added community items from their GitHub repos.
 * Takes existing community items, fetches fresh data, returns updated items.
 */
export async function syncCommunity(items: ManifestItem[]): Promise<ManifestItem[]> {
  if (items.length === 0) return [];

  console.log(`\n=== Syncing ${items.length} community items ===\n`);

  const results: ManifestItem[] = [];

  for (const item of items) {
    if (!item.externalUrl) {
      console.warn(`  Skipping ${item.slug} (no externalUrl)`);
      results.push(item);
      continue;
    }

    const parsed = parseExternalUrl(item.externalUrl);
    if (!parsed) {
      console.warn(`  Skipping ${item.slug} (unparsable externalUrl)`);
      results.push(item);
      continue;
    }

    try {
      const updated = item.type === "plugin"
        ? await refreshPlugin(item, parsed.repo, parsed.basePath)
        : await refreshSkill(item, parsed.repo, parsed.basePath);

      console.log(`  ✓ ${item.slug}${updated.updatedAt ? ` (${updated.updatedAt.split("T")[0]})` : ""}`);
      results.push(updated);
    } catch (err) {
      throw new Error(`Failed to sync community item ${item.slug}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nCommunity sync complete: ${results.length} items`);
  return results;
}
