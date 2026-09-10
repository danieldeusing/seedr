import type { IFuseOptions } from "fuse.js";
import { canonicalAgents, canonicalSourceType, typeDirName } from "@seedr/registry-ops/pure";
import { itemsInCategory } from "../../scripts/site-meta.mjs";
import type { RegistryManifest, RegistryManifestIndex, RegistryItem, ComponentType, FileTreeNode, TypeManifest } from "./types";

// The registry is fetched, not bundled: a few thousand plugin records belong in
// cached JSON, not in the entry chunk. The build emits the index, the per-type
// manifests and every item.json under /registry/ (vite.config.ts), dev serves the
// same paths from the configured registry directory, and the tests answer them
// from disk (src/test/setup.ts). The module awaits the manifests once, so every
// export below stays synchronous for its callers.
const REGISTRY_BASE = "/registry";

async function fetchRegistryFile<T>(path: string): Promise<T> {
  const response = await fetch(`${REGISTRY_BASE}/${path}`);
  if (!response.ok) throw new Error(`registry: ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

export const registryIndex = await fetchRegistryFile<RegistryManifestIndex>("manifest.json");
const typeManifests = await Promise.all(
  Object.values(registryIndex.types).map((descriptor) => fetchRegistryFile<TypeManifest>(descriptor.file))
);

// Dev-only test item for testing media previews (served from apps/web/dev-samples
// by the vite dev middleware; kept out of public/ so it isn't deployed)
const devTestItem: RegistryItem = {
  slug: "media-preview-test",
  name: "Media Preview Test",
  type: "skill",
  description: "Test item for previewing various media formats (dev only)",
  compatibility: ["claude"],
  sourceType: "seedr",
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

// Assemble all type manifests into a single RegistryManifest. Compatibility and
// source type are canonicalised here, so a not-yet-migrated `gemini`
// entry filters and renders as `antigravity` / `seedr` everywhere downstream.
const allItems: RegistryItem[] = typeManifests
  .flatMap((typeManifest) => typeManifest.items as RegistryItem[])
  .map((item) => ({
    ...item,
    compatibility: canonicalAgents(item.compatibility),
    sourceType: canonicalSourceType(item.sourceType) ?? item.sourceType,
  }));

const baseManifest: RegistryManifest = {
  version: registryIndex.version,
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
  // One definition, shared with the prerendered <meta> (see site-meta.mjs).
  return itemsInCategory(manifest.items, type);
}

export function getItem(slug: string, type?: ComponentType): RegistryItem | undefined {
  if (type) return manifest.items.find((item) => item.slug === slug && item.type === type);
  return manifest.items.find((item) => item.slug === slug);
}

// An item's full record (longDescription, file tree) is fetched on demand from its
// item.json, which the per-type manifests strip. The promise is what is cached, so
// the detail page's parallel readers share one request.
const itemJsonCache = new Map<string, Promise<RegistryItem | undefined>>();

function loadItemJson(slug: string, type?: ComponentType): Promise<RegistryItem | undefined> {
  const resolvedType = type ?? getItem(slug)?.type;
  if (!resolvedType) return Promise.resolve(undefined);
  const key = `${typeDirName(resolvedType)}/${slug}`;
  let pending = itemJsonCache.get(key);
  if (!pending) {
    pending = fetch(`${REGISTRY_BASE}/${key}/item.json`).then((response) => (response.ok ? (response.json() as Promise<RegistryItem>) : undefined));
    itemJsonCache.set(key, pending);
  }
  return pending;
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
    skill: 0, hook: 0, agent: 0, plugin: 0, command: 0, settings: 0, mcp: 0, rule: 0,
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
