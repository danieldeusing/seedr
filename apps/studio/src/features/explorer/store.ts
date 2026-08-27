import { create } from "zustand";
import type { ComponentType } from "@seedr/shared";
import { fs } from "@/api/fs";
import { defaultRepo, getRepo, pickRepo, setDefaultRepo, type RepoInfo } from "@/api/repo";
import { allSourceStatuses, setOpsCheckout } from "@/api/registryCli";
import { useAuthorSettings } from "@/features/settings/authorSettings";
import { usePrePrompts } from "@/features/settings/prePrompts";

/**
 * Tell the rest of the app which checkout is open: which one operations act on
 * and whether it can run its own CLI (a checkout without one borrows the default
 * checkout's), and which one the per-repository settings belong to.
 *
 * Author and pre-prompts are per-repository because a fork is a different
 * project: its items are credited to someone else, and a pre-prompt naming a
 * skill is only right where that skill exists.
 */
const openCheckout = (repo: RepoInfo): void => {
  setOpsCheckout({ root: repo.root, hasOps: repo.hasOps });
  useAuthorSettings.getState().forRepo(repo.root);
  usePrePrompts.getState().forRepo(repo.root);
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
   * `type/slug`. Read in one run beside the registry, so the explorer can mark a
   * whole list without a process per row.
   */
  sourceStates: Record<string, string>;
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
  clearRepoError(): void;
  /** Record a checkout as the default. Resolves to an error, or null. */
  makeRepoDefault(path: string): Promise<string | null>;
  refresh(): Promise<void>;
  /** Re-read where every item stands against its source folder. */
  checkSources(): Promise<void>;
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

export const useStudio = create<StudioState>((set, get) => ({
  repo: null,
  sourceStates: {},
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
      set({ repo, toolingRepo: await borrowedTooling(repo) });
      await get().refresh();
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
      openCheckout(repo);
      set({ repo, selected: null, repoError: null, toolingRepo: await borrowedTooling(repo) });
      await get().refresh();
      await watch(get().refresh);
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

  async checkSources() {
    // Nothing watches the source folders: they are outside the checkout, and the
    // host refuses every path that is. So this is asked for, not pushed.
    if (!get().repo) return;
    const statuses = await allSourceStatuses().catch(() => []);
    set({ sourceStates: Object.fromEntries(statuses.map((status) => [`${status.type}/${status.slug}`, status.state])) });
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
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  select(selected) {
    set({ selected });
  },
}));

export const selectedItem = (state: StudioState): StudioItem | null =>
  state.selected ? (state.items.find((i) => i.type === state.selected?.type && i.slug === state.selected?.slug) ?? null) : null;
