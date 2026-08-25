import { invoke } from "@/core/lib/tauriInvoke";

/** What the host knows about the selected repository. */
export interface RepoInfo {
  /** Absolute path, for display only — every other call takes repo-relative paths. */
  root: string;
  name: string;
  /**
   * Whether this is the checkout Studio calls home: the first one it ever
   * opened, or the one last set as the default. The host answers this so the
   * webview never has to compare paths itself.
   */
  isDefault: boolean;
}

/** Opens the folder picker; `null` when the user cancelled. */
export const pickRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("pick_repo");

export const getRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("get_repo");

/** Makes the open checkout the default one, which is what silences the alert. */
export const setDefaultRepo = (): Promise<RepoInfo> => invoke<RepoInfo>("set_default_repo");
