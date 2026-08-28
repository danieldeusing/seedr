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
  /**
   * The registry directory this checkout uses: `registry`, or whatever
   * `seedr.config.json` names. A fork points it at a directory of its own, and
   * that directory *replaces* `registry/` rather than adding to it — so this is
   * read, never assumed. Assumed, it showed a fork all of upstream's items.
   */
  registryDir: string;
}

/** Opens the folder picker; `null` when the user cancelled. */
export const pickRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("pick_repo");

export const getRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("get_repo");

/** The checkout Studio treats as home, if one has been recorded. */
export const defaultRepo = (): Promise<RepoInfo | null> => invoke<RepoInfo | null>("default_repo");

/** Records a checkout as the default; answers with the open one, whose isDefault may have changed. */
export const setDefaultRepo = (path: string): Promise<RepoInfo> => invoke<RepoInfo>("set_default_repo", { path });

/**
 * Open a checkout by path — the switch-repo menu's history and default entries.
 * The host puts it through the same check as a picked folder, so a path that has
 * been renamed or is no longer a checkout is refused rather than half-opened.
 */
export const openRepoAt = (path: string): Promise<RepoInfo> => invoke<RepoInfo>("open_repo_at", { path });

