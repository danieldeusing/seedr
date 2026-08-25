import type { LabelColor, LabelDefinition } from "@seedr/shared";
import { isValidSlug } from "./paths.js";

/**
 * The label catalogue's vocabulary and parser. One registry serves several
 * projects, so an item may carry one label ("project x", "general"); the
 * display name and colour live once in `registry/labels.json` and items
 * reference an entry by slug.
 *
 * Pure on purpose — the webview reads the catalogue through
 * `@seedr/registry-ops/pure`, where `node:fs` does not exist. The disk read is
 * `readLabels` in read.ts.
 */

/** The only version of the catalogue file this code reads or writes. */
export const LABELS_VERSION = 1;

/** Badge accents a label may wear; identical to the web app's `BadgeColor`. */
export const LABEL_COLORS = [
  "neutral",
  "green",
  "red",
  "blue",
  "orange",
  "purple",
  "amber",
  "emerald",
  "indigo",
  "teal",
  "violet",
  "pink",
] as const satisfies readonly LabelColor[];

const LABEL_FIELDS = ["slug", "name", "color"] as const;

/** A label slug follows the item slug rule: it is a URL segment and a filter key. */
export function isLabelSlug(value: unknown): value is string {
  return isValidSlug(value);
}

function fail(message: string): never {
  throw new Error(`Invalid label catalogue: ${message}`);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseLabel(value: unknown, index: number): LabelDefinition {
  const where = `labels[${index}]`;
  if (!isObject(value)) fail(`${where} must be an object`);
  for (const key of Object.keys(value)) {
    if (!(LABEL_FIELDS as readonly string[]).includes(key)) fail(`${where} has an unknown field "${key}"`);
  }
  if (!isLabelSlug(value.slug)) fail(`${where}.slug ${JSON.stringify(value.slug)} is not a valid slug`);
  if (typeof value.name !== "string" || value.name.trim() === "") fail(`${where}.name must be a non-empty string`);
  if (!(LABEL_COLORS as readonly unknown[]).includes(value.color)) {
    fail(`${where}.color ${JSON.stringify(value.color)} must be one of ${LABEL_COLORS.join(", ")}`);
  }
  return { slug: value.slug, name: value.name, color: value.color as LabelColor };
}

/**
 * The catalogue file's contents as definitions. Strict: a catalogue that cannot
 * be read is an error, never a silently empty list — an item's label would
 * otherwise look undefined and the ops would refuse perfectly good items.
 */
export function parseLabels(raw: unknown): LabelDefinition[] {
  if (!isObject(raw)) fail("must be a JSON object");
  if (raw.version !== LABELS_VERSION) fail(`unsupported version ${JSON.stringify(raw.version)} (expected ${LABELS_VERSION})`);
  if (!Array.isArray(raw.labels)) fail('"labels" must be an array');
  const labels = raw.labels.map(parseLabel);
  const seen = new Set<string>();
  for (const label of labels) {
    if (seen.has(label.slug)) fail(`duplicate label slug "${label.slug}"`);
    seen.add(label.slug);
  }
  return labels;
}
