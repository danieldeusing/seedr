import type { ComponentType } from "@seedr/shared";

/**
 * Pure path vocabulary — no filesystem, no `node:path` — so the webview can
 * share it through `@seedr/registry-ops/pure`. The on-disk builders live in
 * fsPaths.ts.
 */

/** Every component type, in the order the manifests list them. */
export const ALL_TYPES = ["skill", "plugin", "hook", "agent", "mcp", "settings", "command"] as const satisfies readonly ComponentType[];

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

/** The (type, slug) primary key as one string, for sets and maps. Never key by slug alone. */
export function itemKey(type: ComponentType, slug: string): string {
  return `${type}/${slug}`;
}

export function assertSlug(slug: string): void {
  if (!isValidSlug(slug)) {
    throw new Error(`Invalid slug ${JSON.stringify(slug)}: expected lowercase letters, digits or "-", starting with a letter or digit, at most ${MAX_SLUG_LENGTH} characters`);
  }
}
