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
  stat,
  realpath,
  rename,
  cp,
  rm,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
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

// ---------------------------------------------------------------------------
// Path containment
// ---------------------------------------------------------------------------

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_SEGMENT_LENGTH = 100;

/**
 * Assert that a value read from untrusted input (a downloaded `plugin.json`,
 * registry metadata, a CLI argument) can be used as a single path segment.
 *
 * Accepted: `[A-Za-z0-9][A-Za-z0-9._-]*`, at most 100 characters, never
 * containing `..`. That excludes empty strings, `.` and `..`, separators,
 * drive colons, control characters, NUL, whitespace, leading dashes and every
 * non-ASCII or non-printable character.
 */
export function assertSafePathSegment(value: unknown, what: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${what} must be a non-empty string`);
  }
  if (value.length > MAX_SEGMENT_LENGTH) {
    throw new Error(`${what} is too long (${value.length} characters, maximum ${MAX_SEGMENT_LENGTH})`);
  }
  if (value.includes("..") || !SAFE_SEGMENT_PATTERN.test(value)) {
    throw new Error(
      `Unsafe ${what}: ${JSON.stringify(value)} (allowed: letters, digits, ".", "_" and "-"; no leading "-", no "..")`
    );
  }
}

function isStrictDescendant(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

function isSameOrDescendant(root: string, candidate: string): boolean {
  return relative(root, candidate) === "" || isStrictDescendant(root, candidate);
}

async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

/**
 * Resolve `root/segments...` and prove the result is a strict descendant of
 * `root`, lexically and physically.
 *
 * Lexically: `path.relative(root, resolved)` must be non-empty, relative and
 * free of a leading `..`. Physically: the deepest existing ancestor of the
 * target (its parent, when that exists) is `realpath`-ed and must lie inside
 * `realpath(root)`, so a symlinked directory that points outside the root is
 * refused. The target itself may be a symlink — callers that remove it must
 * `unlink` it rather than follow it.
 *
 * Every destructive filesystem operation on a path derived from registry
 * metadata or downloaded content must go through this function first.
 */
export async function resolveContained(root: string, ...segments: string[]): Promise<string> {
  const absoluteRoot = resolve(root);
  const resolved = resolve(absoluteRoot, ...segments);

  if (!isStrictDescendant(absoluteRoot, resolved)) {
    throw new Error(`Refusing path outside ${absoluteRoot}: ${resolved}`);
  }

  const realRoot = await realpathOrNull(absoluteRoot);
  if (realRoot === null) {
    // The root does not exist yet, so there is no existing directory to escape through.
    return resolved;
  }

  let ancestor = dirname(resolved);
  for (;;) {
    const realAncestor = await realpathOrNull(ancestor);
    if (realAncestor !== null) {
      if (!isSameOrDescendant(realRoot, realAncestor)) {
        throw new Error(
          `Refusing path outside ${absoluteRoot}: ${ancestor} resolves to ${realAncestor}`
        );
      }
      return resolved;
    }
    const parent = dirname(ancestor);
    if (parent === ancestor || relative(absoluteRoot, ancestor) === "") {
      return resolved;
    }
    ancestor = parent;
  }
}

/**
 * Assert that an existing directory physically lives inside `scopeRoot`
 * (both sides `realpath`-ed). Used for managed directories such as
 * `.claude/hooks` that must not be a symlink escaping the project or home.
 */
export async function assertDirectoryWithin(dir: string, scopeRoot: string, what: string): Promise<void> {
  const realRoot = await realpathOrNull(resolve(scopeRoot));
  const realDir = await realpathOrNull(resolve(dir));
  if (realRoot === null || realDir === null) {
    throw new Error(`${what} ${dir} could not be resolved`);
  }
  if (!isSameOrDescendant(realRoot, realDir)) {
    throw new Error(`${what} ${dir} resolves to ${realDir}, outside ${scopeRoot}`);
  }
}

// ---------------------------------------------------------------------------
// Destructive primitives that never follow symlinks
// ---------------------------------------------------------------------------

/**
 * Remove whatever directory entry sits at `path`: a symlink is unlinked (its
 * target is never touched), a directory is removed recursively, a file is
 * unlinked. A missing path is not an error. Returns whether anything existed.
 */
export async function removePathEntry(path: string): Promise<boolean> {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (stats.isDirectory()) {
    await rm(path, { recursive: true, force: true });
  } else {
    await unlink(path);
  }
  return true;
}

/**
 * Move a directory, preferring an atomic `rename` and falling back to a
 * recursive copy when source and destination live on different devices.
 */
export async function moveDirectory(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  try {
    await rename(source, destination);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await cp(source, destination, { recursive: true });
    await rm(source, { recursive: true, force: true });
  }
}

/**
 * Write a file by writing `<name>.<random>.tmp` next to it and renaming over
 * the destination. `rename` replaces the directory entry, so an existing
 * symlink at `path` is replaced rather than followed. The temporary file is
 * removed when anything fails.
 */
export async function writeFileAtomic(
  path: string,
  data: string | Buffer,
  options: { mode?: number } = {}
): Promise<void> {
  const tempPath = join(dirname(path), `${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(tempPath, data, options.mode === undefined ? {} : { mode: options.mode });
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export interface FileSnapshot {
  /** `null` when the file did not exist. */
  content: Buffer | null;
  mode?: number;
}

/** Capture a file's bytes and mode so a failed multi-step install can restore it. */
export async function snapshotFile(path: string): Promise<FileSnapshot> {
  try {
    const [content, stats] = await Promise.all([readFile(path), stat(path)]);
    return { content, mode: stats.mode & 0o777 };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { content: null };
    throw error;
  }
}

/** Put a file back exactly as `snapshotFile` saw it, removing it when it did not exist. */
export async function restoreFile(path: string, snapshot: FileSnapshot): Promise<void> {
  if (snapshot.content === null) {
    await removePathEntry(path);
    return;
  }
  await writeFileAtomic(path, snapshot.content, { mode: snapshot.mode });
}

// ---------------------------------------------------------------------------
// Install helpers
// ---------------------------------------------------------------------------

export async function installFile(
  source: string,
  destination: string,
  method: InstallMethod
): Promise<void> {
  await ensureDir(dirname(destination));
  await removePathEntry(destination);

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
 * Install a directory (symlink or copy). An existing entry at `destination`
 * is removed first without following symlinks; callers must have proven the
 * destination with `resolveContained`.
 */
export async function installDirectory(
  source: string,
  destination: string,
  method: InstallMethod
): Promise<void> {
  await ensureDir(dirname(destination));
  await removePathEntry(destination);

  if (method === "symlink") {
    // Create relative symlink for portability
    const relPath = relative(dirname(destination), source);
    await symlink(relPath, destination);
  } else {
    await copyDirectory(source, destination);
  }
}
