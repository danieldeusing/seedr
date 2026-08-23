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
 * A slug is a single path segment: lowercase, starts alphanumeric, no separators.
 * Slugs become directory names, so this is the traversal guard as much as a style rule.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function isComponentType(value: unknown): value is ComponentType {
  return typeof value === "string" && KNOWN_TYPES.has(value);
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
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
    throw new Error(`Invalid slug "${slug}": expected lowercase letters, digits, ".", "_" or "-", starting with a letter or digit`);
  }
}
