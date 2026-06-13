/**
 * Sync skills and plugins from Anthropic repositories.
 *
 * Sources:
 * - anthropics/skills/skills → skills, sourceType: "official"
 * - anthropics/claude-plugins-official/plugins → plugins, sourceType: "official"
 * - anthropics/claude-plugins-official/external_plugins → plugins, sourceType: "community"
 */

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  GITHUB_RAW,
  fetchJson,
  fetchText,
  fetchLastCommitDate,
  fetchRepoTree,
  listDirectoryFromTree,
  extractSubtree,
  computeContentHash,
  formatName,
  parsePluginContents,
} from "./utils.js";
import type { PluginJson } from "./utils.js";
import type { ManifestItem, ComponentType, SourceType, GitTreeItem, PluginContents, PluginType, ParsedPluginContents } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryDir = join(__dirname, "..", "..", "registry");

function pluralizeType(type: string): string {
  if (type === "settings") return "settings";
  return type + "s";
}

/**
 * Read existing item.json to preserve manually-set fields like compatibility.
 */
function readExistingItem(type: string, slug: string): ManifestItem | null {
  const itemPath = join(registryDir, pluralizeType(type), slug, "item.json");
  if (!existsSync(itemPath)) return null;
  try {
    return JSON.parse(readFileSync(itemPath, "utf-8"));
  } catch {
    return null;
  }
}

const PLUGINS_REPO = "anthropics/claude-plugins-official";
const SKILLS_REPO = "anthropics/skills";

// Items to exclude
const EXCLUDED = ["example-plugin", "template"];

async function fetchPluginJson(repo: string, basePath: string, slug: string): Promise<PluginJson | null> {
  const url = `${GITHUB_RAW}/${repo}/main/${basePath}/${slug}/.claude-plugin/plugin.json`;
  return fetchJson<PluginJson>(url);
}

async function fetchHookTriggers(repo: string, basePath: string, slug: string): Promise<string[] | null> {
  // Try hooks/hooks.json, then .claude/hooks/hooks.json
  for (const hooksPath of ["hooks/hooks.json", ".claude/hooks/hooks.json"]) {
    const url = `${GITHUB_RAW}/${repo}/main/${basePath}/${slug}/${hooksPath}`;
    const data = await fetchJson<{ hooks?: Record<string, unknown> }>(url);
    if (data?.hooks) {
      return Object.keys(data.hooks);
    }
  }
  return null;
}

async function fetchMcpServerNames(repo: string, basePath: string, slug: string): Promise<string[] | null> {
  const url = `${GITHUB_RAW}/${repo}/main/${basePath}/${slug}/.mcp.json`;
  const data = await fetchJson<Record<string, unknown>>(url);
  if (!data) return null;
  // Two formats: { mcpServers: { name: ... } } or { name: ... } (flat)
  const servers = (data.mcpServers as Record<string, unknown> | undefined) ?? data;
  return Object.keys(servers).filter(k => k !== "mcpServers");
}

async function fetchReadmeMd(repo: string, basePath: string, slug: string): Promise<{ name: string; description: string } | null> {
  const url = `${GITHUB_RAW}/${repo}/main/${basePath}/${slug}/README.md`;
  const content = await fetchText(url);
  if (!content) return null;

  // Extract name from first # heading, description from first paragraph
  const headingMatch = content.match(/^#\s+(.+)$/m);
  const name = headingMatch ? headingMatch[1].trim() : formatName(slug);

  // First non-empty paragraph after the heading (or from start if no heading)
  const lines = content.split("\n");
  let description = "";
  let pastHeading = !headingMatch; // if no heading, start collecting immediately
  for (const line of lines) {
    if (line.startsWith("# ")) { pastHeading = true; continue; }
    if (!pastHeading) continue;
    const trimmed = line.trim();
    if (trimmed === "") { if (description) break; continue; }
    if (trimmed.startsWith("#") || trimmed.startsWith("```")) break;
    description += (description ? " " : "") + trimmed;
  }

  return { name, description };
}

async function fetchSkillMd(repo: string, basePath: string, slug: string): Promise<{ name: string; description: string } | null> {
  const url = `${GITHUB_RAW}/${repo}/main/${basePath}/${slug}/SKILL.md`;
  const content = await fetchText(url);
  if (!content) return null;

  // Parse YAML frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch ? descMatch[1].trim() : "",
  };
}

interface FetchItemsOptions {
  repo: string;
  basePath: string;
  type: ComponentType;
  sourceType: SourceType;
  compatibility: string[];
  defaultAuthor: string;
  repoTree: GitTreeItem[];
  fetchMetadata: (repo: string, basePath: string, slug: string) => Promise<{ name: string; description: string; author?: { name: string; url?: string } } | null>;
  includeFileTree?: boolean;
  marketplace?: string;
}

async function fetchItems(options: FetchItemsOptions): Promise<ManifestItem[]> {
  const { repo, basePath, type, sourceType, compatibility, defaultAuthor, repoTree, fetchMetadata, includeFileTree, marketplace } = options;
  const slugs = listDirectoryFromTree(repoTree, basePath);

  console.log(`Fetching ${slugs.length} ${type}s from ${repo}/${basePath}...`);

  const results = await Promise.all(
    slugs
      .filter((slug) => !EXCLUDED.includes(slug))
      .map(async (slug) => {
        const metadata = await fetchMetadata(repo, basePath, slug);
        if (!metadata) {
          console.warn(`  Skipping ${slug} (no metadata)`);
          return null;
        }

        const updatedAt = await fetchLastCommitDate(repo, `${basePath}/${slug}`);
        const contentHash = computeContentHash(repoTree, `${basePath}/${slug}`);

        let contents: PluginContents | undefined;
        let pluginType: PluginType | undefined;
        let wrapper: string | undefined;
        let integration: string | undefined;
        let pkg: Record<string, number> | undefined;

        if (includeFileTree) {
          const files = extractSubtree(repoTree, `${basePath}/${slug}`, 6);
          if (files.length > 0) {
            const parsed = parsePluginContents(files);
            // Replace file-based hooks with trigger names from hooks.json
            if (parsed.hooks) {
              const triggers = await fetchHookTriggers(repo, basePath, slug);
              if (triggers && triggers.length > 0) {
                parsed.hooks = triggers;
              }
            }
            // Replace placeholder with actual MCP server names from .mcp.json
            if (parsed.mcpServers) {
              const servers = await fetchMcpServerNames(repo, basePath, slug);
              if (servers && servers.length > 0) {
                parsed.mcpServers = servers;
              }
            }

            // Classify plugin type — only for plugins, not skills or other types
            if (type === "plugin") {
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

              // Preserve existing pluginType if integration (detected from existing item.json)
              const existingForClassify = readExistingItem(type, slug);
              if (existingForClassify?.pluginType === "integration") {
                pluginType = "integration";
                integration = existingForClassify.integration ?? "lsp";
              } else if (typeNames.length === 0) {
                pluginType = "package";
                pkg = {};
              } else if (typeNames.length === 1) {
                pluginType = "wrapper";
                wrapper = typeNames[0];
              } else {
                pluginType = "package";
                pkg = typeCounts;
              }
            }

            // Store only files on contents for plugins; keep full tree for other types
            contents = parsed.files?.length ? { files: parsed.files } : undefined;
          }
        }

        // Preserve existing item.json fields, only overwrite remote-sourced ones.
        // Whitelist: these fields are refreshed from the remote source on every sync.
        // Everything else (longDescription, featured, targetScope, etc.) is preserved.
        const existing = readExistingItem(type, slug);
        const itemName = existing?.name ?? formatName(metadata.name || slug);
        const itemCompatibility = existing?.compatibility ?? compatibility;

        console.log(`  ✓ ${slug}${updatedAt ? ` (${updatedAt.split("T")[0]})` : ""}`);
        return {
          ...(existing ?? {}),
          // --- whitelisted remote fields ---
          slug,
          name: itemName,
          type,
          description: metadata.description || "",
          compatibility: itemCompatibility,
          sourceType,
          author: metadata.author ?? { name: defaultAuthor },
          externalUrl: `https://github.com/${repo}/tree/main/${basePath}/${slug}`,
          ...(marketplace && { marketplace }),
          ...(contentHash && { contentHash }),
          ...(updatedAt && { updatedAt }),
          ...(contents && { contents }),
          ...(pluginType && { pluginType }),
          ...(wrapper && { wrapper }),
          ...(integration && { integration }),
          ...(pkg && { package: pkg }),
        } satisfies ManifestItem;
      })
  );

  return results.filter((item): item is ManifestItem => item !== null);
}

export async function syncAnthropic(): Promise<ManifestItem[]> {
  console.log("\n=== Syncing from Anthropic ===\n");

  // Pre-fetch entire repo trees (1 API call each, cached for reuse)
  // Also fetch marketplace.json from the plugins repo root
  const [skillsTree, pluginsTree, pluginsMarketplace] = await Promise.all([
    fetchRepoTree(SKILLS_REPO),
    fetchRepoTree(PLUGINS_REPO),
    fetchJson<{ name: string }>(`${GITHUB_RAW}/${PLUGINS_REPO}/main/.claude-plugin/marketplace.json`),
  ]);
  const pluginsMarketplaceName = pluginsMarketplace?.name;

  if (skillsTree.length === 0) {
    console.warn("⚠ Failed to fetch skills repo tree — skipping skills");
  }
  if (pluginsTree.length === 0) {
    console.warn("⚠ Failed to fetch plugins repo tree — skipping plugins");
  }

  // Fetch official skills (compatible with all tools)
  const officialSkills = skillsTree.length > 0 ? await fetchItems({
    repo: SKILLS_REPO,
    basePath: "skills",
    type: "skill",
    sourceType: "official",
    compatibility: ["claude", "copilot", "gemini", "codex", "opencode"],
    defaultAuthor: "Anthropic",
    repoTree: skillsTree,
    includeFileTree: true,
    fetchMetadata: async (repo, basePath, slug) => {
      const skill = await fetchSkillMd(repo, basePath, slug);
      if (!skill) return null;
      return { name: skill.name, description: skill.description, author: { name: "Anthropic" } };
    },
  }) : [];

  // Fetch official plugins (Claude-only)
  const officialPlugins = pluginsTree.length > 0 ? await fetchItems({
    repo: PLUGINS_REPO,
    basePath: "plugins",
    type: "plugin",
    sourceType: "official",
    compatibility: ["claude"],
    defaultAuthor: "Anthropic",
    repoTree: pluginsTree,
    includeFileTree: true,
    marketplace: pluginsMarketplaceName,
    fetchMetadata: async (repo, basePath, slug) => {
      const plugin = await fetchPluginJson(repo, basePath, slug);
      if (plugin) {
        return {
          name: plugin.name,
          description: plugin.description,
          author: plugin.author ? { name: plugin.author.name, url: plugin.author.url } : undefined,
        };
      }
      // Fall back to README.md for plugins without plugin.json (e.g. LSPs)
      const readme = await fetchReadmeMd(repo, basePath, slug);
      if (!readme) return null;
      return { name: readme.name, description: readme.description };
    },
  }) : [];

  // Fetch community plugins (Claude-only)
  // External plugins share the same repo-level marketplace as official plugins
  const communityPlugins = pluginsTree.length > 0 ? await fetchItems({
    repo: PLUGINS_REPO,
    basePath: "external_plugins",
    type: "plugin",
    sourceType: "community",
    compatibility: ["claude"],
    defaultAuthor: "Community",
    repoTree: pluginsTree,
    includeFileTree: true,
    marketplace: pluginsMarketplaceName,
    fetchMetadata: async (repo, basePath, slug) => {
      const plugin = await fetchPluginJson(repo, basePath, slug);
      if (!plugin) return null;
      return {
        name: plugin.name,
        description: plugin.description,
        author: plugin.author ? { name: plugin.author.name, url: plugin.author.url } : undefined,
      };
    },
  }) : [];

  const items = [...officialSkills, ...officialPlugins, ...communityPlugins];
  console.log(`\nAnthropic sync complete: ${items.length} items`);

  return items;
}
