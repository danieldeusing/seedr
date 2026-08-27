import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { gitIgnored } from "./gitIgnore.js";

/**
 * Digesting a source folder, so a copy can be checked against the original later.
 * Where that record is kept, and what it is compared against, is `localSources.ts`.
 *
 * Nothing about this is automatic. There is no nightly job for it and there
 * cannot usefully be one in CI: the folder is on one person's disk, and a
 * runner cannot see it. The check runs where the folder is.
 */

/** Every file under `path`, relative and sorted, minus what git ignores there. */
export function sourceFilePaths(path: string): string[] {
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
    ? sourceFilePaths(path).map((file) => ({ path: file, bytes: readFileSync(join(path, file)) }))
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

/**
 * The newest modification time anywhere under `path`, or 0 when it is gone.
 *
 * A gate in front of `sourceDigest`, which costs a `git check-ignore` — one
 * process spawn, measured at 58 ms, against 0.18 ms for the hashing it guards.
 * Walking a hundred sources that way took six seconds; stat-ing them takes
 * milliseconds, so a source that has not been touched since it was copied is
 * never hashed at all.
 *
 * mtime is a filter, never the answer: a touched-but-unchanged file falls
 * through to the digest, which then correctly reports no change.
 */
export function newestMtimeMs(path: string): number {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      try {
        newest = Math.max(newest, statSync(full).mtimeMs);
      } catch {
        continue;
      }
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(path);
  return newest;
}
