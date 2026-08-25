import { create } from "zustand";
import type { ComponentType } from "@seedr/shared";
import { fs } from "@/api/fs";
import { getRepo, pickRepo, setDefaultRepo, type RepoInfo } from "@/api/repo";
import { onRegistryChanged, watchRegistry } from "@/api/watch";
import { loadRegistry, type StudioItem } from "./registry";

export interface Selection {
  type: ComponentType;
  slug: string;
}

interface StudioState {
  repo: RepoInfo | null;
  items: StudioItem[];
  problems: string[];
  loading: boolean;
  error: string | null;
  selected: Selection | null;
  /** Restore the host's selected repo on start, then load and watch it. */
  init(): Promise<void>;
  chooseRepo(): Promise<void>;
  /** Make the open checkout the one Studio calls home. */
  makeRepoDefault(): Promise<void>;
  refresh(): Promise<void>;
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
  items: [],
  problems: [],
  loading: false,
  error: null,
  selected: null,

  async init() {
    try {
      const repo = await getRepo();
      if (!repo) return;
      set({ repo });
      await get().refresh();
      await watch(get().refresh);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async chooseRepo() {
    try {
      const repo = await pickRepo();
      if (!repo) return;
      set({ repo, selected: null, error: null });
      await get().refresh();
      await watch(get().refresh);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async makeRepoDefault() {
    try {
      set({ repo: await setDefaultRepo() });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async refresh() {
    set({ loading: true, error: null });
    try {
      const { items, problems } = await loadRegistry(fs);
      const { selected } = get();
      const stillThere = selected && items.some((i) => i.type === selected.type && i.slug === selected.slug);
      set({ items, problems, loading: false, selected: stillThere ? selected : null });
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
