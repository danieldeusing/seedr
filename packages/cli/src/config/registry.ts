import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
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

// Timeout for all network requests to the registry.
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Walk up from a starting directory to find this package's root — the directory
 * containing its package.json. This is reliable under both `tsx` (where source
 * lives in src/config/) and the tsup bundle (where code is flat in dist/).
 */
function findPackageRoot(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve the local registry directory relative to THIS package's root, not the
 * consumer's project root. The monorepo registry is a sibling of `packages/`, so
 * from `<repo>/packages/cli` it lives at `../../registry`. When the CLI is
 * installed from npm (only `dist/` is shipped), this path won't exist and lookups
 * fall back to the remote registry. The manifest-shape check in `loadIndex`
 * guards against trusting any unrelated `registry/manifest.json`.
 */
function resolveLocalRegistryPath(): string | null {
  const packageRoot = findPackageRoot(__dirname);
  if (!packageRoot) return null;
  return join(packageRoot, "..", "..", "registry");
}

// Local registry path (for development); null when running outside the monorepo.
const REGISTRY_PATH = resolveLocalRegistryPath();

// Remote registry URL (GitHub raw content)
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/danieldeusing/seedr/main/registry";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Validate an item slug before using it in filesystem path joins.
 */
function assertValidSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid item slug: "${slug}"`);
  }
}

/**
 * Reject file-tree node names that could escape the destination directory.
 */
function assertSafeNodeName(name: string): void {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`Unsafe file name in registry content: "${name}"`);
  }
}

const cache = {
  index: null as RegistryManifestIndex | null,
  types: new Map<ComponentType, RegistryItem[]>(),
  assembled: null as RegistryManifest | null,
};

/**
 * Map a component type to its registry folder name.
 * Most types are pluralized with a trailing "s", but `mcp` and `settings`
 * live in unsuffixed folders.
 */
function typeDirName(type: ComponentType): string {
  if (type === "mcp" || type === "settings") return type;
  return `${type}s`;
}

/**
 * A local registry manifest is only trustworthy if it has the expected shape
 * (a `types` index). A consumer project may happen to contain an unrelated
 * `registry/manifest.json`, so without this check we could misparse it.
 */
function isValidManifestIndex(value: unknown): value is RegistryManifestIndex {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RegistryManifestIndex).types === "object" &&
    (value as RegistryManifestIndex).types !== null
  );
}

async function loadFile(filename: string): Promise<string> {
  if (REGISTRY_PATH) {
    try {
      return await readFile(join(REGISTRY_PATH, filename), "utf-8");
    } catch {
      // Local not available — fall through to remote fetch
    }
  }
  return fetchRemote(`${GITHUB_RAW_URL}/${filename}`);
}

async function fetchResponse(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Registry unreachable: timed out fetching ${url}`, { cause: error });
    }
    throw new Error(`Registry unreachable: ${url}`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return response;
}

async function fetchRemote(url: string): Promise<string> {
  const response = await fetchResponse(url);
  return response.text();
}

async function fetchRemoteBuffer(url: string): Promise<Buffer> {
  const response = await fetchResponse(url);
  return Buffer.from(await response.arrayBuffer());
}

async function loadIndex(): Promise<RegistryManifestIndex> {
  if (cache.index) return cache.index;

  // Prefer the local manifest, but only trust it if it has the expected shape.
  if (REGISTRY_PATH) {
    try {
      const localContent = await readFile(join(REGISTRY_PATH, "manifest.json"), "utf-8");
      const parsed: unknown = JSON.parse(localContent);
      if (isValidManifestIndex(parsed)) {
        cache.index = parsed;
        return parsed;
      }
    } catch {
      // Local missing or unparseable — fall through to remote.
    }
  }

  const content = await fetchRemote(`${GITHUB_RAW_URL}/manifest.json`);
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
  assertValidSlug(item.slug);
  const typeDir = typeDirName(item.type);
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
  assertValidSlug(item.slug);
  const typeDir = typeDirName(item.type);
  return {
    local: REGISTRY_PATH ? join(REGISTRY_PATH, typeDir, item.slug) : null,
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

  // No local registry available (e.g. installed from npm).
  if (!REGISTRY_PATH) {
    return null;
  }

  assertValidSlug(item.slug);
  const typeDir = typeDirName(item.type);
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
    const content = await fetchRemoteBuffer(`${remote}/${file}`);
    const filePath = join(destPath, file);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }));
}

/**
 * Recursively fetch files from a remote file tree to a local destination.
 * Content is written via Buffer so binary assets (images, fonts) are not
 * corrupted by a utf-8 round-trip.
 */
async function fetchFileTree(
  nodes: { name: string; type: string; children?: { name: string; type: string; children?: any[] }[] }[],
  baseUrl: string,
  destPath: string
): Promise<void> {
  await Promise.all(nodes.map(async (node) => {
    assertSafeNodeName(node.name);
    const nodePath = join(destPath, node.name);

    if (node.type === "directory") {
      await mkdir(nodePath, { recursive: true });
      if (node.children) {
        await fetchFileTree(node.children, `${baseUrl}/${node.name}`, nodePath);
      }
    } else {
      const content = await fetchRemoteBuffer(`${baseUrl}/${node.name}`);
      await writeFile(nodePath, content);
    }
  }));
}
