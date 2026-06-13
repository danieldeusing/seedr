import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { ComponentType, RegistryItem } from "@seedr/shared";

export interface InstallResult {
  agent: CodingAgent;
  success: boolean;
  path: string;
  error?: string;
}

export interface ContentHandler {
  readonly type: ComponentType;

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
}
