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
/**
 * Effort is stored beside the model under its own key rather than as a second
 * map, so one write persists both and a repo carries one object. The suffix is
 * `#effort` because `/` already separates agent from job.
 */
const effortKeyOf = (agent: string, job: ModelJob) => `${agent}/${job}#effort`;

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
  setEffort(agent: CanonicalCodingAgent, job: ModelJob, effort: string): void;
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
    // A model change can strand an effort the new model does not accept —
    // codex offers `ultra` on two of seven — so the level is dropped and picked
    // again rather than sent to a CLI that will refuse it.
    delete chosen[effortKeyOf(agent, job)];
    writeRepoScoped(STORAGE_KEY, get().root, JSON.stringify(chosen));
    set({ chosen });
  },
  setEffort(agent, job, effort) {
    const chosen = { ...get().chosen };
    if (effort) chosen[effortKeyOf(agent, job)] = effort;
    else delete chosen[effortKeyOf(agent, job)];
    writeRepoScoped(STORAGE_KEY, get().root, JSON.stringify(chosen));
    set({ chosen });
  },
}));

/** The model for one job, or "" for the CLI's default. Read outside React too. */
export const modelFor = (agent: CanonicalCodingAgent, job: ModelJob): string => useJobModels.getState().chosen[keyOf(agent, job)] ?? "";

/** The reasoning effort for one job, or "" for the CLI's default. */
export const effortFor = (agent: CanonicalCodingAgent, job: ModelJob): string => useJobModels.getState().chosen[effortKeyOf(agent, job)] ?? "";

export { effortKeyOf };
