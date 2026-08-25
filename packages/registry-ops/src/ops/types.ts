import type { Author, CodingAgent, ComponentType, HookTrigger, LabelDefinition, PluginType, RegistryItem, ScopeType, SourceType } from "@seedr/shared";

/**
 * Versioned, discriminated operation payloads. Anything that is not one of these
 * shapes is rejected structurally by `parseOp` before it can touch disk.
 */
export interface AddLocalOp {
  v: 1;
  kind: "add-local";
  type: ComponentType;
  slug: string;
  /** A directory to copy whole, or a single file to place inside the item directory. */
  sourcePath: string;
  name: string;
  description: string;
  longDescription: string;
  compatibility: CodingAgent[];
  author: Author;
  externalUrl?: string;
  targetScope?: ScopeType;
  /** Slug of a label the catalogue already defines; the operation is refused otherwise. */
  label?: string;
  /** Hook triggers, when the source is a hook script (extracted by the caller). */
  triggers?: HookTrigger[];
}

export interface AddRemoteOp {
  v: 1;
  kind: "add-remote";
  type: ComponentType;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  compatibility: CodingAgent[];
  author: Author;
  externalUrl: string;
  pluginType?: PluginType;
  wrapper?: string;
  integration?: string;
  package?: Record<string, number>;
  marketplace?: string;
  updatedAt?: string;
  targetScope?: ScopeType;
  /** Slug of a label the catalogue already defines; the operation is refused otherwise. */
  label?: string;
  contents?: RegistryItem["contents"];
  // Immutable source identity (docs/registry-integrity.md): the caller — the
  // add-community skill or Studio, which already read the repository tree —
  // supplies the pinned commit and digest; an unpinned community item is
  // refused rather than written.
  sourceRevision: string;
  contentDigest: string;
  pluginSource?: RegistryItem["pluginSource"];
  marketplaceRef?: RegistryItem["marketplaceRef"];
  license?: RegistryItem["license"];
}

export interface FileEdit {
  /** Relative to the item directory; may not leave it. */
  path: string;
  content: string;
}

/** Fields an update may change — identity and provenance are not among them. */
export type UpdatePatch = Partial<Omit<RegistryItem, "slug" | "type" | "sourceType" | "contentHash" | "label">> & {
  /**
   * A slug sets the label, `null` clears it, and an absent key leaves it alone.
   * `null` rather than `undefined` because an operation travels as JSON, which
   * drops undefined keys — the clear would arrive as "no change".
   */
  label?: string | null;
};

export interface UpdateOp {
  v: 1;
  kind: "update";
  type: ComponentType;
  slug: string;
  expectedHash: string;
  patch: UpdatePatch;
  contentEdits?: FileEdit[];
}

export interface RemoveOp {
  v: 1;
  kind: "remove";
  type: ComponentType;
  slug: string;
  sourceType: SourceType;
  expectedHash: string;
}

/**
 * Replace the whole label catalogue in one transaction. It has no `(type, slug)`
 * key because it acts on `registry/labels.json`, not on an item — and it refuses
 * to drop a label items still carry, naming them.
 */
export interface SetLabelsOp {
  v: 1;
  kind: "set-labels";
  labels: LabelDefinition[];
}

export type RegistryOp = AddLocalOp | AddRemoteOp | UpdateOp | RemoveOp | SetLabelsOp;

export interface OpResult {
  kind: RegistryOp["kind"];
  /** The item the operation acted on. Absent for `set-labels`, which acts on the catalogue. */
  type?: ComponentType;
  slug?: string;
  /** The item as it now is on disk; null after a remove, and for `set-labels`. */
  item: RegistryItem | null;
  /** The catalogue as it now is on disk. `set-labels` only. */
  labels?: LabelDefinition[];
}
