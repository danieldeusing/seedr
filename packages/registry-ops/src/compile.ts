import { mkdirSync, writeFileSync } from "node:fs";
import type { ComponentType, RegistryItem, RegistryManifestIndex, SourceType, TypeManifest } from "@seedr/shared";
import { contentHash } from "./hash.js";
import { indexManifestPath, typeDir, typeManifestPath } from "./fsPaths.js";
import { ALL_TYPES, typeDirName } from "./paths.js";
import { listItems } from "./read.js";
import { omit } from "./util.js";

export const MANIFEST_VERSION = "2.0.0";

const SOURCE_ORDER: Record<SourceType, number> = { toolr: 0, community: 1, official: 2 };

export interface CompileResult {
  /** Every item as written into the per-type manifests' source, in manifest order. */
  items: RegistryItem[];
  counts: Record<ComponentType, number>;
}

/**
 * All items with their content hash filled in for toolr items, sorted the way
 * the manifests list them: by source (toolr, community, official), then slug.
 * Structural validation happens in `listItems`; the description gate does not
 * apply here, because synced items are compiled as they arrive.
 */
export function collectItems(registryDir: string): RegistryItem[] {
  const items = listItems(registryDir).map(({ dir, item }) => {
    if (item.sourceType === "toolr") {
      const hash = contentHash(dir);
      if (hash) return { ...item, contentHash: hash };
    }
    return item;
  });
  return items.sort((a, b) => {
    const order = SOURCE_ORDER[a.sourceType ?? "toolr"] - SOURCE_ORDER[b.sourceType ?? "toolr"];
    return order !== 0 ? order : a.slug.localeCompare(b.slug);
  });
}

/**
 * Write the per-type manifests and the index. `longDescription` is stripped
 * everywhere and `contents` from plugins — both stay in item.json and are loaded
 * on demand. Writes are byte-identical to what `pnpm compile` has always produced.
 */
export function compileRegistry(registryDir: string): CompileResult {
  const items = collectItems(registryDir);
  const byType = new Map<ComponentType, RegistryItem[]>();
  for (const item of items) byType.set(item.type, [...(byType.get(item.type) ?? []), item]);

  const counts = {} as Record<ComponentType, number>;
  const types = {} as RegistryManifestIndex["types"];
  for (const type of ALL_TYPES) {
    const typeItems = (byType.get(type) ?? []).map((item) =>
      type === "plugin" ? omit(item, "longDescription", "contents") : omit(item, "longDescription")
    );
    const manifest: TypeManifest = { type, items: typeItems };
    mkdirSync(typeDir(registryDir, type), { recursive: true });
    writeFileSync(typeManifestPath(registryDir, type), JSON.stringify(manifest, null, 2) + "\n");
    counts[type] = typeItems.length;
    types[type] = { file: `${typeDirName(type)}/manifest.json`, count: typeItems.length };
  }

  const index: RegistryManifestIndex = { version: MANIFEST_VERSION, types };
  writeFileSync(indexManifestPath(registryDir), JSON.stringify(index, null, 2) + "\n");
  return { items, counts };
}
