import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { LocalSource, RegistryItem } from "@seedr/shared";
import { gitIgnored } from "./gitIgnore.js";

/**
 * A first-party item copied from a folder on this machine keeps a note of where
 * it came from, so the copy can be checked against the original later.
 *
 * Nothing about this is automatic. There is no nightly job for it and there
 * cannot usefully be one in CI: the folder is on one person's disk, and a
 * runner cannot see it. The check runs where the folder is.
 */

/** Every file under `path`, relative and sorted, minus what git ignores there. */
function sourceFiles(path: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      // Symlinks are not content, matching what the copy stores.
      if (entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(relative(path, full).split("\\").join("/"));
    }
  };
  walk(path);
  const ignored = new Set(gitIgnored(path, found));
  return found.filter((file) => !ignored.has(file)).sort();
}

/**
 * The digest of a source folder, or of a single source file under its own name.
 *
 * Same construction as `contentDigestOfDir`: `path + "\n" + sha256hex(bytes)`
 * per file, sorted, hashed once more. It is only ever compared against another
 * digest of the same source — never against the item's, because the copy drops
 * files git ignores in the *registry* and the two would not agree.
 */
export function sourceDigest(path: string): string | null {
  if (!existsSync(path)) return null;
  const isDir = statSync(path).isDirectory();
  const entries = isDir
    ? sourceFiles(path).map((file) => ({ path: file, bytes: readFileSync(join(path, file)) }))
    : [{ path: basename(path), bytes: readFileSync(path) }];
  if (entries.length === 0) return null;
  const digest = createHash("sha256");
  for (const entry of entries) {
    digest.update(entry.path);
    digest.update("\n");
    digest.update(createHash("sha256").update(entry.bytes).digest("hex"));
    digest.update("\n");
  }
  return digest.digest("hex");
}

/** A note of the folder an item was copied from, as of now. */
export const localSourceOf = (path: string): LocalSource => ({
  path,
  digest: sourceDigest(path),
  syncedAt: new Date().toISOString().slice(0, 10),
});

export type SourceState =
  /** The item records no origin: written in place, or its origin was adopted. */
  | "none"
  /** The source is where it was, and unchanged since the last copy. */
  | "current"
  /** The source is there and has changed — the item is behind it. */
  | "behind"
  /** The recorded path is not there any more. Adopt the item, or point it elsewhere. */
  | "missing";

export interface SourceStatus {
  state: SourceState;
  /** The recorded path, absent when the item records no origin. */
  path?: string;
  /** The digest recorded when the item was last copied from the source. */
  recorded?: string | null;
  /** The source's digest now; null when it is gone or has no content files. */
  current?: string | null;
}

/** Where an item stands relative to the folder it was copied from. */
export function sourceStatus(item: Pick<RegistryItem, "localSource">): SourceStatus {
  const source = item.localSource;
  if (!source) return { state: "none" };
  if (!existsSync(source.path)) return { state: "missing", path: source.path, recorded: source.digest, current: null };
  const current = sourceDigest(source.path);
  return { state: current === source.digest ? "current" : "behind", path: source.path, recorded: source.digest, current };
}
