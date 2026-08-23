import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileTreeNode, LicenseInfo } from "@seedr/shared";

/**
 * Content digest, §2 of docs/registry-integrity.md.
 *
 * Paths are sorted with plain code-unit comparison, each contributes
 * `path + "\n" + hex(sha256(bytes)) + "\n"` to a buffer, and the digest is
 * `hex(sha256(buffer))`. Binary files are hashed as bytes; line endings are
 * never normalised. The sync and the compiler implement the same algorithm
 * independently and are tested against the same conformance vector.
 */

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Digest over already-hashed entries: `{ path, sha256 }`. */
export function digestFromFileHashes(entries: ReadonlyArray<{ path: string; sha256: string }>): string {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let buffer = "";
  for (const entry of sorted) {
    buffer += `${entry.path}\n${entry.sha256}\n`;
  }
  return sha256Hex(buffer);
}

/**
 * Compute the digest of the files `relativePaths` (forward-slash separated,
 * relative to `root`) as they exist on disk.
 */
export async function computeContentDigest(root: string, relativePaths: readonly string[]): Promise<string> {
  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => ({
      path: relativePath,
      sha256: sha256Hex(await readFile(join(root, ...relativePath.split("/")))),
    }))
  );
  return digestFromFileHashes(entries);
}

/**
 * Walk a `contents.files` tree depth-first and return every file path, node
 * names joined with `/`. Directories contribute nothing themselves.
 */
export function flattenFileTree(nodes: readonly FileTreeNode[], prefix = ""): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "directory") {
      if (node.children) paths.push(...flattenFileTree(node.children, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/**
 * The canonical file set of an item: the flattened tree plus
 * `license.installAs` when set and not already part of the tree.
 */
export function canonicalFileSet(files: readonly FileTreeNode[], license?: LicenseInfo): string[] {
  const paths = flattenFileTree(files);
  if (license?.installAs && !paths.includes(license.installAs)) {
    paths.push(license.installAs);
  }
  return paths;
}
