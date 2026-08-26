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
  /**
   * Whether `scripts/registry-op.ts` is in this checkout. Without it the
   * registry can be read, searched and previewed but not changed, because every
   * mutation runs through that script as a transaction.
   */
  hasOps: boolean;
}

/** Opens the folder picker; `null` when the user cancelled. */
export const pickRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("pick_repo");

export const getRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("get_repo");

/** The checkout Studio treats as home, if one has been recorded. */
export const defaultRepo = (): Promise<string | null> => invoke<string | null>("default_repo");

/** Records a checkout as the default; answers with the open one, whose isDefault may have changed. */
export const setDefaultRepo = (path: string): Promise<RepoInfo> => invoke<RepoInfo>("set_default_repo", { path });

