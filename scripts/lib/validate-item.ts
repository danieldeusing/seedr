/**
 * The one item validator, shared by `pnpm compile` (every item.json on disk) and the sync
 * (every proposed item before anything is written). See docs/registry-integrity.md §4.
 *
 * `validateItem` returns every violation it finds, each prefixed with the item's file path,
 * so a run reports all problems at once instead of one per attempt.
 */

import { ALL_TYPES, typeDirName } from "../compile-manifest.js";
import type { ComponentType, FileTreeNode, ManifestItem } from "../sync/types.js";

export const CODING_AGENTS = ["claude", "copilot", "gemini", "codex", "opencode"] as const;
export const SOURCE_TYPES = ["official", "toolr", "community"] as const;
export const SCOPES = ["user", "project", "local"] as const;
export const PLUGIN_TYPES = ["package", "wrapper", "integration"] as const;
export const PLUGIN_SOURCE_KINDS = ["marketplace-path", "github", "url", "git-subdir"] as const;
export const PLUGIN_CONTENT_KINDS = ["skill", "agent", "hook", "command", "mcp"] as const;
export const LICENSE_INSTALL_NAMES = ["LICENSE", "NOTICE"] as const;

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const SLUG_MAX_LENGTH = 100;
const SHA1_HEX = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const LEGACY_HASH_HEX = /^[0-9a-f]{16}$/;
const PINNED_TREE_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/([0-9a-f]{40})(?:\/|$)/;

export interface ValidationContext {
  /** Where the item lives (or will be written); used as the prefix of every message. */
  file: string;
  /** Name of the directory holding item.json; must equal the slug. */
  slugDir?: string;
  /** Name of the type folder holding that directory; must equal `typeDirName(type)`. */
  typeDir?: string;
  /**
   * Files found on disk next to item.json (relative paths, item.json excluded). When given,
   * `contents.files` must list exactly these — the digest is computed over them.
   */
  diskFiles?: readonly string[];
  /** Require `sourceRevision`/`contentDigest` (and `pluginSource` for plugins) on non-toolr items. Default true. */
  requireProvenance?: boolean;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

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

function validateFileNodes(nodes: unknown, where: string, errors: string[]): void {
  if (!Array.isArray(nodes)) {
    errors.push(`${where} must be an array of file nodes`);
    return;
  }
  const seen = new Map<string, string>();
  nodes.forEach((node: unknown, index) => {
    const label = `${where}[${index}]`;
    if (!isObject(node)) {
      errors.push(`${label} must be an object`);
      return;
    }
    if (!isSafeNodeName(node.name)) {
      errors.push(`${label}.name ${JSON.stringify(node.name)} is not a safe file name (no "/", "\\", "..", empty or control characters)`);
      return;
    }
    const folded = node.name.toLowerCase();
    const clash = seen.get(folded);
    if (clash !== undefined) {
      errors.push(`${label}.name "${node.name}" collides with sibling "${clash}" (names must be unique per directory, case-insensitively)`);
    }
    seen.set(folded, node.name);
    if (node.type !== "file" && node.type !== "directory") {
      errors.push(`${label}.type must be "file" or "directory"`);
      return;
    }
    if (node.type === "file" && node.children !== undefined) {
      errors.push(`${label} is a file and must not have children`);
    }
    if (node.type === "directory" && node.children !== undefined) {
      validateFileNodes(node.children, `${label}.children`, errors);
    }
  });
}

function validatePluginFields(item: Json, errors: string[]): void {
  const isPlugin = item.type === "plugin";
  for (const key of ["pluginSource", "marketplaceRef", "strict", "lspServers", "skills"] as const) {
    if (item[key] !== undefined && !isPlugin) {
      errors.push(`"${key}" is only allowed on plugins`);
    }
  }

  const { pluginType } = item;
  if (pluginType !== undefined) {
    if (!isPlugin) errors.push(`"pluginType" is only allowed on plugins`);
    if (!PLUGIN_TYPES.includes(pluginType as never)) {
      errors.push(`"pluginType" must be one of ${PLUGIN_TYPES.join(", ")}`);
    }
  }
  const expectsWrapper = pluginType === "wrapper";
  const expectsPackage = pluginType === "package";
  const expectsIntegration = pluginType === "integration";

  if (expectsWrapper) {
    if (!PLUGIN_CONTENT_KINDS.includes(item.wrapper as never)) {
      errors.push(`pluginType "wrapper" requires "wrapper" to be one of ${PLUGIN_CONTENT_KINDS.join(", ")}`);
    }
  } else if (item.wrapper !== undefined) {
    errors.push(`"wrapper" is only allowed when pluginType is "wrapper"`);
  }

  if (expectsPackage) {
    if (!isObject(item.package)) {
      errors.push(`pluginType "package" requires a "package" object of content counts`);
    } else {
      for (const [kind, count] of Object.entries(item.package)) {
        if (!PLUGIN_CONTENT_KINDS.includes(kind as never)) {
          errors.push(`"package" has unknown content kind "${kind}"`);
        }
        if (!Number.isInteger(count) || (count as number) < 1) {
          errors.push(`"package.${kind}" must be a positive integer`);
        }
      }
    }
  } else if (item.package !== undefined) {
    errors.push(`"package" is only allowed when pluginType is "package"`);
  }

  if (expectsIntegration) {
    if (!isNonEmptyString(item.integration)) {
      errors.push(`pluginType "integration" requires a non-empty "integration"`);
    }
  } else if (item.integration !== undefined) {
    errors.push(`"integration" is only allowed when pluginType is "integration"`);
  }

  if (item.strict !== undefined && typeof item.strict !== "boolean") {
    errors.push(`"strict" must be a boolean`);
  }
  if (item.lspServers !== undefined) {
    if (!isObject(item.lspServers)) {
      errors.push(`"lspServers" must be an object keyed by server name`);
    } else {
      for (const [name, server] of Object.entries(item.lspServers)) {
        if (!isObject(server) || !isNonEmptyString(server.command)) {
          errors.push(`"lspServers.${name}" must be an object with a non-empty "command"`);
        }
      }
    }
  }
  if (item.skills !== undefined) {
    if (!Array.isArray(item.skills) || item.skills.length === 0 || !item.skills.every(isNonEmptyString)) {
      errors.push(`"skills" must be a non-empty array of paths`);
    }
  }
  if (item.version !== undefined && !isNonEmptyString(item.version)) {
    errors.push(`"version" must be a non-empty string`);
  }
}

function validateProvenance(item: Json, errors: string[], requireProvenance: boolean): void {
  const synced = item.sourceType !== "toolr";

  if (item.sourceRevision !== undefined && !SHA1_HEX.test(String(item.sourceRevision))) {
    errors.push(`"sourceRevision" must be a 40-character lowercase hex commit SHA`);
  }
  if (item.contentDigest !== undefined && !SHA256_HEX.test(String(item.contentDigest))) {
    errors.push(`"contentDigest" must be a 64-character lowercase hex SHA-256`);
  }
  if (item.contentHash !== undefined && !LEGACY_HASH_HEX.test(String(item.contentHash))) {
    errors.push(`"contentHash" must be a 16-character lowercase hex string`);
  }
  if (!synced) {
    for (const key of ["sourceRevision", "pluginSource", "marketplaceRef"] as const) {
      if (item[key] !== undefined) errors.push(`"${key}" is only allowed on synced (official/community) items`);
    }
  } else if (requireProvenance) {
    if (item.sourceRevision === undefined) errors.push(`synced items must carry "sourceRevision"`);
    if (item.contentDigest === undefined) errors.push(`synced items must carry "contentDigest"`);
    if (item.type === "plugin" && item.pluginSource === undefined) {
      errors.push(`synced plugins must carry "pluginSource"`);
    }
  }

  const source = item.pluginSource;
  if (source !== undefined) {
    if (!isObject(source)) {
      errors.push(`"pluginSource" must be an object`);
    } else {
      const kind = source.kind as string;
      if (!PLUGIN_SOURCE_KINDS.includes(kind as never)) {
        errors.push(`"pluginSource.kind" must be one of ${PLUGIN_SOURCE_KINDS.join(", ")}`);
      }
      if (!SHA1_HEX.test(String(source.sha))) {
        errors.push(`"pluginSource.sha" must be a 40-character lowercase hex commit SHA`);
      } else if (item.sourceRevision !== undefined && source.sha !== item.sourceRevision) {
        errors.push(`"pluginSource.sha" must equal "sourceRevision" (the content is pinned to one commit)`);
      }
      const needsPath = kind === "marketplace-path" || kind === "git-subdir";
      if (needsPath && !isSafeRelativePath(source.path)) {
        errors.push(`"pluginSource.path" must be a relative path without "." or ".." segments for kind "${kind}"`);
      }
      if (!needsPath && source.path !== undefined) {
        errors.push(`"pluginSource.path" is not allowed for kind "${kind}"`);
      }
      const needsUrl = kind === "github" || kind === "url" || kind === "git-subdir";
      if (needsUrl && !isHttpsUrl(source.url)) {
        errors.push(`"pluginSource.url" must be an https URL for kind "${kind}"`);
      }
      if (kind === "marketplace-path" && source.url !== undefined) {
        errors.push(`"pluginSource.url" is not allowed for kind "marketplace-path" (the repository is marketplaceRef.url)`);
      }
      if (kind === "marketplace-path" && item.marketplaceRef === undefined) {
        errors.push(`pluginSource kind "marketplace-path" requires "marketplaceRef"`);
      }
      if (source.ref !== undefined && !isNonEmptyString(source.ref)) {
        errors.push(`"pluginSource.ref" must be a non-empty string when present`);
      }
    }
  }

  const ref = item.marketplaceRef;
  if (ref !== undefined) {
    if (!isObject(ref)) {
      errors.push(`"marketplaceRef" must be an object`);
    } else {
      if (!isNonEmptyString(ref.name)) errors.push(`"marketplaceRef.name" must be a non-empty string`);
      if (!isHttpsUrl(ref.url)) errors.push(`"marketplaceRef.url" must be an https URL`);
      if (!SHA1_HEX.test(String(ref.sha))) errors.push(`"marketplaceRef.sha" must be a 40-character lowercase hex commit SHA`);
      if (item.marketplace !== undefined && item.marketplace !== ref.name) {
        errors.push(`"marketplace" (${JSON.stringify(item.marketplace)}) must equal "marketplaceRef.name" (${JSON.stringify(ref.name)})`);
      }
    }
  }
  if (item.marketplace !== undefined && !isNonEmptyString(item.marketplace)) {
    errors.push(`"marketplace" must be a non-empty string when present`);
  }

  if (typeof item.externalUrl === "string" && typeof item.sourceRevision === "string") {
    const pinned = PINNED_TREE_URL.exec(item.externalUrl);
    if (pinned && pinned[1] !== item.sourceRevision) {
      errors.push(`"externalUrl" is pinned to ${pinned[1]} but "sourceRevision" is ${item.sourceRevision}`);
    }
  }
}

function validateLicense(license: unknown, errors: string[]): void {
  if (license === undefined) return;
  if (!isObject(license)) {
    errors.push(`"license" must be an object`);
    return;
  }
  for (const key of ["spdx", "file", "installAs", "note"] as const) {
    if (license[key] !== undefined && !isNonEmptyString(license[key])) {
      errors.push(`"license.${key}" must be a non-empty string when present`);
    }
  }
  if (license.file !== undefined && !isSafeRelativePath(license.file)) {
    errors.push(`"license.file" must be a relative upstream path without "." or ".." segments`);
  }
  if (license.installAs !== undefined && !LICENSE_INSTALL_NAMES.includes(license.installAs as never)) {
    errors.push(`"license.installAs" must be one of ${LICENSE_INSTALL_NAMES.join(", ")}`);
  }
  if (license.installAs !== undefined && license.file === undefined) {
    errors.push(`"license.installAs" requires "license.file"`);
  }
  if (license.file === undefined && license.note === undefined) {
    errors.push(`"license" must name a "file" or carry a "note" explaining that none exists upstream`);
  }
}

/**
 * Validate one item. Returns an empty array when the item is valid; otherwise every
 * violation found, each prefixed with `ctx.file`.
 */
export function validateItem(value: unknown, ctx: ValidationContext): string[] {
  const errors: string[] = [];
  const requireProvenance = ctx.requireProvenance ?? true;

  if (!isObject(value)) {
    return [`${ctx.file}: item.json must contain a JSON object`];
  }
  const item = value;

  if (typeof item.slug !== "string" || !SLUG_PATTERN.test(item.slug) || item.slug.length > SLUG_MAX_LENGTH) {
    errors.push(`"slug" must match ${SLUG_PATTERN} and be at most ${SLUG_MAX_LENGTH} characters (got ${JSON.stringify(item.slug)})`);
  }
  if (!ALL_TYPES.includes(item.type as ComponentType)) {
    errors.push(`"type" must be one of ${ALL_TYPES.join(", ")} (got ${JSON.stringify(item.type)})`);
  } else {
    if (ctx.typeDir !== undefined && ctx.typeDir !== typeDirName(item.type as ComponentType)) {
      errors.push(`type "${item.type}" belongs in folder "${typeDirName(item.type as ComponentType)}/", not "${ctx.typeDir}/"`);
    }
  }
  if (ctx.slugDir !== undefined && typeof item.slug === "string" && ctx.slugDir !== item.slug) {
    errors.push(`directory name "${ctx.slugDir}" does not match slug "${item.slug}"`);
  }
  if (!isNonEmptyString(item.name)) errors.push(`"name" must be a non-empty string`);
  if (!isNonEmptyString(item.description)) errors.push(`"description" must be a non-empty string`);
  if (item.longDescription !== undefined && typeof item.longDescription !== "string") {
    errors.push(`"longDescription" must be a string when present`);
  }

  if (!Array.isArray(item.compatibility) || item.compatibility.length === 0) {
    errors.push(`"compatibility" must be a non-empty array of ${CODING_AGENTS.join(", ")}`);
  } else {
    const unknown = item.compatibility.filter((agent: unknown) => !CODING_AGENTS.includes(agent as never));
    if (unknown.length > 0) {
      errors.push(`"compatibility" has unknown agents ${JSON.stringify(unknown)} (allowed: ${CODING_AGENTS.join(", ")})`);
    }
    if (new Set(item.compatibility).size !== item.compatibility.length) {
      errors.push(`"compatibility" lists an agent twice`);
    }
  }

  if (!SOURCE_TYPES.includes(item.sourceType as never)) {
    errors.push(`"sourceType" must be one of ${SOURCE_TYPES.join(", ")} (got ${JSON.stringify(item.sourceType)})`);
  }
  if (!isObject(item.author) || !isNonEmptyString(item.author.name)) {
    errors.push(`"author.name" must be a non-empty string`);
  } else if (item.author.url !== undefined && !isHttpsUrl(item.author.url)) {
    errors.push(`"author.url" must be an https URL when present`);
  }
  if (item.externalUrl !== undefined && !isHttpsUrl(item.externalUrl)) {
    errors.push(`"externalUrl" must be an https URL when present`);
  }
  if (item.targetScope !== undefined && !SCOPES.includes(item.targetScope as never)) {
    errors.push(`"targetScope" must be one of ${SCOPES.join(", ")}`);
  }
  if (item.featured !== undefined && typeof item.featured !== "boolean") {
    errors.push(`"featured" must be a boolean when present`);
  }
  if (item.updatedAt !== undefined && !isNonEmptyString(item.updatedAt)) {
    errors.push(`"updatedAt" must be a non-empty string when present`);
  }

  if (item.contents !== undefined) {
    if (!isObject(item.contents)) {
      errors.push(`"contents" must be an object`);
    } else {
      if (item.contents.files !== undefined) {
        validateFileNodes(item.contents.files, "contents.files", errors);
      }
      if (item.contents.triggers !== undefined) {
        if (!Array.isArray(item.contents.triggers)) {
          errors.push(`"contents.triggers" must be an array`);
        } else {
          item.contents.triggers.forEach((trigger: unknown, index) => {
            if (!isObject(trigger) || !isNonEmptyString(trigger.event)) {
              errors.push(`"contents.triggers[${index}].event" must be a non-empty string`);
            } else if (trigger.matcher !== undefined && typeof trigger.matcher !== "string") {
              errors.push(`"contents.triggers[${index}].matcher" must be a string when present`);
            }
          });
        }
      }
    }
  }

  if (ctx.diskFiles !== undefined && item.sourceType === "toolr" && errors.length === 0) {
    const declared = flattenFileTree((item.contents as { files?: FileTreeNode[] } | undefined)?.files ?? []);
    const onDisk = [...ctx.diskFiles].sort();
    if (JSON.stringify(declared) !== JSON.stringify(onDisk)) {
      const missing = onDisk.filter((path) => !declared.includes(path));
      const extra = declared.filter((path) => !onDisk.includes(path));
      errors.push(
        `"contents.files" must list exactly the files on disk` +
          (missing.length ? `; not declared: ${missing.join(", ")}` : "") +
          (extra.length ? `; declared but missing on disk: ${extra.join(", ")}` : ""),
      );
    }
  }

  validatePluginFields(item, errors);
  validateProvenance(item, errors, requireProvenance);
  validateLicense(item.license, errors);

  return errors.map((message) => `${ctx.file}: ${message}`);
}

/** Returns one message per `(type, slug)` pair that occurs more than once. */
export function findDuplicateItems(items: readonly Pick<ManifestItem, "type" | "slug">[]): string[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = `${item.type}/${item.slug}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => `duplicate item ${key} (${count} occurrences)`);
}

/** Throws an Error listing every violation when the item is invalid. */
export function assertValidItem(value: unknown, ctx: ValidationContext): asserts value is ManifestItem {
  const errors = validateItem(value, ctx);
  if (errors.length > 0) {
    throw new Error(`Invalid registry item:\n  ${errors.join("\n  ")}`);
  }
}
