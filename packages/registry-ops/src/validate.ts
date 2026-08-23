import type { ComponentType, RegistryItem } from "@seedr/shared";
import { KNOWN_AGENTS } from "./agents.js";
import { isComponentType, isValidSlug } from "./paths.js";

/**
 * The one validator. Structural errors make an item unusable and fail `compile`;
 * errors marked `gate` are the commit gate's description standard
 * (.agents/rules/registry-descriptions.md), which compile tolerates for synced
 * items but Studio and the pre-commit hook enforce.
 */
export interface ValidationError {
  field: string;
  message: string;
  gate?: true;
}

export const MIN_LONG_DESCRIPTION_WORDS = 30;

export const KNOWN_SOURCE_TYPES = ["official", "toolr", "community"] as const;
export const KNOWN_SCOPES = ["user", "project", "local"] as const;
export const KNOWN_PLUGIN_TYPES = ["package", "wrapper", "integration"] as const;

/** Every field an item.json may carry; anything else is a typo or a smuggled key. */
export const KNOWN_FIELDS = new Set([
  "slug", "name", "type", "description", "longDescription", "compatibility", "featured",
  "pluginType", "wrapper", "integration", "package", "sourceType", "targetScope",
  "contentHash", "marketplace", "author", "externalUrl", "updatedAt", "contents",
]);

export interface ValidateOptions {
  /** When given, the item's own `type`/`slug` must match the directory it lives in. */
  expectedType?: ComponentType;
  expectedSlug?: string;
}

type Item = Record<string, unknown>;
type Push = (field: string, message: string) => void;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const isHttpUrl = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const oneOf = (allowed: readonly string[], value: unknown): boolean => allowed.includes(String(value));

/** The gate's rule for longDescription, as complete problem sentences; empty when it passes. */
export function longDescriptionProblems(longDescription: unknown): string[] {
  if (typeof longDescription !== "string" || !longDescription.trim()) {
    return ["is missing 'longDescription'"];
  }
  const words = longDescription.trim().split(/\s+/).length;
  if (words < MIN_LONG_DESCRIPTION_WORDS) {
    return [`longDescription too short (${words} words, minimum ${MIN_LONG_DESCRIPTION_WORDS})`];
  }
  if (!longDescription.includes("`")) {
    return ["longDescription has no markdown formatting (use backticks for file names, commands, code identifiers)"];
  }
  return [];
}

function checkIdentity(item: Item, options: ValidateOptions, push: Push): void {
  if (!isValidSlug(item.slug)) push("slug", 'must be a lowercase path segment (letters, digits, ".", "_", "-")');
  else if (options.expectedSlug !== undefined && item.slug !== options.expectedSlug) {
    push("slug", `is "${item.slug}" but the directory is "${options.expectedSlug}"`);
  }
  if (!isComponentType(item.type)) push("type", `unknown type "${String(item.type)}"`);
  else if (options.expectedType !== undefined && item.type !== options.expectedType) {
    push("type", `is "${item.type}" but the directory is for "${options.expectedType}"`);
  }
  if (!oneOf(KNOWN_SOURCE_TYPES, item.sourceType)) push("sourceType", `unknown sourceType "${String(item.sourceType)}"`);
}

function checkText(item: Item, push: Push): void {
  if (!isNonEmptyString(item.name)) push("name", "must be a non-empty string");
  if (!isNonEmptyString(item.description)) push("description", "is missing 'description'");
}

function checkCompatibility(item: Item, push: Push): void {
  if (!Array.isArray(item.compatibility) || item.compatibility.length === 0) {
    push("compatibility", "must list at least one coding agent");
    return;
  }
  for (const agent of item.compatibility) {
    if (!oneOf(KNOWN_AGENTS, agent)) push("compatibility", `unknown coding agent "${String(agent)}"`);
  }
}

function checkProvenance(item: Item, push: Push): void {
  if (item.author !== undefined) {
    const author = item.author as Item | null;
    if (typeof author !== "object" || author === null || !isNonEmptyString(author.name)) {
      push("author", "must be an object with a non-empty name");
    } else if (author.url !== undefined && !isHttpUrl(author.url)) {
      push("author.url", "must be an http(s) URL");
    }
  }
  if (item.externalUrl !== undefined && !isHttpUrl(item.externalUrl)) push("externalUrl", "must be an http(s) URL");
}

function checkEnums(item: Item, push: Push): void {
  if (item.targetScope !== undefined && !oneOf(KNOWN_SCOPES, item.targetScope)) {
    push("targetScope", `unknown scope "${String(item.targetScope)}"`);
  }
  if (item.pluginType !== undefined && !oneOf(KNOWN_PLUGIN_TYPES, item.pluginType)) {
    push("pluginType", `unknown pluginType "${String(item.pluginType)}"`);
  }
}

export function validateItem(value: unknown, options: ValidateOptions = {}): ValidationError[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ field: "", message: "item must be a JSON object" }];
  }
  const item = value as Item;
  const errors: ValidationError[] = [];
  const push: Push = (field, message) => errors.push({ field, message });

  for (const key of Object.keys(item)) {
    if (!KNOWN_FIELDS.has(key)) push(key, `unknown field "${key}"`);
  }
  checkIdentity(item, options, push);
  checkText(item, push);
  checkCompatibility(item, push);
  checkProvenance(item, push);
  checkEnums(item, push);
  for (const message of longDescriptionProblems(item.longDescription)) {
    errors.push({ field: "longDescription", message, gate: true });
  }
  return errors;
}

export const structuralErrors = (errors: ValidationError[]): ValidationError[] => errors.filter((e) => !e.gate);
export const gateErrors = (errors: ValidationError[]): ValidationError[] => errors.filter((e) => e.gate);

export function formatErrors(errors: ValidationError[]): string {
  return errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join("; ");
}

/** Throws with every structural problem when the item cannot be used at all. */
export function assertStructurallyValid(value: unknown, options: ValidateOptions = {}): asserts value is RegistryItem {
  const errors = structuralErrors(validateItem(value, options));
  if (errors.length > 0) throw new Error(`Invalid item: ${formatErrors(errors)}`);
}
