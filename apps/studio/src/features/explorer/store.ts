import { create } from "zustand";
import type { ComponentType } from "@seedr/shared";
import type { SourceStatus } from "@seedr/registry-ops/pure";
import { fs } from "@/api/fs";
import { forgetRepo, rememberRepo } from "./repoHistory";
import { defaultRepo, getRepo, openRepoAt, pickRepo, setDefaultRepo, type RepoInfo } from "@/api/repo";
import { allSourceStatuses, setOpsCheckout, upstreamStatuses, type UpstreamStatus } from "@/api/registryCli";
import { gitRemoteState, gitSummary, type RemoteState } from "@/api/git";
import { useAuthorSettings } from "@/features/settings/authorSettings";
import { usePrePrompts } from "@/features/settings/prePrompts";
import { useJobModels } from "@/features/settings/jobModels";

/**
 * Tell the rest of the app which checkout is open: which one operations act on
 * and whether it can run its own CLI (a checkout without one borrows the default
 * checkout's), and which one the per-repository settings belong to.
 *
 * Author and pre-prompts are per-repository because a fork is a different
 * project: its items are credited to someone else, and a pre-prompt naming a
 * skill is only right where that skill exists.
 */
/**
 * How long an answer stands before focus is allowed to ask again.
 *
 * Short on purpose. It is there to stop a storm — alt-tabbing spawns a process
 * each time — not to cache: the case that matters is editing the file and coming
 * straight back, and a long window would answer that one with stale news.
 */
const CHECK_FRESH_MS = 2_000;
/**
 * A fetch is a network round trip, and the question it answers — has another
 * host pushed — does not change second to second. Long enough that returning to
 * the window does not fetch every time, short enough that a session left open
 * across an afternoon notices.
 */
const REMOTE_FRESH_MS = 5 * 60_000;

const openCheckout = (repo: RepoInfo): void => {
  setOpsCheckout({ root: repo.root, hasOps: repo.hasOps });
  useAuthorSettings.getState().forRepo(repo.root);
  usePrePrompts.getState().forRepo(repo.root);
  useJobModels.getState().forRepo(repo.root);
};

/**
 * The checkout whose operations CLI this one borrows, when it has none of its
 * own. Null when it does not need to borrow, or when there is nothing to borrow
 * from — in which case the registry can be read but not changed.
 */
async function borrowedTooling(repo: RepoInfo): Promise<RepoInfo | null> {
  if (repo.hasOps) return null;
  const home = await defaultRepo().catch(() => null);
  return home?.hasOps ? home : null;
}
import { onRegistryChanged, watchRegistry } from "@/api/watch";
import { loadRegistry, type StudioItem } from "./registry";

export interface Selection {
  type: ComponentType;
  slug: string;
}

interface StudioState {
  repo: RepoInfo | null;
  /**
   * Where each item stands against the folder it was copied from, keyed
   * `type/slug` — the whole answer, not just the state, so the detail panel
   * reads it here rather than spawning a second process to ask again.
   */
  sourceStates: Record<string, SourceStatus>;
  /** Why the marks are missing, when they are. Never silently absent. */
  sourceCheckError: string | null;
  /** When the last source check finished, and whether one is running. In the
   * store rather than a module variable so it resets with everything else. */
  sourceCheckedAt: number;
  sourceChecking: boolean;
  /**
   * Where each synced item stands against the repository the sync copies it
   * from, keyed `type/slug`. Empty until the button is pressed: this reaches
   * GitHub, so nothing asks it unprompted.
   */
  upstreamStates: Record<string, UpstreamStatus>;
  /** Why the upstream marks are missing, when they are. Never silently absent. */
  upstreamCheckError: string | null;
  /** When the last upstream check finished (0 until one ran), and whether one is running. */
  upstreamCheckedAt: number;
  upstreamChecking: boolean;
  /**
   * How many paths the worktree has uncommitted. Shown on the git button,
   * because every registry operation refuses to run while there are any — and
   * finding that out by pressing a button and reading a failure is late.
   */
  uncommitted: number;
  /**
   * Where the checkout stands against the branch it tracks, or null before the
   * first look. Studio runs on more than one host against the same registry, so
   * a checkout that is behind is showing a capability list that is out of date —
   * and nothing else in this app would say so.
   */
  remote: RemoteState | null;
  remoteChecking: boolean;
  /** When the last look finished, for the throttle in `checkRemote`. */
  remoteCheckedAt: number;
  items: StudioItem[];
  problems: string[];
  loading: boolean;
  error: string | null;
  /** Why the last repository pick failed — the watcher never clears this. */
  repoError: string | null;
  /** The checkout whose operations CLI the open one borrows, when it has none. */
  toolingRepo: RepoInfo | null;
  selected: Selection | null;
  /** Restore the host's selected repo on start, then load and watch it. */
  init(): Promise<void>;
  chooseRepo(): Promise<void>;
  /** Open a checkout already known by path — the switch menu's history. */
  openRepo(path: string): Promise<void>;
  clearRepoError(): void;
  /** Record a checkout as the default. Resolves to an error, or null. */
  makeRepoDefault(path: string): Promise<string | null>;
  refresh(): Promise<void>;
  /** Re-read where every item stands against its source folder. */
  checkSources(force?: boolean): Promise<void>;
  /** Ask every synced item's upstream whether it has moved on — the daily sync's check, by hand. */
  checkUpstream(): Promise<void>;
  /** Re-count the worktree's uncommitted paths. */
  countUncommitted(): Promise<void>;
  /** Fetch, and re-read how far ahead or behind the tracking branch this is. */
  checkRemote(force?: boolean): Promise<void>;
  /**
   * Bumped on every reload. A file's path does not change when its contents do,
   * so anything holding a path — the preview, above all — has no other way to
   * know that what it read is now stale.
   */
  revision: number;
  select(selection: Selection | null): void;
}

let unwatch: (() => void) | null = null;

async function watch(refresh: () => Promise<void>): Promise<void> {
  unwatch?.();
  await watchRegistry();
  unwatch = await onRegistryChanged(() => {
    void refresh();
  });
}

export const useStudio = create<StudioState>((set, get) => {
  /**
   * Everything that must happen once a checkout is settled on, however it was
   * chosen. Both entry points share it so a folder opened from the menu is not
   * quietly missing the watcher or the remote check that a picked one gets.
   */
  const adopt = async (repo: RepoInfo): Promise<void> => {
    openCheckout(repo);
    rememberRepo(repo.root);
    // The upstream answers were about the previous checkout, and unlike the
    // source marks nothing re-asks them on refresh.
    set({ repo, selected: null, repoError: null, remote: null, upstreamStates: {}, upstreamCheckError: null, upstreamCheckedAt: 0, toolingRepo: await borrowedTooling(repo) });
    await useStudio.getState().refresh();
    void useStudio.getState().checkRemote(true);
    await watch(useStudio.getState().refresh);
  };

  return {
  repo: null,
  sourceStates: {},
  sourceCheckError: null,
  sourceCheckedAt: 0,
  sourceChecking: false,
  upstreamStates: {},
  upstreamCheckError: null,
  upstreamCheckedAt: 0,
  upstreamChecking: false,
  uncommitted: 0,
  remote: null,
  remoteChecking: false,
  remoteCheckedAt: 0,
  items: [],
  problems: [],
  loading: false,
  error: null,
  repoError: null,
  revision: 0,
  toolingRepo: null,
  selected: null,

  async init() {
    try {
      const repo = await getRepo();
      if (!repo) return;
      openCheckout(repo);
      // The checkout restored on start belongs in the history too — otherwise
      // the one you use most is the one the menu never lists.
      rememberRepo(repo.root);
      set({ repo, toolingRepo: await borrowedTooling(repo) });
      await get().refresh();
      void get().checkRemote(true);
      await watch(get().refresh);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  clearRepoError() {
    set({ repoError: null });
  },

  async chooseRepo() {
    try {
      const repo = await pickRepo();
      if (!repo) return;
      await adopt(repo);
    } catch (error) {
      // Kept apart from `error`: the registry watcher refreshes on its own and
      // clears what it reported, and a folder it was never pointed at is not
      // its news to clear.
      set({ repoError: (error as Error).message });
    }
  },

  async makeRepoDefault(path) {
    try {
      // The host answers with the *open* checkout, whose isDefault may have
      // changed in either direction by naming another folder as home.
      const repo = await setDefaultRepo(path);
      openCheckout(repo);
      set({ repo });
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  },

  async checkSources(force = false) {
    // Nothing watches the source folders: they are outside the checkout, and the
    // host refuses every path that is. So this is asked for, not pushed.
    //
    // Each ask is a process: `npx tsx registry-op.ts`, measured at 440 ms and a
    // 107 MB peak, nearly all of it Node and tsx starting up rather than the
    // work. Focus fires on every alt-tab, so asking again within a few seconds
    // buys a fresh answer to a question whose subject has not moved. Pressing
    // the button says otherwise, and forces it.
    if (!get().repo || get().sourceChecking) return;
    if (!force && Date.now() - get().sourceCheckedAt < CHECK_FRESH_MS) return;
    set({ sourceChecking: true });
    try {
      const statuses = await allSourceStatuses();
      set({ sourceCheckError: null, sourceStates: Object.fromEntries(statuses.map((status) => [`${status.type}/${status.slug}`, status])) });
    } catch (error) {
      // Said out loud rather than swallowed. Swallowing it cost an afternoon:
      // a checkout whose CLI predates the batch command answers "unknown type",
      // and an empty marker column looks exactly like nothing being out of sync.
      set({ sourceStates: {}, sourceCheckError: (error as Error).message });
    } finally {
      set({ sourceChecking: false, sourceCheckedAt: Date.now() });
    }
  },

  async checkUpstream() {
    // Manual on purpose, with no freshness window: every ask reaches GitHub once
    // per upstream repository, and when that is worth doing is the user's call.
    if (!get().repo || get().upstreamChecking) return;
    set({ upstreamChecking: true });
    try {
      const { items } = await upstreamStatuses();
      set({ upstreamCheckError: null, upstreamStates: Object.fromEntries(items.map((status) => [`${status.type}/${status.slug}`, status])) });
    } catch (error) {
      // Said out loud, as with the source check: a checkout whose CLI predates
      // the command, or GitHub refusing, must not look like everything current.
      set({ upstreamStates: {}, upstreamCheckError: (error as Error).message });
    } finally {
      set({ upstreamChecking: false, upstreamCheckedAt: Date.now() });
    }
  },

  async countUncommitted() {
    if (!get().repo) return;
    // A checkout with no git at all is not an error here; it just has nothing
    // uncommitted, and the operations will say so in their own words.
    const summary = await gitSummary().catch(() => null);
    set({ uncommitted: summary?.changes.length ?? 0 });
  },

  async openRepo(path) {
    try {
      await adopt(await openRepoAt(path));
    } catch (error) {
      // A remembered path can be renamed, moved, or stop being a checkout. It is
      // dropped rather than left in the menu to fail again the same way.
      forgetRepo(path);
      set({ repoError: (error as Error).message });
    }
  },

  async checkRemote(force = false) {
    // Deliberately NOT part of `refresh()`. The watcher calls that on every file
    // event, and this one reaches the network: riding along would turn a burst
    // of saves into a burst of fetches. It runs when the app opens a checkout,
    // and when asked.
    if (!get().repo || get().remoteChecking) return;
    if (!force && Date.now() - get().remoteCheckedAt < REMOTE_FRESH_MS) return;
    set({ remoteChecking: true });
    try {
      set({ remote: await gitRemoteState() });
    } catch {
      // A checkout with no git at all is not an error here — it simply has no
      // upstream, which is what a null remote already says.
      set({ remote: null });
    } finally {
      set({ remoteChecking: false, remoteCheckedAt: Date.now() });
    }
  },

  async refresh() {
    const repo = get().repo;
    if (!repo) return;
    set({ loading: true, error: null });
    try {
      const { items, problems } = await loadRegistry(fs, repo.registryDir);
      const { selected } = get();
      const stillThere = selected && items.some((i) => i.type === selected.type && i.slug === selected.slug);
      set({ items, problems, loading: false, selected: stillThere ? selected : null, revision: get().revision + 1 });
      void get().checkSources();
      void get().countUncommitted();
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  select(selected) {
    set({ selected });
  },
  };
});

export const selectedItem = (state: StudioState): StudioItem | null =>
  state.selected ? (state.items.find((i) => i.type === state.selected?.type && i.slug === state.selected?.slug) ?? null) : null;
