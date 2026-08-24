/**
 * Types for the registry scripts.
 *
 * The integrity fields (sourceRevision, contentDigest, pluginSource, marketplaceRef,
 * license, …) are type-only imports of the contract in packages/shared, so the sync
 * can never drift from what the CLI reads. Type imports are erased by tsx, so the
 * scripts still run without a build step.
 */

import type {
  Author,
  CodingAgent,
  ComponentType,
  FileTreeNode,
  HookTrigger,
  LicenseInfo,
  MarketplaceRef,
  PluginSource,
  PluginSourceKind,
  PluginType,
  ScopeType,
  SourceType,
} from "../../packages/shared/src/index.js";

export type {
  Author,
  CodingAgent,
  ComponentType,
  FileTreeNode,
  HookTrigger,
  LicenseInfo,
  MarketplaceRef,
  PluginSource,
  PluginSourceKind,
  PluginType,
  ScopeType,
  SourceType,
};

export interface PluginContents {
  files?: FileTreeNode[];
  triggers?: HookTrigger[];
}

/** Intermediate result from parsePluginContents — used for classification, not stored on items */
export interface ParsedPluginContents extends PluginContents {
  skills?: string[];
  agents?: string[];
  hooks?: string[];
  commands?: string[];
  mcpServers?: string[];
}

export interface ManifestItem {
  slug: string;
  name: string;
  type: ComponentType;
  description: string;
  longDescription?: string;
  compatibility: string[];
  featured?: boolean;
  pluginType?: PluginType;
  wrapper?: string;
  integration?: string;
  package?: Record<string, number>;
  sourceType: SourceType;
  targetScope?: ScopeType;
  /** Legacy short hash (16 hex) over git blob ids; superseded by `contentDigest`. */
  contentHash?: string;
  /** Marketplace name; always equals `marketplaceRef.name` when that is present. */
  marketplace?: string;
  author: Author;
  externalUrl?: string;
  updatedAt?: string;
  contents?: PluginContents;
  /** Plugin version as declared by the marketplace entry or plugin.json. */
  version?: string;

  // ---- Immutable source identity (docs/registry-integrity.md) ----
  sourceRevision?: string;
  contentDigest?: string;
  pluginSource?: PluginSource;
  marketplaceRef?: MarketplaceRef;
  strict?: boolean;
  lspServers?: Record<string, unknown>;
  /** Plugins with `strict: false`: inline skill paths from the marketplace entry. */
  skills?: string[];
  license?: LicenseInfo;
}

export interface Manifest {
  version: string;
  items: ManifestItem[];
}

export interface ManifestIndex {
  version: string;
  types: Record<ComponentType, { file: string; count: number }>;
}

export interface TypeManifest {
  type: ComponentType;
  items: ManifestItem[];
}

export interface GitTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

export interface GitTreeResponse {
  sha: string;
  tree: GitTreeItem[];
  truncated: boolean;
}

/** `"<type>/<slug>"` — the registry-wide identity of an item. */
export type ItemKey = `${ComponentType}/${string}`;

export function itemKey(item: Pick<ManifestItem, "type" | "slug">): ItemKey {
  return `${item.type}/${item.slug}`;
}

/**
 * Outcome of syncing one source (the official skills repo, the official marketplace,
 * or a single community item). A failed source is carried over unchanged by the
 * orchestrator; only complete sources can add, change or delete items.
 */
export type SourceResult =
  | {
      status: "complete";
      /** Existing item keys this source is responsible for (deletions are computed against these). */
      owned: ItemKey[];
      items: ManifestItem[];
      /** Items that could not be built this run; existing ones are carried over, new ones skipped. */
      failedItems: { key: ItemKey; reason: string }[];
      /** Upstream renames applied this run (old key → new key). */
      renamed: { from: ItemKey; to: ItemKey }[];
    }
  | {
      status: "failed";
      owned: ItemKey[];
      reason: string;
    };
