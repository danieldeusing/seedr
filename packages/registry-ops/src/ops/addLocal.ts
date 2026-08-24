import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, rmdirSync, rmSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { FileTreeNode, RegistryItem } from "@seedr/shared";
import { canonicalAgent, storageAgents } from "../agents.js";
import { itemDir, itemJsonPath } from "../fsPaths.js";
import { fileTree, itemExists } from "../read.js";
import { assertStructurallyValid, formatErrors, validateItem } from "../validate.js";
import type { AddLocalOp, OpResult } from "./types.js";

export const today = (): string => new Date().toISOString().slice(0, 10);

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
function removeIgnoredFiles(dir: string): void {
  const files = flattenTree(fileTree(dir));
  if (files.length === 0) return;
  const check = spawnSync("git", ["-C", dir, "check-ignore", "--stdin", "-z"], { input: files.join("\0"), encoding: "utf8" });
  // 0 = some ignored, 1 = none ignored; anything else (128: not a repository) means no answer.
  if (check.error || check.status === null || check.status > 1) return;
  for (const ignored of check.stdout.split("\0").filter(Boolean)) {
    rmSync(join(dir, ignored), { force: true });
  }
  pruneEmptyDirs(dir);
}

/**
 * Copy a tree following symlinks (Node's `cpSync` dereferences only the top
 * level): what lands in the registry is always real bytes, because a committed
 * link would carry a machine-local path into every other checkout. A cycle is
 * refused by tracking real paths already on the walk.
 */
function copyDereferenced(src: string, dest: string, walked: Set<string> = new Set()): void {
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

/**
 * Copy a local source tree into the registry as a first-party (`toolr`) item.
 * The item is validated in full — including the description gate — before a
 * single byte is written, so a rejected operation leaves no trace.
 */
export function addLocal(registryDir: string, op: AddLocalOp): OpResult {
  if (itemExists(registryDir, op.type, op.slug)) {
    throw new Error(`A ${op.type} item "${op.slug}" already exists — use update, or remove it first`);
  }
  if (!existsSync(op.sourcePath)) throw new Error(`Source path does not exist: ${op.sourcePath}`);
  const sourceIsDir = statSync(op.sourcePath).isDirectory();

  const dir = itemDir(registryDir, op.type, op.slug);
  // Prepare the item first with a provisional file tree, so every validation
  // failure happens before the copy.
  // Unknown ids are refused by name; aliases and duplicates normalise to the
  // B1 storage vocabulary (STORAGE_ALIASES), which is what gets validated and written.
  const unknown = op.compatibility.filter((agent) => canonicalAgent(agent) === null);
  if (unknown.length > 0) {
    throw new Error(`Item would be invalid: compatibility: unknown coding agent(s) ${unknown.join(", ")}`);
  }
  const provisional: RegistryItem = {
    slug: op.slug,
    name: op.name,
    type: op.type,
    description: op.description,
    longDescription: op.longDescription,
    compatibility: storageAgents(op.compatibility),
    sourceType: "toolr",
    author: op.author,
    ...(op.externalUrl ? { externalUrl: op.externalUrl } : {}),
    ...(op.targetScope ? { targetScope: op.targetScope } : {}),
    updatedAt: today(),
    contents: { files: [] },
  };
  const errors = validateItem(provisional);
  if (errors.length > 0) throw new Error(`Item would be invalid: ${formatErrors(errors)}`);

  mkdirSync(dir, { recursive: true });
  if (sourceIsDir) copyDereferenced(op.sourcePath, dir);
  else copyDereferenced(op.sourcePath, join(dir, basename(op.sourcePath)));
  removeIgnoredFiles(dir);

  const item: RegistryItem = {
    ...provisional,
    contents: { files: fileTree(dir), ...(op.triggers?.length ? { triggers: op.triggers } : {}) },
  };
  assertStructurallyValid(item, { expectedType: op.type, expectedSlug: op.slug });
  writeFileSync(itemJsonPath(registryDir, op.type, op.slug), JSON.stringify(item, null, 2) + "\n");
  return { kind: op.kind, type: op.type, slug: op.slug, item };
}
