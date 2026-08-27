import { create } from "zustand";
import { cancelProcess } from "@/api/agent";
import { batchedLog, type LogLine } from "@/core/logLines";
import { runAgentJob } from "@/api/agentJob";
import { useAgentSettings } from "@/features/settings/agentSettings";
import { modelFor } from "@/features/settings/jobModels";
import type { JobCapability } from "@/features/author/adapters";
import type { ChangedPath } from "@/api/git";

/**
 * Publishing is the one job Studio does not do itself. Committing is mechanical,
 * but getting a commit onto several branches is not: it means fetching, pulling,
 * noticing a conflict and stopping when the conflict is not safe to resolve.
 * So Studio states the rules and the targets, and a coding agent carries it out
 * with git and nothing else — the machine's own git config, credentials and
 * hooks, exactly as in the terminal.
 */
export const PUBLISH_TASK = "git-publish";

/** Read and edit the worktree, and run git. No package manager, no network fetch. */
export const PUBLISH_JOB_CAPABILITIES: JobCapability[] = ["read", "edit", "search", "shell:git"];

/**
 * The repo's standing git rules (.agents/rules/git-workflow.md), restated for an
 * agent that starts with no memory of them: they are the difference between a
 * second branch getting the same commit and getting a divergent copy of it.
 */
const RULES = [
  "Never use --no-verify: if a hook blocks the commit, fix what it reports.",
  "Never cherry-pick between branches. To put a commit on another branch, check that branch out and merge the source branch into it, so the SHA stays the same.",
  "Never amend or force-push a commit that is already pushed; add a new commit instead.",
  "Pull before pushing, and push each target branch only after its merge is clean.",
  "If a conflict is not safe to resolve, stop and report the files — do not guess.",
];

export interface PublishPlan {
  /** The branch that is checked out, where the commit is made. */
  source: string;
  targets: string[];
  message: string;
  notes: string;
  changes: ChangedPath[];
}

export function publishPrompt(plan: PublishPlan): string {
  const others = plan.targets.filter((branch) => branch !== plan.source);
  return [
    `Commit everything in this seedr checkout on the branch that is checked out (${plan.source}) and push it${others.length > 0 ? `, then bring it to: ${others.join(", ")}` : ""}.`,
    plan.message.trim() ? `Commit message: ${plan.message.trim()}` : "Write the commit message yourself, in the style of this repository's recent history.",
    plan.notes.trim(),
    `Rules that hold here:\n${RULES.map((rule) => `- ${rule}`).join("\n")}`,
    `Start with git status and git branch --show-current, and confirm the ${plan.changes.length} changed path(s) are the ones you are committing. End on ${plan.source}.`,
    "Finish with a final line of exactly `PUBLISHED <branch>[, <branch>...]`, or `STOPPED <one line saying why>` if you did not push everything.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type PublishVerdict = { kind: "published"; branches: string[] } | { kind: "stopped"; reason: string } | { kind: "unclear"; text: string };

export function readVerdict(text: string): PublishVerdict {
  const published = /^PUBLISHED\s+(.+)$/m.exec(text);
  if (published?.[1]) return { kind: "published", branches: published[1].split(",").map((branch) => branch.trim()).filter(Boolean) };
  const stopped = /^STOPPED\s+(.+)$/m.exec(text);
  if (stopped?.[1]) return { kind: "stopped", reason: stopped[1].trim() };
  return { kind: "unclear", text };
}

interface PublishState {
  phase: "idle" | "running" | "done";
  log: LogLine[];
  verdict: PublishVerdict | null;
  error: string | null;
  run(plan: PublishPlan): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
}

// A long job scrolled its own beginning away at 300.
const LOG_CAP = 1000;

/**
 * Lines from a running job, coalesced to one store update a frame. Per line,
 * each of these was a render of the whole panel.
 */
const collectLog = (set: (partial: { log: LogLine[] }) => void, current: () => LogLine[]) =>
  batchedLog((batch) => set({ log: [...current(), ...batch].slice(-LOG_CAP) }));


export const usePublish = create<PublishState>((set, get) => ({
  phase: "idle",
  log: [],
  verdict: null,
  error: null,

  async run(plan) {
    set({ phase: "running", log: [], verdict: null, error: null });
    try {
      const outcome = await runAgentJob({
        taskId: PUBLISH_TASK,
        prompt: publishPrompt(plan),
        capabilities: PUBLISH_JOB_CAPABILITIES,
        model: modelFor(useAgentSettings.getState().preferred, "publish"),
        onEvent: collectLog(set, () => get().log),
      });
      if (outcome.cancelled) {
        set({ phase: "idle", error: null });
        return;
      }
      if (!outcome.ok) {
        set({ phase: "idle", error: outcome.denials.length > 0 ? `${outcome.text} (it asked for ${outcome.denials.join(", ")}, which it is not allowed)` : outcome.text });
        return;
      }
      set({ phase: "done", verdict: readVerdict(outcome.text) });
    } catch (error) {
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  async cancel() {
    if (get().phase === "running") await cancelProcess(PUBLISH_TASK);
  },

  reset() {
    set({ phase: "idle", log: [], verdict: null, error: null });
  },
}));
