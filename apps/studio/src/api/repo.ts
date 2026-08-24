import { invoke } from "@/core/lib/tauriInvoke";

/** What the host knows about the selected repository. */
export interface RepoInfo {
  /** Absolute path, for display only — every other call takes repo-relative paths. */
  root: string;
  name: string;
}

/** Opens the folder picker; `null` when the user cancelled. */
export const pickRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("pick_repo");

export const getRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("get_repo");
