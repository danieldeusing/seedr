import { create } from "zustand";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { readRepoScoped, writeRepoScoped } from "./repoScoped";

/**
 * Which model each job runs on, per coding agent.
 *
 * Per job, because the jobs are not alike: drafting a capability from a folder of
 * source is a reading task worth a large model, and committing what is already
 * written and pushing it is not. Empty means the CLI's own default, which is the
 * right answer until someone has a reason to say otherwise.
 *
 * Keyed by agent as well as job, because a model id belongs to one CLI —
 * `claude-opus-5` means nothing to codex — so switching agents must not carry a
 * model across that the new one would refuse.
 */
export type ModelJob = "add" | "update" | "publish";

export const MODEL_JOBS: { job: ModelJob; label: string; hint: string }[] = [
  { job: "add", label: "add", hint: "Drafting descriptions and authoring a capability — the most reading, and the most writing." },
  { job: "update", label: "update", hint: "Changing a capability that already exists, against content it can read." },
  { job: "publish", label: "publish", hint: "Committing what is already written and getting it onto branches. Mechanical." },
];

const STORAGE_KEY = "studio-job-models";
const keyOf = (agent: string, job: ModelJob) => `${agent}/${job}`;

const load = (root: string): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(readRepoScoped(STORAGE_KEY, root) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
};

interface JobModelState {
  chosen: Record<string, string>;
  root: string;
  forRepo(root: string): void;
  set(agent: CanonicalCodingAgent, job: ModelJob, model: string): void;
}

export const useJobModels = create<JobModelState>((set, get) => ({
  chosen: load(""),
  root: "",
  forRepo(root) {
    set({ root, chosen: load(root) });
  },
  set(agent, job, model) {
    const chosen = { ...get().chosen };
    if (model) chosen[keyOf(agent, job)] = model;
    else delete chosen[keyOf(agent, job)];
    writeRepoScoped(STORAGE_KEY, get().root, JSON.stringify(chosen));
    set({ chosen });
  },
}));

/** The model for one job, or "" for the CLI's default. Read outside React too. */
export const modelFor = (agent: CanonicalCodingAgent, job: ModelJob): string => useJobModels.getState().chosen[keyOf(agent, job)] ?? "";
