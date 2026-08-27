import type { ComponentType, FileTreeNode, RegistryItem } from "@seedr/shared";
import { ALL_TYPES, type ValidationError, typeDirName, validateItem } from "@seedr/registry-ops/pure";
import type { FsApi } from "@/api/fs";

/** One item as Studio shows it: where it is, what it says, and what is wrong with it. */
export interface StudioItem {
  type: ComponentType;
  slug: string;
  /** Repo-relative directory, forward slashes. */
  dir: string;
  item: RegistryItem;
  errors: ValidationError[];
}

export interface RegistrySnapshot {
  items: StudioItem[];
  /** Files that could not be read or parsed at all — shown, never hidden. */
  problems: string[];
}

export const itemDirRel = (registryDir: string, type: ComponentType, slug: string): string => `${registryDir}/${typeDirName(type)}/${slug}`;

/**
 * Read every item off disk through the host's scoped filesystem and validate it
 * with the same validator compile and the commit gate use. Invalid items are
 * listed with their errors rather than dropped — a maintainer needs to see them.
 */
export async function loadRegistry(fs: FsApi, registryDir: string): Promise<RegistrySnapshot> {
  const items: StudioItem[] = [];
  const problems: string[] = [];
  for (const type of ALL_TYPES) {
    const typeDir = `${registryDir}/${typeDirName(type)}`;
    if (!(await fs.pathExists(typeDir))) continue;
    const entries = (await fs.listDir(typeDir)).filter((e) => e.kind === "directory").sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const dir = `${typeDir}/${entry.name}`;
      const jsonPath = `${dir}/item.json`;
      if (!(await fs.pathExists(jsonPath))) continue;
      try {
        const item = JSON.parse(await fs.readText(jsonPath)) as RegistryItem;
        items.push({ type, slug: entry.name, dir, item, errors: validateItem(item, { expectedType: type, expectedSlug: entry.name }) });
      } catch (error) {
        problems.push(`${jsonPath}: ${(error as Error).message}`);
      }
    }
  }
  return { items, problems };
}

/** The file tree under an item directory, directories first, item.json excluded. */
export async function loadFileTree(fs: FsApi, dir: string): Promise<FileTreeNode[]> {
  const entries = await fs.listDir(dir);
  const nodes: FileTreeNode[] = [];
  for (const entry of entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1))) {
    if (entry.kind === "directory") {
      nodes.push({ name: entry.name, type: "directory", children: await loadFileTree(fs, `${dir}/${entry.name}`) });
    } else if (entry.kind === "file" && entry.name !== "item.json") {
      nodes.push({ name: entry.name, type: "file" });
    }
  }
  return nodes;
}

export const countByType = (items: StudioItem[]): Record<ComponentType, number> => {
  const counts = Object.fromEntries(ALL_TYPES.map((type) => [type, 0])) as Record<ComponentType, number>;
  for (const item of items) counts[item.type]++;
  return counts;
};
