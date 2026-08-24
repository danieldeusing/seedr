/**
 * Adapter over the ONE item validator in @seedr/registry-ops (validate.ts).
 * The sync pipeline works with plain violation strings prefixed by the item's
 * file path; Studio and compile consume the structured ValidationError form
 * directly. Both come from the same rules — change them there, not here.
 */
import {
  KNOWN_AGENTS,
  MAX_SLUG_LENGTH,
  SLUG_PATTERN,
  findDuplicateItems,
  flattenFileTree,
  isSafeNodeName,
  structuralErrors,
  typeDirName,
  validateItem as validateStructured,
} from "@seedr/registry-ops/pure";
import type { ComponentType, FileTreeNode } from "../sync/types.js";

export { SLUG_PATTERN, MAX_SLUG_LENGTH, flattenFileTree, isSafeNodeName, findDuplicateItems };
export const CODING_AGENTS = KNOWN_AGENTS;

export interface ValidationContext {
  /** Where the item lives (or will be written); used as the prefix of every message. */
  file: string;
  /** Name of the directory holding item.json; must equal the slug. */
  slugDir?: string;
  /** Name of the type folder holding that directory; must equal `typeDirName(type)`. */
  typeDir?: string;
  /** Files found on disk next to item.json (relative paths, item.json excluded). */
  diskFiles?: readonly string[];
  /** Require provenance (`sourceRevision`/`contentDigest`/plugin `pluginSource`) on synced items. Default true. */
  requireProvenance?: boolean;
}

/**
 * Validate one item. Returns an empty array when the item is valid; otherwise every
 * structural violation found, each prefixed with `ctx.file`.
 */
export function validateItem(value: unknown, ctx: ValidationContext): string[] {
  const item = value as { type?: unknown; slug?: unknown } | null;
  const expectedType =
    ctx.typeDir !== undefined && item && typeof item.type === "string" && typeDirName(item.type as ComponentType) === ctx.typeDir
      ? (item.type as ComponentType)
      : undefined;
  const errors = structuralErrors(
    validateStructured(value, {
      expectedSlug: ctx.slugDir,
      expectedType,
      diskFiles: ctx.diskFiles,
      requireProvenance: ctx.requireProvenance,
    })
  );
  const messages = errors.map((e) => `${ctx.file}: ${e.field ? `${e.field}: ` : ""}${e.message}`);
  // typeDir mismatch is not expressible through expectedType (which must be a valid
  // ComponentType); report it directly.
  if (
    ctx.typeDir !== undefined &&
    item &&
    typeof item.type === "string" &&
    typeDirName(item.type as ComponentType) !== ctx.typeDir
  ) {
    messages.push(`${ctx.file}: type "${item.type}" belongs in folder "${typeDirName(item.type as ComponentType)}/", not "${ctx.typeDir}/"`);
  }
  return messages;
}

/** Throws an Error listing every violation when the item is invalid. */
export function assertValidItem(value: unknown, ctx: ValidationContext): void {
  const errors = validateItem(value, ctx);
  if (errors.length > 0) {
    throw new Error(`Invalid registry item:\n  ${errors.join("\n  ")}`);
  }
}

export type { FileTreeNode };
