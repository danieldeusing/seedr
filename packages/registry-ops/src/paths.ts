import type { ComponentType } from "@seedr/shared";

/**
 * Pure path vocabulary — no filesystem, no `node:path` — so the webview can
 * share it through `@seedr/registry-ops/pure`. The on-disk builders live in
 * fsPaths.ts.
 */

/**
 * Where a checkout keeps its registry, unless `seedr.config.json` moves it.
 *
 * A fork moves it. Upstream owns `registry/`, and a fork that deletes items
 * from it to make room for its own turns every later `git merge upstream/main`
 * into one "deleted in HEAD and modified in upstream" conflict per item —
 * measured at 108 of them on a fork that had done exactly that. Items kept in a
 * directory upstream does not have are simply invisible to the merge, so the
 * tooling can be updated forever without touching them.
 */
export const DEFAULT_REGISTRY_DIR = "registry";

/** The registry directory a parsed `seedr.config.json` names, or the default. */
export function registryDirName(config: unknown): string {
  if (typeof config !== "object" || config === null) return DEFAULT_REGISTRY_DIR;
  const value = (config as { registryDir?: unknown }).registryDir;
  if (value === undefined) return DEFAULT_REGISTRY_DIR;
  // Joined onto the repo root, so this is the traversal guard as well as a
  // naming rule. The `registry` prefix is required so that one glob —
  // `registry*/**` in turbo.json — covers every fork's directory: Turbo cannot
  // read this file, and a build cache that misses a registry edit is a stale
  // page that looks correct.
  if (typeof value !== "string" || !/^registry[a-z0-9._-]*$/i.test(value)) {
    throw new Error(`seedr.config.json: registryDir must be a single directory name starting with "registry", not ${JSON.stringify(value)}`);
  }
  return value;
}

/** Every component type, in the order the manifests list them. */
export const ALL_TYPES = ["skill", "plugin", "hook", "agent", "mcp", "settings", "command", "rule"] as const satisfies readonly ComponentType[];

const KNOWN_TYPES = new Set<string>(ALL_TYPES);

/**
 * A slug is a single canonical path segment: lowercase letters, digits and
 * hyphens, starting alphanumeric, at most MAX_SLUG_LENGTH characters. Slugs
 * become directory names, so this is the traversal guard as much as a style
 * rule; dots and underscores are deliberately not allowed (every published
 * item conforms, and the CLI enforces the same pattern on removal names).
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const MAX_SLUG_LENGTH = 100;

export function isComponentType(value: unknown): value is ComponentType {
  return typeof value === "string" && KNOWN_TYPES.has(value);
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

/** Folder name for a type: plural except `mcp` and `settings`, which are used as-is. */
export function typeDirName(type: ComponentType): string {
  return type === "settings" || type === "mcp" ? type : `${type}s`;
}

/**
 * The main content file of a single-file item type. `SKILL.md` is Claude Code's
 * own spelling for skills; everything else is `<type>.md`, which is what
 * `registry/mcp/playwright/mcp.md` on disk actually is.
 */
export function mainFileName(type: ComponentType): string {
  return type === "skill" ? "SKILL.md" : `${type}.md`;
}

/** The (type, slug) primary key as one string, for sets and maps. Never key by slug alone. */
export function itemKey(type: ComponentType, slug: string): string {
  return `${type}/${slug}`;
}

export function assertSlug(slug: string): void {
  if (!isValidSlug(slug)) {
    throw new Error(`Invalid slug ${JSON.stringify(slug)}: expected lowercase letters, digits or "-", starting with a letter or digit, at most ${MAX_SLUG_LENGTH} characters`);
  }
}
