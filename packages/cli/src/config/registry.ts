import { readFile, readdir, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { typeDirName } from "@seedr/registry-ops/pure";
export { typeDirName };
import type {
  RegistryManifest,
  RegistryManifestIndex,
  RegistryItem,
  ComponentType,
  TypeManifest,
} from "../types.js";
import type { FileTreeNode, LicenseInfo } from "@seedr/shared";
import { assertValidSlug } from "../utils/slug.js";
import { canonicalFileSet, computeContentDigest, flattenFileTree } from "../utils/digest.js";
import { moveDirectory, removePathEntry } from "../utils/fs.js";
import { resolveItemSource } from "./source.js";

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
// A fork or self-hosted registry overrides it with SEEDR_REGISTRY_DIR.
const REGISTRY_PATH = process.env.SEEDR_REGISTRY_DIR || resolveLocalRegistryPath();

/**
 * The registry's own files — the manifest index, the per-type manifests and
 * each item's `item.json` — are served from the seedr repository's `main`
 * branch. They are the trust root of every install and therefore the one
 * thing that stays mutable: the CLI trusts whatever the registry says an item
 * is, and then pins and verifies the *content* it downloads from third-party
 * hosts (`sourceRevision` + `contentDigest`, see docs/registry-integrity.md).
 * First-party (`toolr`) content is fetched from this same URL.
 */
const DEFAULT_REGISTRY_URL = "https://raw.githubusercontent.com/danieldeusing/seedr/main/registry";

// A fork or self-hosted registry points the published CLI elsewhere with
// SEEDR_REGISTRY_URL instead of a code change (see docs/self-hosting.md).
const REGISTRY_URL = (process.env.SEEDR_REGISTRY_URL || DEFAULT_REGISTRY_URL).replace(/\/+$/, "");

// First-party licenses at the registry repository root: the registry URL minus
// its conventional trailing /registry segment.
const REGISTRY_ROOT_URL = REGISTRY_URL.replace(/\/registry$/, "");

/**
 * Reject file-tree node names that could escape the destination directory.
 */
function assertSafeNodeName(name: string): void {
  if (name === "" || name === "." || name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`Unsafe file name in registry content: ${JSON.stringify(name)}`);
  }
}

const cache = {
  index: null as RegistryManifestIndex | null,
  types: new Map<ComponentType, RegistryItem[]>(),
  assembled: null as RegistryManifest | null,
};


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
  return fetchRemote(`${REGISTRY_URL}/${filename}`);
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

  const content = await fetchRemote(`${REGISTRY_URL}/manifest.json`);
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
 *
 * This is registry metadata, so it comes from the registry trust root (the
 * local checkout or the seedr repository's `main` branch) and not from the
 * item's pinned upstream source — the upstream repository does not contain
 * it. The content it describes is still fetched at the pinned revision and
 * verified against `contentDigest`.
 */
export async function getItemFull(item: RegistryItem): Promise<RegistryItem> {
  assertValidSlug(item.slug);
  const typeDir = typeDirName(item.type);
  const itemJsonPath = `${typeDir}/${item.slug}/item.json`;
  const content = await loadFile(itemJsonPath);
  return JSON.parse(content) as RegistryItem;
}

interface ItemLocation {
  /** Local registry directory (development checkout only). */
  local: string | null;
  /** Raw URL of the item's directory. */
  remote: string;
  /** Raw URL of the source repository root at the same revision. */
  rootUrl: string;
  /** Pinned commit, or null for first-party / legacy items. */
  revision: string | null;
}

/**
 * Where an item's content lives. First-party (`toolr`) items come from the
 * registry itself; everything else resolves to its pinned upstream commit
 * (see `resolveItemSource`).
 */
function getItemBaseUrl(item: RegistryItem): ItemLocation {
  if (item.sourceType === "toolr") {
    assertValidSlug(item.slug);
    const typeDir = typeDirName(item.type);
    return {
      local: REGISTRY_PATH ? join(REGISTRY_PATH, typeDir, item.slug) : null,
      remote: `${REGISTRY_URL}/${typeDir}/${item.slug}`,
      rootUrl: REGISTRY_ROOT_URL,
      revision: null,
    };
  }

  const source = resolveItemSource(item);
  return { local: null, remote: source.baseUrl, rootUrl: source.rootUrl, revision: source.revision };
}

/** The main content file of a single-file item type (e.g. `SKILL.md`, `mcp.md`). */
export function mainFileName(type: ComponentType): string {
  return type === "skill" ? "SKILL.md" : `${type}.md`;
}

/**
 * Fetch the main content file for an item (e.g., SKILL.md).
 *
 * A local checkout is read directly. Remote content goes through
 * `fetchItemToDestination` into a temporary directory so it is subject to the
 * same pinning and digest verification as a full install.
 */
export async function getItemContent(item: RegistryItem): Promise<string> {
  const { local } = getItemBaseUrl(item);
  const mainFile = mainFileName(item.type);

  if (local) {
    try {
      return await readFile(join(local, mainFile), "utf-8");
    } catch {
      // Local not available — fall through to remote fetch
    }
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "seedr-content-"));
  try {
    const destination = join(tempRoot, "item");
    await fetchItemToDestination(item, destination);
    return await readFile(join(destination, mainFile), "utf-8");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Read one file of an item as text, for informational output only (e.g. the
 * `plan()` of a dry run). The read is NOT digest-verified — never use it to
 * install content; `fetchItemToDestination` is the verified path.
 */
export async function fetchItemFile(item: RegistryItem, relativePath: string): Promise<string> {
  const segments = relativePath.split("/");
  for (const segment of segments) assertSafeNodeName(segment);
  const { local, remote } = getItemBaseUrl(item);
  if (local) {
    try {
      return await readFile(join(local, ...segments), "utf-8");
    } catch {
      // Local not available — fall through to remote fetch
    }
  }
  return fetchRemote(`${remote}/${relativePath}`);
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

// ---------------------------------------------------------------------------
// Verified content download
// ---------------------------------------------------------------------------

export interface FetchedItemContent {
  /** Commit the content was fetched at; `null` for first-party and legacy items. */
  sourceRevision: string | null;
  /** The digest the content was verified against; `null` when the item carried none. */
  contentDigest: string | null;
  /** Relative paths written into the destination. */
  files: string[];
}

function integrityError(item: RegistryItem, detail: string): Error {
  return new Error(`Registry integrity error: ${item.type} "${item.slug}" — ${detail}`);
}

interface ItemFileSet {
  /** Every path to download, in tree order. */
  paths: string[];
  /** Expected digest, or null when the registry recorded none. */
  digest: string | null;
  /** `license.installAs` when it has to be materialised from `license.file`. */
  licenseExtra: { installAs: string; file: string } | null;
}

function legacyFileList(item: RegistryItem): string[] {
  if (item.type === "skill") return ["SKILL.md"];
  if (item.type === "plugin") return [".claude-plugin/plugin.json"];
  return [mainFileName(item.type)];
}

/**
 * Work out the canonical file set (§2) and the expected digest. Compiled
 * manifests strip `contents` from plugins, so the full item.json is loaded on
 * demand; when both the manifest entry and item.json carry a digest they must
 * agree.
 */
async function resolveFileSet(item: RegistryItem): Promise<ItemFileSet> {
  let files: FileTreeNode[] | undefined = item.contents?.files;
  let license: LicenseInfo | undefined = item.license;
  let digest: string | null = item.contentDigest ?? null;

  if (!files && item.type === "plugin") {
    const full = await getItemFull(item);
    files = full.contents?.files;
    license ??= full.license;
    if (full.contentDigest) {
      if (digest !== null && full.contentDigest !== digest) {
        throw integrityError(item, `manifest digest ${digest} disagrees with item.json digest ${full.contentDigest}`);
      }
      digest = full.contentDigest;
    }
  }

  if (!files) {
    return { paths: legacyFileList(item), digest, licenseExtra: null };
  }

  const treePaths = flattenFileTree(files);
  const paths = canonicalFileSet(files, license);
  let licenseExtra: ItemFileSet["licenseExtra"] = null;
  if (license?.installAs && !treePaths.includes(license.installAs)) {
    if (!license.file) {
      throw integrityError(item, `license.installAs "${license.installAs}" is set without license.file`);
    }
    licenseExtra = { installAs: license.installAs, file: license.file };
  }
  return { paths, digest, licenseExtra };
}

async function downloadFileSet(
  location: ItemLocation,
  fileSet: ItemFileSet,
  stagingDir: string
): Promise<void> {
  await Promise.all(fileSet.paths.map(async (relativePath) => {
    const segments = relativePath.split("/");
    for (const segment of segments) assertSafeNodeName(segment);

    const url =
      fileSet.licenseExtra && relativePath === fileSet.licenseExtra.installAs
        ? `${location.rootUrl}/${fileSet.licenseExtra.file}`
        : `${location.remote}/${relativePath}`;

    const content = await fetchRemoteBuffer(url);
    const filePath = join(stagingDir, ...segments);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }));
}

/**
 * Download an item's complete file set into `destPath`, verifying it first.
 *
 * The files are fetched from the item's pinned revision into a temporary
 * directory created with `mkdtemp` next to the destination. The content
 * digest is recomputed there and compared with the registry's
 * `contentDigest`; on a mismatch — or when a non-first-party item carries no
 * digest at all — nothing is installed and the temporary directory is
 * removed. Only a verified tree is moved into place (an existing entry at
 * `destPath` is replaced; the caller must have proven that path is contained).
 *
 * First-party (`toolr`) items are verified whenever they carry a digest;
 * those compiled before digests existed are installed unverified from the
 * registry trust root.
 */
export async function fetchItemToDestination(
  item: RegistryItem,
  destPath: string
): Promise<FetchedItemContent> {
  const location = getItemBaseUrl(item);
  const fileSet = await resolveFileSet(item);

  if (fileSet.digest === null && item.sourceType !== "toolr") {
    throw integrityError(item, "the registry entry carries no contentDigest; refusing to install unverifiable content");
  }

  await mkdir(dirname(destPath), { recursive: true });
  const stagingDir = await mkdtemp(join(dirname(destPath), ".seedr-staging-"));
  try {
    await downloadFileSet(location, fileSet, stagingDir);

    if (fileSet.digest !== null) {
      const actual = await computeContentDigest(stagingDir, fileSet.paths);
      if (actual !== fileSet.digest) {
        throw integrityError(item, `content digest mismatch (expected ${fileSet.digest}, actual ${actual})`);
      }
    }

    await removePathEntry(destPath);
    await moveDirectory(stagingDir, destPath);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }

  return { sourceRevision: location.revision, contentDigest: fileSet.digest, files: fileSet.paths };
}
