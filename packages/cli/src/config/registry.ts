import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  RegistryManifest,
  RegistryManifestIndex,
  RegistryItem,
  ComponentType,
  TypeManifest,
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Local registry path (for development)
const REGISTRY_PATH = join(__dirname, "../../../../registry");

// Remote registry URL (GitHub raw content)
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/danieldeusing/seedr/main/registry";

const cache = {
  index: null as RegistryManifestIndex | null,
  types: new Map<ComponentType, RegistryItem[]>(),
  assembled: null as RegistryManifest | null,
};

async function loadFile(filename: string): Promise<string> {
  try {
    return await readFile(join(REGISTRY_PATH, filename), "utf-8");
  } catch {
    return fetchRemote(`${GITHUB_RAW_URL}/${filename}`);
  }
}

async function fetchRemote(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return response.text();
}

async function loadIndex(): Promise<RegistryManifestIndex> {
  if (cache.index) return cache.index;

  const content = await loadFile("manifest.json");
  const data = JSON.parse(content) as RegistryManifestIndex;
  cache.index = data;
  return data;
}

async function loadTypeItems(type: ComponentType): Promise<RegistryItem[]> {
  const cached = cache.types.get(type);
  if (cached) return cached;

  const index = await loadIndex();
  const desc = index.types[type];
  const content = await loadFile(desc.file);
  const typeManifest = JSON.parse(content) as TypeManifest;
  cache.types.set(type, typeManifest.items);
  return typeManifest.items;
}

export async function loadManifest(): Promise<RegistryManifest> {
  if (cache.assembled) return cache.assembled;

  const index = await loadIndex();

  // Fetch all type files in parallel
  const typeEntries = Object.entries(index.types) as [ComponentType, { file: string; count: number }][];
  const typeResults = await Promise.all(
    typeEntries.map(async ([type]) => loadTypeItems(type))
  );

  const items: RegistryItem[] = typeResults.flat();
  const manifest: RegistryManifest = { version: index.version, items };
  cache.assembled = manifest;
  return manifest;
}

export async function getItem(slug: string, type?: ComponentType): Promise<RegistryItem | undefined> {
  const manifest = await loadManifest();
  if (type) return manifest.items.find((item) => item.slug === slug && item.type === type);
  return manifest.items.find((item) => item.slug === slug);
}

export async function listItems(
  type?: ComponentType
): Promise<RegistryItem[]> {
  if (type) {
    return loadTypeItems(type);
  }
  const manifest = await loadManifest();
  return manifest.items;
}

export async function searchItems(query: string): Promise<RegistryItem[]> {
  const manifest = await loadManifest();
  const lowerQuery = query.toLowerCase();
  return manifest.items.filter(
    (item) =>
      item.slug.toLowerCase().includes(lowerQuery) ||
      item.name.toLowerCase().includes(lowerQuery) ||
      item.description.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Load the full item.json for an item (includes fields stripped from compiled manifests,
 * such as contents and longDescription).
 */
export async function getItemFull(item: RegistryItem): Promise<RegistryItem> {
  const typeDir = item.type + "s";
  const itemJsonPath = `${typeDir}/${item.slug}/item.json`;
  const content = await loadFile(itemJsonPath);
  return JSON.parse(content) as RegistryItem;
}

/**
 * Get the base URL for fetching item content.
 * Items have an externalUrl pointing to their GitHub directory.
 */
function getItemBaseUrl(item: RegistryItem): { local: string | null; remote: string } {
  // For external items (Anthropic repos), extract raw URL from externalUrl
  if (item.externalUrl) {
    // Convert tree URL to raw URL
    // https://github.com/anthropics/skills/tree/main/skills/pdf
    // → https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf
    const rawUrl = item.externalUrl
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/tree/", "/");
    return { local: null, remote: rawUrl };
  }

  // For local/toolr items, use the local registry path
  const typeDir = item.type + "s";
  return {
    local: join(REGISTRY_PATH, typeDir, item.slug),
    remote: `${GITHUB_RAW_URL}/${typeDir}/${item.slug}`,
  };
}

/**
 * Fetch the main content file for an item (e.g., SKILL.md).
 */
export async function getItemContent(item: RegistryItem): Promise<string> {
  const { local, remote } = getItemBaseUrl(item);

  // Determine the main file based on type
  const mainFile = item.type === "skill" ? "SKILL.md" : `${item.type}.md`;

  // Try local first (for development with toolr items)
  if (local) {
    try {
      return await readFile(join(local, mainFile), "utf-8");
    } catch {
      // Local not available — fall through to remote fetch
    }
  }

  // Fetch from remote
  return fetchRemote(`${remote}/${mainFile}`);
}

/**
 * Get the local source path for an item (for symlink mode).
 * Returns null if item is external.
 */
export function getItemSourcePath(item: RegistryItem): string | null {
  // External items (official/community) don't have local paths
  if (item.sourceType !== "toolr") {
    return null;
  }

  const typeDir = item.type + "s";
  return join(REGISTRY_PATH, typeDir, item.slug);
}

/**
 * List all files in an item's directory (for copying entire skill folders).
 */
export async function listItemFiles(item: RegistryItem): Promise<string[]> {
  const { local } = getItemBaseUrl(item);

  if (!local) {
    // For external items, we can't easily list files
    // Return common skill structure
    return ["SKILL.md"];
  }

  const files: string[] = [];

  async function walkDir(dir: string, prefix = ""): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walkDir(join(dir, entry.name), relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  await walkDir(local);
  return files;
}

export function clearCache(): void {
  cache.index = null;
  cache.types.clear();
  cache.assembled = null;
}

/**
 * Fetch an item's content from remote and write to a destination directory.
 * Used when local registry is not available (e.g., running via npx).
 */
export async function fetchItemToDestination(
  item: RegistryItem,
  destPath: string
): Promise<void> {
  const { remote } = getItemBaseUrl(item);

  // For items with a file tree (plugins, hooks, etc.), fetch the entire structure.
  // The compiled manifest strips contents from plugins to save space,
  // so load the full item.json on demand when contents is missing.
  let files = item.contents?.files;
  if (!files && item.type === "plugin") {
    const full = await getItemFull(item);
    files = full.contents?.files;
  }
  if (files) {
    await mkdir(destPath, { recursive: true });
    await fetchFileTree(files, remote, destPath);
    return;
  }

  // Determine files to fetch based on item type
  const filesToFetch =
    item.type === "skill"
      ? ["SKILL.md"]
      : item.type === "plugin"
        ? [".claude-plugin/plugin.json"]
        : [`${item.type}.md`];

  await mkdir(destPath, { recursive: true });

  await Promise.all(filesToFetch.map(async (file) => {
    const content = await fetchRemote(`${remote}/${file}`);
    const filePath = join(destPath, file);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  }));
}

/**
 * Recursively fetch files from a remote file tree to a local destination.
 */
async function fetchFileTree(
  nodes: { name: string; type: string; children?: { name: string; type: string; children?: any[] }[] }[],
  baseUrl: string,
  destPath: string
): Promise<void> {
  await Promise.all(nodes.map(async (node) => {
    const nodePath = join(destPath, node.name);

    if (node.type === "directory") {
      await mkdir(nodePath, { recursive: true });
      if (node.children) {
        await fetchFileTree(node.children, `${baseUrl}/${node.name}`, nodePath);
      }
    } else {
      const content = await fetchRemote(`${baseUrl}/${node.name}`);
      await writeFile(nodePath, content, "utf-8");
    }
  }));
}
