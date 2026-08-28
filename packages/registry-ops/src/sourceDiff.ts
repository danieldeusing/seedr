import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { ComponentType } from "@seedr/shared";
import { itemDir } from "./fsPaths.js";
import { contentFilePaths } from "./hash.js";
import { localSourceOf } from "./localSources.js";
import { sourceFilePaths } from "./localSource.js";

/**
 * A unified diff showing what re-copying the source would do to this item.
 *
 * THE SOURCE IS THE NEW SIDE, and that is the whole point of the direction.
 * The folder is what this item is copied FROM, so a change made there is a
 * change waiting to be made here — it reads green, as something to apply, and
 * the stale copy it replaces reads red. Run the other way round the same edit
 * appears as a red deletion of the newer text, which says the opposite of what
 * is about to happen. The one button next to this diff copies source over
 * registry; this shows that operation and not its inverse.
 *
 * `git diff --no-index` does the work: it diffs two arbitrary paths, git is
 * already required, and the output is the format everything else already knows
 * how to colour. Written per file rather than per tree so `item.json` — metadata
 * the source never had — stays out of it, and so a file on one side only shows
 * as a whole-file add or delete rather than an error.
 *
 * Runs where the folders are, like every other question about them: the source
 * is outside the checkout, which the app's own filesystem bridge will not read.
 */
export function sourceDiff(repoRoot: string, registryDir: string, type: ComponentType, slug: string): string {
  const entry = localSourceOf(repoRoot, type, slug);
  if (!entry) throw new Error(`${type}/${slug} records no source to compare against`);
  if (!existsSync(entry.path)) throw new Error(`Source path does not exist: ${entry.path}`);

  const dir = itemDir(registryDir, type, slug);
  const sourceIsFile = !statSync(entry.path).isDirectory();
  // A single-file source lives in the item under its own name; a folder's files
  // keep their relative paths.
  const paths = sourceIsFile
    ? [basename(entry.path)]
    : [...new Set([...sourceFilePaths(entry.path), ...contentFilePaths(dir)])].sort();

  const NOTHING = "/dev/null";
  const chunks: string[] = [];
  for (const relative of paths) {
    const sourceFile = sourceIsFile ? entry.path : join(entry.path, relative);
    const registryFile = join(dir, relative);
    // Registry first, source second: git's second path is the "new" one.
    const diff = spawnSync(
      "git",
      ["diff", "--no-index", "--src-prefix=registry/", "--dst-prefix=source/", "--", existsSync(registryFile) ? registryFile : NOTHING, existsSync(sourceFile) ? sourceFile : NOTHING],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
    );
    // 0 = identical, 1 = differs. Anything else is git failing to answer, and
    // its own words are more use here than a sentence of ours.
    if (diff.status === 0) continue;
    if (diff.status !== 1) throw new Error(`git diff ${relative}: ${diff.stderr.trim() || `exit ${String(diff.status)}`}`);
    chunks.push(named(diff.stdout.trimEnd(), relative));
  }
  return chunks.join("\n");
}

/**
 * The header lines carry two absolute paths from different trees, which is a
 * line and a half of noise before the first change. They say which file and
 * which side instead.
 */
function named(diff: string, relative: string): string {
  return diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("diff --git ")) return `diff --git ${relative}`;
      if (line.startsWith("--- ")) return line.includes("/dev/null") ? line : `--- registry/${relative}`;
      if (line.startsWith("+++ ")) return line.includes("/dev/null") ? line : `+++ source/${relative}`;
      return line;
    })
    .join("\n");
}
