import type { Author, CodingAgent, ComponentType, HookTrigger, PluginType, RegistryItem, ScopeType, SourceType } from "@seedr/shared";

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
  contents?: RegistryItem["contents"];
}

export interface FileEdit {
  /** Relative to the item directory; may not leave it. */
  path: string;
  content: string;
}

/** Fields an update may change — identity and provenance are not among them. */
export type UpdatePatch = Partial<Omit<RegistryItem, "slug" | "type" | "sourceType" | "contentHash">>;

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

export type RegistryOp = AddLocalOp | AddRemoteOp | UpdateOp | RemoveOp;

export interface OpResult {
  kind: RegistryOp["kind"];
  type: ComponentType;
  slug: string;
  /** The item as it now is on disk, or null after a remove. */
  item: RegistryItem | null;
}
