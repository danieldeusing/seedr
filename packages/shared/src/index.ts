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
  contentHash?: string;
  marketplace?: string;
  author?: Author;
  externalUrl?: string;
  updatedAt?: string;
  contents?: PluginContents;
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
