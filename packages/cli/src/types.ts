// Re-export shared types
export type {
  CanonicalCodingAgent,
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

export interface ContentTypeConfig {
  /**
   * Relative path from the agent root (e.g. "skills"). The only field anything
   * reads — `getContentPath` is the sole consumer. Layout facts that looked
   * configurable here (extension, structure, mergeTarget, mergeField) were
   * never read: each handler owns its own format, so the table said one thing
   * and the code did another.
   */
  path: string;
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
