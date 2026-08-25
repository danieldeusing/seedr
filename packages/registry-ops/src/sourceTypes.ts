import type { CanonicalSourceType, LegacySourceType, SourceType } from "@seedr/shared";

/**
 * The one runtime vocabulary of source types. Everything that parses, validates
 * or branches on where an item comes from goes through here, so the staged
 * `toolr` → `seedr` rename is a change to this file and the data, not a grep
 * across the repo.
 */
export const CANONICAL_SOURCE_TYPES = ["official", "seedr", "community"] as const satisfies readonly CanonicalSourceType[];

/** Deprecated values and what they mean now. Accepted on input and in data; never written by new code. */
export const SOURCE_TYPE_ALIASES: Record<LegacySourceType, CanonicalSourceType> = { toolr: "seedr" };

/** Every value a registry item may carry: canonical plus the aliases. */
export const KNOWN_SOURCE_TYPES = [...CANONICAL_SOURCE_TYPES, ...(Object.keys(SOURCE_TYPE_ALIASES) as LegacySourceType[])] as const;

/** Display names, kept beside the values so every surface prints the same one. */
export const SOURCE_TYPE_LABELS: Record<CanonicalSourceType, string> = {
  official: "Official",
  seedr: "Seedr",
  community: "Community",
};

export function isCanonicalSourceType(value: unknown): value is CanonicalSourceType {
  return typeof value === "string" && (CANONICAL_SOURCE_TYPES as readonly string[]).includes(value);
}

export function isLegacySourceType(value: unknown): value is LegacySourceType {
  return typeof value === "string" && Object.hasOwn(SOURCE_TYPE_ALIASES, value);
}

/**
 * B1: what registry DATA may carry today. The published CLI (0.1.87) reads
 * `main` live and branches on `sourceType === "toolr"` to decide whether an
 * item's content comes from the registry itself or from a pinned upstream, so
 * every writer stores `toolr`, never `seedr`, until a CLI that understands both
 * has shipped. B2 is one flip: run scripts/migrate-source-types.ts and empty
 * this table.
 */
export const STORAGE_SOURCE_TYPES: Partial<Record<CanonicalSourceType, LegacySourceType>> = { seedr: "toolr" };

/** The value data may store during B1 for a canonical source type. */
export function storageSourceType(value: CanonicalSourceType): SourceType {
  return STORAGE_SOURCE_TYPES[value] ?? value;
}

/** The canonical source type for any known value (alias resolved), or null for an unknown one. */
export function canonicalSourceType(value: unknown): CanonicalSourceType | null {
  if (isCanonicalSourceType(value)) return value;
  if (isLegacySourceType(value)) return SOURCE_TYPE_ALIASES[value];
  return null;
}

/** Is this item this registry's own content? True for `seedr` under either name. */
export function isFirstParty(sourceType: unknown): boolean {
  return canonicalSourceType(sourceType) === "seedr";
}
