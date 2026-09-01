import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { ComponentType, RegistryItem } from "@seedr/shared";

export interface InstallResult {
  agent: CodingAgent;
  success: boolean;
  path: string;
  error?: string;
}

/** One filesystem effect an install would have, as reported by `plan()`. */
export interface PlannedChange {
  /** The agent the change is for, or "shared" for a file several agents use. */
  agent: CodingAgent | "shared";
  kind: "create" | "modify" | "delete";
  /** Exact absolute path that would be touched. */
  path: string;
  /** What inside that path changes, e.g. the JSON key or TOML table. */
  detail?: string;
}

export interface ContentHandler {
  readonly type: ComponentType;

  /**
   * Whether `--method symlink` means anything for this type. Content that is
   * merged into a configuration file, or handed to another tool's installer,
   * has nothing to link: the flag is validated and echoed, so a handler that
   * ignores it has to say so rather than let the user believe it took effect.
   * Absent means the handler honours the method.
   */
  readonly honoursMethod?: boolean;

  /**
   * Install content for the specified agents.
   *
   * When `force` is false, an existing destination must not be overwritten —
   * the handler returns a failed result instead.
   */
  install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]>;

  /**
   * Uninstall content for a specific agent.
   */
  uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean>;

  /**
   * List installed content for a specific agent.
   */
  listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]>;

  /**
   * Describe exactly which files `install` would create or modify, without
   * writing anything. Used for `--dry-run` and the interactive confirmation.
   */
  plan?(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    cwd: string
  ): Promise<PlannedChange[]>;
}
