import { copyFileSync, mkdirSync, readdirSync, realpathSync, rmdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FileTreeNode } from "@seedr/shared";
import { gitIgnored } from "../gitIgnore.js";
import { fileTree } from "../read.js";

/* Copying a source tree into the registry, shared by `add-local` and the
   resync that copies from the same source again. Both must land the same file
   set, or an item would change merely by being refreshed. */

const flattenTree = (nodes: FileTreeNode[], prefix = ""): string[] =>
  nodes.flatMap((node) =>
    node.type === "directory" ? flattenTree(node.children ?? [], `${prefix}${node.name}/`) : [`${prefix}${node.name}`]
  );

/**
 * Drop copied files that git ignores (editor droppings, build output): they
 * would enter the file tree and the content hash but never a commit, so a
 * remote install of the item would 404 on them. Outside a git checkout —
 * registry fixtures in tests — there is nothing to consult, so keep everything.
 */
export function removeIgnoredFiles(dir: string): void {
  const files = flattenTree(fileTree(dir));
  for (const ignored of gitIgnored(dir, files)) rmSync(join(dir, ignored), { force: true });
  pruneEmptyDirs(dir);
}

/**
 * Copy a tree following symlinks (Node's `cpSync` dereferences only the top
 * level): what lands in the registry is always real bytes, because a committed
 * link would carry a machine-local path into every other checkout. A cycle is
 * refused by tracking real paths already on the walk.
 */
export function copyDereferenced(src: string, dest: string, walked: Set<string> = new Set()): void {
  const real = realpathSync(src);
  if (walked.has(real)) throw new Error(`Source links back into itself: ${src}`);
  if (statSync(src).isDirectory()) {
    mkdirSync(dest, { recursive: true });
    const nested = new Set(walked).add(real);
    for (const entry of readdirSync(src)) copyDereferenced(join(src, entry), join(dest, entry), nested);
  } else {
    copyFileSync(src, dest);
  }
}

function pruneEmptyDirs(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    pruneEmptyDirs(child);
    if (readdirSync(child).length === 0) rmdirSync(child);
  }
}
