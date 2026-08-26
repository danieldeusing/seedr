import type { CanonicalSourceType } from "@seedr/shared";

/**
 * The one runtime vocabulary of source types. Everything that parses, validates
 * or branches on where an item comes from goes through here.
 */
export const CANONICAL_SOURCE_TYPES = ["official", "seedr", "community"] as const satisfies readonly CanonicalSourceType[];

/** Display names, kept beside the values so every surface prints the same one. */
export const SOURCE_TYPE_LABELS: Record<CanonicalSourceType, string> = {
  official: "Official",
  seedr: "Seedr",
  community: "Community",
};

export function isCanonicalSourceType(value: unknown): value is CanonicalSourceType {
  return typeof value === "string" && (CANONICAL_SOURCE_TYPES as readonly string[]).includes(value);
}

/** The canonical source type for a known value, or null for an unknown one. */
export function canonicalSourceType(value: unknown): CanonicalSourceType | null {
  return isCanonicalSourceType(value) ? value : null;
}

/** Is this item this registry's own content? */
export function isFirstParty(sourceType: unknown): boolean {
  return canonicalSourceType(sourceType) === "seedr";
}

