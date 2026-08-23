export type CodingAgent = "claude" | "copilot" | "gemini" | "codex" | "opencode";

export type ComponentType =
  | "skill"
  | "hook"
  | "agent"
  | "plugin"
  | "command"
  | "settings"
  | "mcp";

export type SourceType = "official" | "toolr" | "community";

export type ScopeType = "user" | "project" | "local";

export interface Author {
  name: string;
  url?: string;
}

export interface HookTrigger {
  event: string;
  matcher?: string;
}

export type PluginType = "package" | "wrapper" | "integration";

export interface PluginContents {
  files?: FileTreeNode[];
  triggers?: HookTrigger[];
}

export interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

/**
 * Where a plugin's content comes from, mirroring the Claude Code marketplace
 * `source` forms. `sha` is always the effective pin: content is fetched at that
 * commit and never from a moving branch.
 */
export type PluginSourceKind = "marketplace-path" | "github" | "url" | "git-subdir";

export interface PluginSource {
  kind: PluginSourceKind;
  /** `marketplace-path` / `git-subdir`: directory relative to the repository root (no leading "./"). */
  path?: string;
  /** `github` / `url` / `git-subdir`: HTTPS clone URL of the repository holding the content. */
  url?: string;
  /** Declared branch or tag, if the marketplace entry names one. Informational only. */
  ref?: string;
  /** Effective pinned commit SHA (40 lowercase hex characters). */
  sha: string;
}

/** The marketplace a plugin entry was read from, pinned to the commit that was read. */
export interface MarketplaceRef {
  name: string;
  url: string;
  sha: string;
}

/**
 * License provenance for content that is redistributed by the CLI. `file` is the
 * upstream path (relative to the source root named by `sourceRevision` /
 * `pluginSource`); `installAs` is the file name the CLI writes next to the
 * installed content when `file` lies outside the item's own directory.
 */
export interface LicenseInfo {
  /** SPDX identifier when it could be determined (e.g. "MIT", "Apache-2.0"). */
  spdx?: string;
  /** Upstream path of the license text. */
  file?: string;
  /** File name the CLI materialises the license as, when it is not part of the item tree. */
  installAs?: string;
  /** Free-form note, e.g. when no license text exists upstream. */
  note?: string;
}

export interface RegistryItem {
  slug: string;
  name: string;
  type: ComponentType;
  description: string;
  longDescription?: string;
  compatibility: CodingAgent[];
  featured?: boolean;
  pluginType?: PluginType;
  wrapper?: string;
  integration?: string;
  package?: Record<string, number>;
  sourceType?: SourceType;
  targetScope?: ScopeType;
  /** Legacy short hash (16 hex) over git blob ids. Superseded by `contentDigest`; kept for older clients. */
  contentHash?: string;
  /** Marketplace name (e.g. "claude-plugins-official"). See `marketplaceRef` for the pinned identity. */
  marketplace?: string;
  author?: Author;
  externalUrl?: string;
  updatedAt?: string;
  contents?: PluginContents;

  // ---- Immutable source identity (see docs/registry-integrity.md) ----
  /** Commit SHA (40 lowercase hex) of the upstream repository the content was taken from. */
  sourceRevision?: string;
  /** SHA-256 (64 lowercase hex) over the canonical file set; verified by the CLI before install. */
  contentDigest?: string;
  /** Plugins: the pinned marketplace `source` descriptor. */
  pluginSource?: PluginSource;
  /** Plugins: the pinned marketplace the entry was read from. */
  marketplaceRef?: MarketplaceRef;
  /** Plugins: marketplace `strict` flag. `false` means the marketplace entry defines the plugin. */
  strict?: boolean;
  /** Plugins with `strict: false`: inline LSP server definitions from the marketplace entry. */
  lspServers?: Record<string, unknown>;
  /** Plugins with `strict: false`: skill paths the marketplace entry exposes (relative to the source root). */
  skills?: string[];
  /** Plugins: the version declared by the marketplace entry or plugin.json. */
  version?: string;
  /** License provenance. */
  license?: LicenseInfo;
}

export interface RegistryManifest {
  version: string;
  items: RegistryItem[];
}

export interface ManifestTypeDescriptor {
  file: string;
  count: number;
}

export interface RegistryManifestIndex {
  version: string;
  types: Record<ComponentType, ManifestTypeDescriptor>;
}

export interface TypeManifest {
  type: ComponentType;
  items: RegistryItem[];
}
