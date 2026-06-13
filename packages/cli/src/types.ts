// Re-export shared types
export type {
  CodingAgent,
  ComponentType,
  RegistryItem,
  RegistryManifest,
  RegistryManifestIndex,
  TypeManifest,
} from "@seedr/shared";

import type { ComponentType } from "@seedr/shared";

// CLI-only types
export type InstallScope = "project" | "user" | "local";

export type InstallMethod = "symlink" | "copy";

export type ContentStructure = "directory" | "file" | "json-merge" | "plugin";

export interface ContentTypeConfig {
  /** Relative path from agent root (e.g., "skills", "agents") */
  path: string;
  /** File extension (e.g., ".md") */
  extension: string;
  /** How content is installed */
  structure: ContentStructure;
  /** Main file for directories (e.g., "SKILL.md") */
  mainFile?: string;
  /** For json-merge: target file to merge into */
  mergeTarget?: string;
  /** For json-merge: field to merge into (e.g., "hooks", "mcpServers") */
  mergeField?: string;
}

export interface CodingAgentConfig {
  /** Display name (e.g., "Claude Code") */
  name: string;
  /** Short identifier (e.g., "claude") */
  shortName: string;
  /** Project root directory (e.g., ".claude") */
  projectRoot: string;
  /** User root directory (e.g., "~/.claude") */
  userRoot: string;
  /** Content type configurations */
  contentTypes: Partial<Record<ComponentType, ContentTypeConfig>>;
}

export interface InstallOptions {
  skill?: string;
  agents?: string[] | "all";
  scope?: InstallScope;
  method?: InstallMethod;
  yes?: boolean;
  force?: boolean;
}

export interface InstalledItem {
  slug: string;
  type: string;
  agent: string;
  scope: InstallScope;
  method: InstallMethod;
  path: string;
  installedAt: string;
}
