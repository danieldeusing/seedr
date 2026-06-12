import type { IFuseOptions } from "fuse.js";
import type { RegistryManifest, RegistryItem, ComponentType, FileTreeNode } from "./types";

// Import split manifest files (bundled at build time)
import indexData from "@registry/manifest.json";
import skillsData from "@registry/skills/manifest.json";
import pluginsData from "@registry/plugins/manifest.json";
import hooksData from "@registry/hooks/manifest.json";
import agentsData from "@registry/agents/manifest.json";
import mcpData from "@registry/mcp/manifest.json";
import settingsData from "@registry/settings/manifest.json";
import commandsData from "@registry/commands/manifest.json";

// Dev-only test item for testing media previews (uses local files in /public/dev-samples/)
const devTestItem: RegistryItem = {
  slug: "media-preview-test",
  name: "Media Preview Test",
  type: "skill",
  description: "Test item for previewing various media formats (dev only)",
  compatibility: ["claude"],
  sourceType: "toolr",
  author: { name: "Daniel Deusing" },
  externalUrl: "local://dev-samples",
  contents: {
    files: [
      { name: "sample.png", type: "file" },
      { name: "sample.jpg", type: "file" },
      { name: "sample.gif", type: "file" },
      { name: "sample.svg", type: "file" },
      { name: "sample.webp", type: "file" },
      { name: "sample.mp3", type: "file" },
      { name: "sample.mp4", type: "file" },
      { name: "sample.pdf", type: "file" },
    ],
  },
};

// Assemble all type manifests into a single RegistryManifest
const allItems: RegistryItem[] = [
  ...skillsData.items,
  ...pluginsData.items,
  ...hooksData.items,
  ...agentsData.items,
  ...mcpData.items,
  ...settingsData.items,
  ...commandsData.items,
] as RegistryItem[];

const baseManifest: RegistryManifest = {
  version: indexData.version,
  items: allItems,
};

const manifest: RegistryManifest = import.meta.env.DEV
  ? { ...baseManifest, items: [devTestItem, ...baseManifest.items] }
  : baseManifest;

export function getManifest(): RegistryManifest {
  return manifest;
}

export function getAllItems(): RegistryItem[] {
  return manifest.items;
}

export const fuseOptions: IFuseOptions<RegistryItem> = {
  keys: ["name", "slug", "description"],
  threshold: 0.2,
  minMatchCharLength: 2,
};

export function getItemsByType(type: ComponentType): RegistryItem[] {
  if (type === "plugin") {
    return manifest.items.filter((item) => item.type === type);
  }
  // Include wrapper plugins that wrap this capability type
  return manifest.items.filter(
    (item) =>
      item.type === type ||
      (item.type === "plugin" && item.pluginType === "wrapper" && item.wrapper === type)
  );
}

export function getItem(slug: string, type?: ComponentType): RegistryItem | undefined {
  if (type) return manifest.items.find((item) => item.slug === slug && item.type === type);
  return manifest.items.find((item) => item.slug === slug);
}

// Lazy-import item.json files for longDescription lookup (stripped from manifests).
// Each entry is an async () => module, loaded only when requested.
const itemJsonLoaders = import.meta.glob<{ default: RegistryItem }>(
  "@registry/*/*/item.json",
);

// Build a typeDir/slug → loader map for O(1) lookup (supports duplicate slugs across types)
const loaderByKey = new Map<string, () => Promise<{ default: RegistryItem }>>();
for (const [path, loader] of Object.entries(itemJsonLoaders)) {
  // path: /registry/<typeDir>/<slug>/item.json → extract typeDir and slug
  const parts = path.split("/");
  const slug = parts[parts.length - 2];
  const typeDir = parts[parts.length - 3];
  if (slug && typeDir) loaderByKey.set(`${typeDir}/${slug}`, loader);
}

// Cache for item.json data (lazy-loaded)
const itemJsonCache = new Map<string, RegistryItem>();

async function loadItemJson(slug: string, type?: ComponentType): Promise<RegistryItem | undefined> {
  const key = type ? `${type}s/${slug}` : slug;
  if (itemJsonCache.has(key)) return itemJsonCache.get(key);

  const loader = type
    ? loaderByKey.get(`${type}s/${slug}`)
    : [...loaderByKey.entries()].find(([k]) => k.endsWith(`/${slug}`))?.[1];
  if (!loader) return undefined;

  const mod = await loader();
  const item = mod.default;
  if (item) itemJsonCache.set(key, item);
  return item;
}

export async function getLongDescription(slug: string, type?: ComponentType): Promise<string | undefined> {
  const item = await loadItemJson(slug, type);
  return item?.longDescription;
}

export async function getFileTree(slug: string, type?: ComponentType): Promise<FileTreeNode[] | undefined> {
  const item = await loadItemJson(slug, type);
  return item?.contents?.files;
}

export function getFeaturedItems(): RegistryItem[] {
  return manifest.items.filter((item) => item.featured);
}

export function getTypeCount(type: ComponentType): number {
  return getItemsByType(type).length;
}

// Computed once at module level since manifest data is static (bundled at build time)
const typeCounts: Record<ComponentType, number> = (() => {
  const counts: Record<ComponentType, number> = {
    skill: 0, hook: 0, agent: 0, plugin: 0, command: 0, settings: 0, mcp: 0,
  };
  for (const item of manifest.items) {
    counts[item.type]++;
    if (item.type === "plugin" && item.pluginType === "wrapper" && item.wrapper) {
      const wrappedType = item.wrapper as ComponentType;
      if (wrappedType in counts) {
        counts[wrappedType]++;
      }
    }
  }
  return counts;
})();

export function getTypeCounts(): Record<ComponentType, number> {
  return typeCounts;
}
