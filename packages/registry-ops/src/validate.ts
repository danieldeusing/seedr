import type { ComponentType, FileTreeNode, RegistryItem } from "@seedr/shared";
import { KNOWN_AGENTS } from "./agents.js";
import { CANONICAL_SOURCE_TYPES, isFirstParty } from "./sourceTypes.js";
import { isLabelSlug } from "./labels.js";
import { MAX_SLUG_LENGTH, SLUG_PATTERN, isComponentType, isValidSlug, typeDirName } from "./paths.js";

/**
 * The one validator. Structural errors make an item unusable and fail `compile`;
 * errors marked `gate` are the commit gate's description standard
 * (.agents/rules/registry-descriptions.md), which compile tolerates for synced
 * items but Studio and the pre-commit hook enforce.
 *
 * The provenance rules implement docs/registry-integrity.md: synced items are
 * pinned to one upstream commit (`sourceRevision`) and carry a SHA-256
 * `contentDigest` over their complete file set, which the CLI verifies before
 * installing anything.
 */
export interface ValidationError {
  field: string;
  message: string;
  gate?: true;
}

export const MIN_LONG_DESCRIPTION_WORDS = 30;

export const KNOWN_SCOPES = ["user", "project", "local"] as const;
export const KNOWN_PLUGIN_TYPES = ["package", "wrapper", "integration"] as const;
export const PLUGIN_SOURCE_KINDS = ["marketplace-path", "github", "url", "git-subdir"] as const;
export const PLUGIN_CONTENT_KINDS = ["skill", "agent", "hook", "command", "mcp"] as const;
export const LICENSE_INSTALL_NAMES = ["LICENSE", "NOTICE"] as const;

const SHA1_HEX = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const LEGACY_HASH_HEX = /^[0-9a-f]{16}$/;
const PINNED_TREE_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/([0-9a-f]{40})(?:\/|$)/;

/** Every field an item.json may carry; anything else is a typo or a smuggled key. */
export const KNOWN_FIELDS = new Set([
  "slug", "name", "type", "description", "longDescription", "compatibility", "featured",
  "pluginType", "wrapper", "integration", "package", "sourceType", "targetScope", "label",
  "contentHash", "marketplace", "author", "externalUrl", "updatedAt", "contents",
  // immutable source identity and provenance (docs/registry-integrity.md)
  "sourceRevision", "contentDigest", "pluginSource", "marketplaceRef", "strict", "localSource",
  "lspServers", "skills", "version", "license",
]);

export interface ValidateOptions {
  /** When given, the item's own `type`/`slug` must match the directory it lives in. */
  expectedType?: ComponentType;
  expectedSlug?: string;
  /**
   * Files found on disk next to item.json (relative paths, item.json excluded). When given
   * and the item is first-party, `contents.files` must list exactly these — the digest is
   * computed over them.
   */
  diskFiles?: readonly string[];
  /** Require `sourceRevision`/`contentDigest` (and `pluginSource` for plugins) on synced items. Default true. */
  requireProvenance?: boolean;
}

type Item = Record<string, unknown>;
type Push = (field: string, message: string) => void;

const isObject = (value: unknown): value is Item =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const isHttpsUrl = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * `local://<path>` — the registry served beside the app rather than fetched
 * from GitHub.
 *
 * A private instance serving its own registry over nginx cannot use a raw
 * GitHub URL: the repository is private, so every file preview would 404. The
 * web app has resolved this scheme against its own origin all along
 * (`apps/web/src/lib/fileSource.ts`); the validator refusing it is what made a
 * deliberate, working setup report itself as invalid.
 *
 * The path becomes a URL path, so it is held to the same rule as any path in an
 * item: no climbing out, no absolute prefix.
 */
const isLocalUrl = (value: unknown): boolean =>
  typeof value === "string" && value.startsWith("local://") && isSafeRelativePath(value.slice("local://".length));

const oneOf = (allowed: readonly string[], value: unknown): boolean => allowed.includes(String(value));

function isSafeRelativePath(value: unknown): boolean {
  if (!isNonEmptyString(value) || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Node names are joined into filesystem paths by the CLI, so anything that could escape a directory is refused. */
export function isSafeNodeName(name: unknown): name is string {
  if (typeof name !== "string" || name.length === 0) return false;
  if (name === "." || name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  for (const char of name) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/** Flattens a `contents.files` tree into sorted "a/b/c" paths (directories contribute nothing). */
export function flattenFileTree(nodes: readonly FileTreeNode[], prefix = ""): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "directory") {
      paths.push(...flattenFileTree(node.children ?? [], path));
    } else {
      paths.push(path);
    }
  }
  return paths.sort();
}

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
  if (!isValidSlug(item.slug)) {
    push("slug", `must match ${SLUG_PATTERN} and be at most ${MAX_SLUG_LENGTH} characters (got ${JSON.stringify(item.slug)})`);
  } else if (options.expectedSlug !== undefined && item.slug !== options.expectedSlug) {
    push("slug", `is "${item.slug}" but the directory is "${options.expectedSlug}"`);
  }
  if (!isComponentType(item.type)) push("type", `unknown type "${String(item.type)}"`);
  else if (options.expectedType !== undefined && item.type !== options.expectedType) {
    push("type", `is "${item.type}" but the directory is for "${typeDirName(options.expectedType)}/" (${options.expectedType})`);
  }
  if (!oneOf(CANONICAL_SOURCE_TYPES, item.sourceType)) push("sourceType", `unknown sourceType "${String(item.sourceType)}"`);
}

function checkText(item: Item, push: Push): void {
  if (!isNonEmptyString(item.name)) push("name", "must be a non-empty string");
  if (!isNonEmptyString(item.description)) push("description", "is missing 'description'");
  if (item.longDescription !== undefined && typeof item.longDescription !== "string") {
    push("longDescription", "must be a string when present");
  }
  if (item.featured !== undefined && typeof item.featured !== "boolean") {
    push("featured", "must be a boolean when present");
  }
  if (item.updatedAt !== undefined && !isNonEmptyString(item.updatedAt)) {
    push("updatedAt", "must be a non-empty string when present");
  }
  if (item.version !== undefined && !isNonEmptyString(item.version)) {
    push("version", "must be a non-empty string when present");
  }
}

function checkCompatibility(item: Item, push: Push): void {
  if (!Array.isArray(item.compatibility) || item.compatibility.length === 0) {
    push("compatibility", "must list at least one coding agent");
    return;
  }
  for (const agent of item.compatibility) {
    if (!oneOf(KNOWN_AGENTS, agent)) push("compatibility", `unknown coding agent "${String(agent)}"`);
  }
  if (new Set(item.compatibility).size !== item.compatibility.length) {
    push("compatibility", "lists an agent twice");
  }
}

/**
 * The note of where a first-party item was copied from. The path is absolute and
 * machine-local by nature — another checkout will not find it, and is meant to
 * report the source as missing rather than to guess at it.
 */
function checkLocalSource(item: Item, push: Push): void {
  if (item.localSource === undefined) return;
  const source = item.localSource as Item | null;
  if (typeof source !== "object" || source === null || !isNonEmptyString(source.path)) {
    push("localSource", "must be an object with a non-empty path");
    return;
  }
  if (source.digest !== null && !SHA256_HEX.test(String(source.digest))) push("localSource.digest", "must be 64 lowercase hex, or null when the source has no content files");
  if (!isNonEmptyString(source.syncedAt)) push("localSource.syncedAt", "must be the date the source was last copied");
}

function checkAuthor(item: Item, push: Push): void {
  if (item.author !== undefined) {
    const author = item.author as Item | null;
    if (typeof author !== "object" || author === null || !isNonEmptyString(author.name)) {
      push("author", "must be an object with a non-empty name");
    } else if (author.url !== undefined && !isHttpUrl(author.url)) {
      push("author.url", "must be an http(s) URL");
    }
  }
  if (item.externalUrl !== undefined && !isHttpsUrl(item.externalUrl) && !isLocalUrl(item.externalUrl))
    push("externalUrl", "must be an https URL, or local://<path> for a registry served beside the app");
  if (item.targetScope !== undefined && !oneOf(KNOWN_SCOPES, item.targetScope)) {
    push("targetScope", `unknown scope "${String(item.targetScope)}"`);
  }
  if (item.marketplace !== undefined && !isNonEmptyString(item.marketplace)) {
    push("marketplace", "must be a non-empty string when present");
  }
  // Only the shape, never whether the catalogue defines it: this validator is pure
  // and runs in the webview, where registry/labels.json cannot be read. The ops
  // check existence (assertLabelDefined).
  if (item.label !== undefined && !isLabelSlug(item.label)) {
    push("label", `must be a label slug when present (got ${JSON.stringify(item.label)})`);
  }
}

function checkFileNodes(nodes: unknown, where: string, push: Push): void {
  if (!Array.isArray(nodes)) {
    push(where, "must be an array of file nodes");
    return;
  }
  const seen = new Map<string, string>();
  nodes.forEach((node: unknown, index) => {
    const label = `${where}[${index}]`;
    if (!isObject(node)) {
      push(label, "must be an object");
      return;
    }
    if (!isSafeNodeName(node.name)) {
      push(`${label}.name`, `${JSON.stringify(node.name)} is not a safe file name (no "/", "\\", "..", empty or control characters)`);
      return;
    }
    const folded = node.name.toLowerCase();
    const clash = seen.get(folded);
    if (clash !== undefined) {
      push(`${label}.name`, `"${node.name}" collides with sibling "${clash}" (names must be unique per directory, case-insensitively)`);
    }
    seen.set(folded, node.name);
    if (node.type !== "file" && node.type !== "directory") {
      push(`${label}.type`, 'must be "file" or "directory"');
      return;
    }
    if (node.type === "file" && node.children !== undefined) {
      push(label, "is a file and must not have children");
    }
    if (node.type === "directory" && node.children !== undefined) {
      checkFileNodes(node.children, `${label}.children`, push);
    }
  });
}

function checkContents(item: Item, options: ValidateOptions, push: Push): void {
  if (item.contents !== undefined) {
    if (!isObject(item.contents)) {
      push("contents", "must be an object");
      return;
    }
    if (item.contents.files !== undefined) checkFileNodes(item.contents.files, "contents.files", push);
    if (item.contents.triggers !== undefined) {
      if (!Array.isArray(item.contents.triggers)) {
        push("contents.triggers", "must be an array");
      } else {
        item.contents.triggers.forEach((trigger: unknown, index) => {
          if (!isObject(trigger) || !isNonEmptyString(trigger.event)) {
            push(`contents.triggers[${index}].event`, "must be a non-empty string");
          } else if (trigger.matcher !== undefined && typeof trigger.matcher !== "string") {
            push(`contents.triggers[${index}].matcher`, "must be a string when present");
          }
        });
      }
    }
  }

  if (options.diskFiles !== undefined && isFirstParty(item.sourceType)) {
    const declared = flattenFileTree(((item.contents as { files?: FileTreeNode[] } | undefined)?.files ?? []));
    const onDisk = [...options.diskFiles].sort();
    if (JSON.stringify(declared) !== JSON.stringify(onDisk)) {
      const missing = onDisk.filter((path) => !declared.includes(path));
      const extra = declared.filter((path) => !onDisk.includes(path));
      push(
        "contents.files",
        "must list exactly the files on disk" +
          (missing.length ? `; not declared: ${missing.join(", ")}` : "") +
          (extra.length ? `; declared but missing on disk: ${extra.join(", ")}` : "")
      );
    }
  }
}

function checkPluginFields(item: Item, push: Push): void {
  const isPlugin = item.type === "plugin";
  for (const key of ["pluginSource", "marketplaceRef", "strict", "lspServers", "skills"] as const) {
    if (item[key] !== undefined && !isPlugin) push(key, "is only allowed on plugins");
  }

  const { pluginType } = item;
  if (pluginType !== undefined) {
    if (!isPlugin) push("pluginType", "is only allowed on plugins");
    if (!oneOf(KNOWN_PLUGIN_TYPES, pluginType)) push("pluginType", `must be one of ${KNOWN_PLUGIN_TYPES.join(", ")}`);
  }

  if (pluginType === "wrapper") {
    if (!oneOf(PLUGIN_CONTENT_KINDS, item.wrapper)) {
      push("wrapper", `pluginType "wrapper" requires "wrapper" to be one of ${PLUGIN_CONTENT_KINDS.join(", ")}`);
    }
  } else if (item.wrapper !== undefined) {
    push("wrapper", 'is only allowed when pluginType is "wrapper"');
  }

  if (pluginType === "package") {
    if (!isObject(item.package)) {
      push("package", 'pluginType "package" requires a "package" object of content counts');
    } else {
      for (const [kind, count] of Object.entries(item.package)) {
        if (!oneOf(PLUGIN_CONTENT_KINDS, kind)) push("package", `unknown content kind "${kind}"`);
        if (!Number.isInteger(count) || (count as number) < 1) push(`package.${kind}`, "must be a positive integer");
      }
    }
  } else if (item.package !== undefined) {
    push("package", 'is only allowed when pluginType is "package"');
  }

  if (pluginType === "integration") {
    if (!isNonEmptyString(item.integration)) push("integration", 'pluginType "integration" requires a non-empty "integration"');
  } else if (item.integration !== undefined) {
    push("integration", 'is only allowed when pluginType is "integration"');
  }

  if (item.strict !== undefined && typeof item.strict !== "boolean") push("strict", "must be a boolean");
  if (item.lspServers !== undefined) {
    if (!isObject(item.lspServers)) {
      push("lspServers", "must be an object keyed by server name");
    } else {
      for (const [name, server] of Object.entries(item.lspServers)) {
        if (!isObject(server) || !isNonEmptyString((server as Item).command)) {
          push(`lspServers.${name}`, 'must be an object with a non-empty "command"');
        }
      }
    }
  }
  if (item.skills !== undefined && (!Array.isArray(item.skills) || item.skills.length === 0 || !item.skills.every(isNonEmptyString))) {
    push("skills", "must be a non-empty array of paths");
  }
}

function checkProvenance(item: Item, options: ValidateOptions, push: Push): void {
  const requireProvenance = options.requireProvenance ?? true;
  const synced = !isFirstParty(item.sourceType);

  if (item.sourceRevision !== undefined && !SHA1_HEX.test(String(item.sourceRevision))) {
    push("sourceRevision", "must be a 40-character lowercase hex commit SHA");
  }
  if (item.contentDigest !== undefined && !SHA256_HEX.test(String(item.contentDigest))) {
    push("contentDigest", "must be a 64-character lowercase hex SHA-256");
  }
  if (item.contentHash !== undefined && !LEGACY_HASH_HEX.test(String(item.contentHash))) {
    push("contentHash", "must be a 16-character lowercase hex string");
  }
  if (!synced) {
    for (const key of ["sourceRevision", "pluginSource", "marketplaceRef"] as const) {
      if (item[key] !== undefined) push(key, "is only allowed on synced (official/community) items");
    }
  } else if (requireProvenance) {
    if (item.sourceRevision === undefined) push("sourceRevision", 'synced items must carry "sourceRevision"');
    if (item.contentDigest === undefined) push("contentDigest", 'synced items must carry "contentDigest"');
    if (item.type === "plugin" && item.pluginSource === undefined) push("pluginSource", 'synced plugins must carry "pluginSource"');
  }

  const source = item.pluginSource;
  if (source !== undefined) {
    if (!isObject(source)) {
      push("pluginSource", "must be an object");
    } else {
      const kind = String(source.kind);
      if (!oneOf(PLUGIN_SOURCE_KINDS, kind)) push("pluginSource.kind", `must be one of ${PLUGIN_SOURCE_KINDS.join(", ")}`);
      if (!SHA1_HEX.test(String(source.sha))) {
        push("pluginSource.sha", "must be a 40-character lowercase hex commit SHA");
      } else if (item.sourceRevision !== undefined && source.sha !== item.sourceRevision) {
        push("pluginSource.sha", 'must equal "sourceRevision" (the content is pinned to one commit)');
      }
      const needsPath = kind === "marketplace-path" || kind === "git-subdir";
      if (needsPath && !isSafeRelativePath(source.path)) {
        push("pluginSource.path", `must be a relative path without "." or ".." segments for kind "${kind}"`);
      }
      if (!needsPath && source.path !== undefined) push("pluginSource.path", `is not allowed for kind "${kind}"`);
      const needsUrl = kind === "github" || kind === "url" || kind === "git-subdir";
      if (needsUrl && !isHttpsUrl(source.url)) push("pluginSource.url", `must be an https URL for kind "${kind}"`);
      if (kind === "marketplace-path" && source.url !== undefined) {
        push("pluginSource.url", 'is not allowed for kind "marketplace-path" (the repository is marketplaceRef.url)');
      }
      if (kind === "marketplace-path" && item.marketplaceRef === undefined) {
        push("pluginSource", 'kind "marketplace-path" requires "marketplaceRef"');
      }
      if (source.ref !== undefined && !isNonEmptyString(source.ref)) push("pluginSource.ref", "must be a non-empty string when present");
    }
  }

  const ref = item.marketplaceRef;
  if (ref !== undefined) {
    if (!isObject(ref)) {
      push("marketplaceRef", "must be an object");
    } else {
      if (!isNonEmptyString(ref.name)) push("marketplaceRef.name", "must be a non-empty string");
      if (!isHttpsUrl(ref.url)) push("marketplaceRef.url", "must be an https URL");
      if (!SHA1_HEX.test(String(ref.sha))) push("marketplaceRef.sha", "must be a 40-character lowercase hex commit SHA");
      if (item.marketplace !== undefined && item.marketplace !== ref.name) {
        push("marketplace", `(${JSON.stringify(item.marketplace)}) must equal "marketplaceRef.name" (${JSON.stringify(ref.name)})`);
      }
    }
  }

  if (typeof item.externalUrl === "string" && typeof item.sourceRevision === "string") {
    const pinned = PINNED_TREE_URL.exec(item.externalUrl);
    if (pinned && pinned[1] !== item.sourceRevision) {
      push("externalUrl", `is pinned to ${pinned[1]} but "sourceRevision" is ${item.sourceRevision}`);
    }
  }
}

function checkLicense(license: unknown, push: Push): void {
  if (license === undefined) return;
  if (!isObject(license)) {
    push("license", "must be an object");
    return;
  }
  for (const key of ["spdx", "file", "installAs", "note"] as const) {
    if (license[key] !== undefined && !isNonEmptyString(license[key])) {
      push(`license.${key}`, "must be a non-empty string when present");
    }
  }
  if (license.file !== undefined && !isSafeRelativePath(license.file)) {
    push("license.file", 'must be a relative upstream path without "." or ".." segments');
  }
  if (license.installAs !== undefined && !oneOf(LICENSE_INSTALL_NAMES, license.installAs)) {
    push("license.installAs", `must be one of ${LICENSE_INSTALL_NAMES.join(", ")}`);
  }
  if (license.installAs !== undefined && license.file === undefined) {
    push("license.installAs", 'requires "license.file"');
  }
  if (license.file === undefined && license.note === undefined) {
    push("license", 'must name a "file" or carry a "note" explaining that none exists upstream');
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
  checkAuthor(item, push);
  checkLocalSource(item, push);
  checkContents(item, options, push);
  checkPluginFields(item, push);
  checkProvenance(item, options, push);
  checkLicense(item.license, push);
  for (const message of longDescriptionProblems(item.longDescription)) {
    errors.push({ field: "longDescription", message, gate: true });
  }
  return errors;
}

/** Returns one message per `(type, slug)` pair that occurs more than once. */
export function findDuplicateItems(items: readonly Pick<RegistryItem, "type" | "slug">[]): string[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = `${item.type}/${item.slug}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => `duplicate item ${key} (${count} occurrences)`);
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
