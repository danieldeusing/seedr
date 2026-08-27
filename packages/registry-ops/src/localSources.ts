import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ComponentType } from "@seedr/shared";
import { contentDigestOfDir } from "./hash.js";
import { itemDir } from "./fsPaths.js";
import { itemKey } from "./paths.js";
import { newestMtimeMs, sourceDigest } from "./localSource.js";
import type { SourceStatus } from "./sourceState.js";

/**
 * Where a first-party item was copied from on this machine.
 *
 * Deliberately **not** in `item.json`. The path is absolute and machine-local:
 * it means nothing in another checkout, and `item.json` is committed and served
 * from the registry, so a public instance would publish someone's home directory
 * and the name of whatever client the folder sits under. This file is gitignored
 * and belongs to the one machine that actually has the folders.
 *
 * A second checkout therefore knows nothing about an item's origin, which is the
 * correct answer there rather than a path that does not exist.
 */
export const LOCAL_SOURCES_FILE = join(".seedr", "local-sources.json");
const FORMAT_VERSION = 1;

export interface LocalSourceEntry {
  /** Absolute path to the folder or file the item was copied from. */
  path: string;
  /** The source's content digest when it was last copied. */
  sourceDigest: string | null;
  /** The item's own digest at that moment, so an edit made *here* is visible too. */
  itemDigest: string | null;
  /** ISO date of that copy. */
  syncedAt: string;
  /** The newest mtime under the source then, so an untouched source is never re-hashed. */
  sourceMtimeMs?: number;
}

type Stored = Record<string, LocalSourceEntry>;

const filePath = (repoRoot: string): string => join(repoRoot, LOCAL_SOURCES_FILE);

/** Every recorded origin in this checkout, keyed `type/slug`. Absent file reads as none. */
export function readLocalSources(repoRoot: string): Stored {
  const path = filePath(repoRoot);
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${LOCAL_SOURCES_FILE} is not readable JSON: ${(error as Error).message}`, { cause: error });
  }
  const sources = (parsed as { sources?: unknown })?.sources;
  return typeof sources === "object" && sources !== null ? (sources as Stored) : {};
}

function write(repoRoot: string, sources: Stored): void {
  const path = filePath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ version: FORMAT_VERSION, sources }, null, 2) + "\n");
}

/** Record where an item was copied from, and what both sides looked like then. */
export function rememberLocalSource(repoRoot: string, registryDir: string, type: ComponentType, slug: string, path: string): void {
  const sources = readLocalSources(repoRoot);
  sources[itemKey(type, slug)] = {
    path,
    sourceDigest: sourceDigest(path),
    itemDigest: contentDigestOfDir(itemDir(registryDir, type, slug)),
    syncedAt: new Date().toISOString().slice(0, 10),
    sourceMtimeMs: newestMtimeMs(path),
  };
  write(repoRoot, sources);
}

/** Stop tracking an item's origin. */
export function forgetLocalSource(repoRoot: string, type: ComponentType, slug: string): void {
  const sources = readLocalSources(repoRoot);
  if (!(itemKey(type, slug) in sources)) return;
  delete sources[itemKey(type, slug)];
  write(repoRoot, sources);
}

export const localSourceOf = (repoRoot: string, type: ComponentType, slug: string): LocalSourceEntry | undefined =>
  readLocalSources(repoRoot)[itemKey(type, slug)];

/**
 * Where an item stands against the folder it was copied from — and against the
 * copy itself, since the registry's own files can be edited here too.
 *
 * `behind` and `edited` are different problems: one is content waiting to be
 * pulled, the other is work that pulling would overwrite. `diverged` is both at
 * once, and is the only state where something is certain to be lost either way.
 */
export function sourceStatus(repoRoot: string, registryDir: string, type: ComponentType, slug: string): SourceStatus {
  const entry = localSourceOf(repoRoot, type, slug);
  if (!entry) return { state: "none" };
  if (!existsSync(entry.path)) return { state: "missing", path: entry.path, recorded: entry.sourceDigest, current: null };

  // Hashing the source costs a `git check-ignore` — one process, and by far the
  // most expensive thing here. Nothing under it touched since the copy means
  // nothing to hash.
  const untouched = entry.sourceMtimeMs !== undefined && newestMtimeMs(entry.path) <= entry.sourceMtimeMs;
  const current = untouched ? entry.sourceDigest : sourceDigest(entry.path);
  const sourceMoved = current !== entry.sourceDigest;
  const itemMoved = contentDigestOfDir(itemDir(registryDir, type, slug)) !== entry.itemDigest;
  const state = sourceMoved ? (itemMoved ? "diverged" : "behind") : itemMoved ? "edited" : "current";
  return { state, path: entry.path, recorded: entry.sourceDigest, current };
}
