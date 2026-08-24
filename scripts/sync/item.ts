/**
 * Final assembly of a synced item: curated fields win over freshly derived ones, unknown
 * keys an editor added by hand survive, and keys are emitted in one canonical order so a
 * re-sync that changes nothing produces no diff.
 */

import type { ManifestItem } from "./types.js";

/** Fields maintained by hand in item.json; the sync never overwrites them once set. */
export const CURATED_FIELDS = ["name", "longDescription", "featured", "targetScope", "compatibility"] as const;

const KEY_ORDER: (keyof ManifestItem)[] = [
  "slug",
  "name",
  "type",
  "description",
  "longDescription",
  "compatibility",
  "featured",
  "pluginType",
  "wrapper",
  "integration",
  "package",
  "sourceType",
  "targetScope",
  "author",
  "externalUrl",
  "marketplace",
  "version",
  "strict",
  "lspServers",
  "skills",
  "sourceRevision",
  "contentDigest",
  "contentHash",
  "pluginSource",
  "marketplaceRef",
  "license",
  "updatedAt",
  "contents",
];

/**
 * @param fresh    the item as derived from upstream this run (with defaults for curated fields)
 * @param existing the item.json currently on disk, if any
 */
export function finalizeItem(fresh: ManifestItem, existing: ManifestItem | null): ManifestItem {
  const merged: Record<string, unknown> = { ...fresh };
  if (existing) {
    for (const field of CURATED_FIELDS) {
      if (existing[field] !== undefined) merged[field] = existing[field];
    }
    const known = new Set<string>(KEY_ORDER);
    for (const [key, value] of Object.entries(existing)) {
      if (!known.has(key) && merged[key] === undefined) merged[key] = value;
    }
  }

  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    if (merged[key] !== undefined) ordered[key] = merged[key];
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!(key in ordered) && value !== undefined) ordered[key] = value;
  }
  return ordered as unknown as ManifestItem;
}

/** Stable serialisation used both for writing item.json and for change detection. */
export function serializeItem(item: ManifestItem): string {
  return JSON.stringify(item, null, 2) + "\n";
}
