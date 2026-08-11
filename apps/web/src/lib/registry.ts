import type { IFuseOptions } from "fuse.js";
import type { RegistryManifest, RegistryItem, ComponentType, FileTreeNode } from "./types";

// The public registry (manifests + lazy item.json loaders) — swapped for an
// empty stub by the vite plugin in private-only builds (SEEDR_PRIVATE_REGISTRY
// set without SEEDR_INCLUDE_PUBLIC=true), so public data stays out of the
// bundle entirely. See lib/publicRegistry.ts and vite.config.ts.
import publicRegistry from "virtual:seedr-public-registry";

// Items from SEEDR_PRIVATE_REGISTRY, bundled at build time (empty when unset).
import privateRegistry from "virtual:seedr-private-registry";

// Dev-only test item for testing media previews (served from apps/web/dev-samples
// by the vite dev middleware; kept out of public/ so it isn't deployed)
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

// A private item with the same type+slug as a public one shadows it, so an
// instance can carry its own variant of a public entry.
const privateItems = privateRegistry.items;
const shadowedKeys = new Set(privateItems.map((item) => `${item.type}/${item.slug}`));

const allItems: RegistryItem[] = [
  ...privateItems,
  ...publicRegistry.items.filter((item) => !shadowedKeys.has(`${item.type}/${item.slug}`)),
];

const baseManifest: RegistryManifest = {
  version: publicRegistry.version,
  items: allItems,
};

const manifest: RegistryManifest = import.meta.env.DEV
  ? { ...baseManifest, items: [devTestItem, ...baseManifest.items] }
  : baseManifest;

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

// Build a typeDir/slug → loader map for O(1) lookup (supports duplicate slugs across types)
const loaderByKey = new Map<string, () => Promise<{ default: RegistryItem }>>();
for (const [path, loader] of Object.entries(publicRegistry.itemJsonLoaders)) {
  // path: /registry/<typeDir>/<slug>/item.json → extract typeDir and slug
  const parts = path.split("/");
  const slug = parts[parts.length - 2];
  const typeDir = parts[parts.length - 3];
  if (slug && typeDir) loaderByKey.set(`${typeDir}/${slug}`, loader);
}

// Cache for item.json data (lazy-loaded)
const itemJsonCache = new Map<string, RegistryItem>();

// registry folder per type (folders: skills, plugins, hooks, agents, commands, settings, mcp)
function typeDir(type: ComponentType): string {
  return type === "mcp" || type === "settings" ? type : `${type}s`;
}

async function loadItemJson(slug: string, type?: ComponentType): Promise<RegistryItem | undefined> {
  // Private items ship complete in the bundle (nothing is stripped), so there
  // is no item.json to load — serve them straight from the manifest.
  const bundledPrivateItem = manifest.items.find(
    (candidate) =>
      candidate.sourceType === "private" && candidate.slug === slug && (!type || candidate.type === type)
  );
  if (bundledPrivateItem) return bundledPrivateItem;

  const key = type ? `${typeDir(type)}/${slug}` : slug;
  if (itemJsonCache.has(key)) return itemJsonCache.get(key);

  const loader = type
    ? loaderByKey.get(`${typeDir(type)}/${slug}`)
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
