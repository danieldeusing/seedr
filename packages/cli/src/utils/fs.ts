import {
  access,
  mkdir,
  symlink,
  copyFile,
  readFile,
  writeFile,
  unlink,
  readlink,
  lstat,
  cp,
  rm,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, isAbsolute } from "node:path";
import type { InstallMethod, InstallScope } from "../types.js";

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Refuse to overwrite an existing destination unless forced.
 * Throws a clear error when the path already exists and `force` is false.
 */
export async function assertOverwritable(
  path: string,
  force: boolean
): Promise<void> {
  if (!force && (await exists(path))) {
    throw new Error(`${path} already exists; pass --force to overwrite`);
  }
}

export async function isSymlink(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function getSymlinkTarget(path: string): Promise<string | null> {
  try {
    return await readlink(path);
  } catch {
    return null;
  }
}

export async function installFile(
  source: string,
  destination: string,
  method: InstallMethod
): Promise<void> {
  await ensureDir(dirname(destination));

  try { await unlink(destination); } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }

  if (method === "symlink") {
    // Create relative symlink for portability
    const relPath = relative(dirname(destination), source);
    await symlink(relPath, destination);
  } else {
    await copyFile(source, destination);
  }
}

export async function removeFile(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

export async function writeTextFile(
  path: string,
  content: string
): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, "utf-8");
}

export function resolvePath(path: string, base?: string): string {
  if (isAbsolute(path)) {
    return path;
  }
  return join(base ?? process.cwd(), path);
}

/**
 * Get the central agents path for a content type.
 * Used as the canonical location when symlinking.
 *
 * For `user` scope the central store is anchored under the home directory so
 * the symlink target stays valid regardless of the invocation directory.
 * Project/local scope anchor under cwd.
 */
export function getAgentsPath(
  contentType: string,
  slug: string,
  scope: InstallScope,
  cwd: string
): string {
  const base = scope === "user" ? homedir() : cwd;
  return join(base, ".agents", contentType + "s", slug);
}

/**
 * Copy a directory recursively.
 */
export async function copyDirectory(
  source: string,
  destination: string
): Promise<void> {
  await cp(source, destination, { recursive: true });
}

/**
 * Install a directory (symlink or copy).
 */
export async function installDirectory(
  source: string,
  destination: string,
  method: InstallMethod
): Promise<void> {
  await ensureDir(dirname(destination));

  await rm(destination, { recursive: true, force: true });

  if (method === "symlink") {
    // Create relative symlink for portability
    const relPath = relative(dirname(destination), source);
    await symlink(relPath, destination);
  } else {
    await copyDirectory(source, destination);
  }
}
