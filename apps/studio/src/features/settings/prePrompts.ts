import { create } from "zustand";
import type { ComponentType } from "@seedr/shared";
import { ALL_TYPES } from "@seedr/registry-ops/pure";
import { readRepoScoped, writeRepoScoped } from "./repoScoped";

/**
 * Standing context for the coding agent, per capability type and per job: what
 * it should always be told when authoring or editing a skill, a hook, a plugin.
 * The add and edit dialogs show it and send it ahead of the run's own prompt, so
 * "always use the skill-creator skill" is configured once, not retyped.
 */
export type PrePromptJob = "add" | "update";

export type PrePrompts = Record<ComponentType, Record<PrePromptJob, string>>;

const STORAGE_KEY = "studio-pre-prompts";

export const emptyPrePrompts = (): PrePrompts =>
  Object.fromEntries(ALL_TYPES.map((type) => [type, { add: "", update: "" }])) as PrePrompts;

const load = (root: string): PrePrompts => {
  const prompts = emptyPrePrompts();
  try {
    const parsed: unknown = JSON.parse(readRepoScoped(STORAGE_KEY, root) ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return prompts;
    for (const type of ALL_TYPES) {
      const stored = (parsed as Record<string, unknown>)[type];
      if (typeof stored !== "object" || stored === null) continue;
      for (const job of ["add", "update"] as const) {
        const text = (stored as Record<string, unknown>)[job];
        if (typeof text === "string") prompts[type][job] = text;
      }
    }
  } catch {
    // A corrupt entry is not worth a broken settings page; the defaults stand.
  }
  return prompts;
};

interface PrePromptState {
  prompts: PrePrompts;
  /** The checkout these belong to; "" before one is open. */
  root: string;
  /** Point the store at a checkout — its own prompts, or the machine-wide ones. */
  forRepo(root: string): void;
  set(type: ComponentType, job: PrePromptJob, text: string): void;
}

export const usePrePrompts = create<PrePromptState>((set, get) => ({
  prompts: load(""),
  root: "",
  forRepo(root) {
    set({ root, prompts: load(root) });
  },
  set(type, job, text) {
    const prompts: PrePrompts = { ...get().prompts, [type]: { ...get().prompts[type], [job]: text } };
    writeRepoScoped(STORAGE_KEY, get().root, JSON.stringify(prompts));
    set({ prompts });
  },
}));

/** The configured pre-prompt for one job, or "" — read outside React too. */
export const prePromptFor = (type: ComponentType, job: PrePromptJob): string => usePrePrompts.getState().prompts[type][job];
