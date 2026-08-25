import { create } from "zustand";
import type { CodingAgent, ComponentType, ScopeType } from "@seedr/shared";
import { CANONICAL_AGENTS, canonicalAgents, isFirstParty, parseOp, validateItem, type UpdateOp, type ValidationError } from "@seedr/registry-ops/pure";
import { cancelProcess } from "@/api/agent";
import { runAgentJob } from "@/api/agentJob";
import type { JobCapability } from "@/features/author/adapters";
import { itemHash, runRegistryOp, type RegistryOpOutcome } from "@/api/registryCli";
import { probeAgent, type AdapterProbe } from "@/features/author/claudeAdapter";
import { useAgentSettings } from "@/features/settings/agentSettings";
import { prePromptFor } from "@/features/settings/prePrompts";
import type { StudioItem } from "@/features/explorer/registry";

/**
 * Update a first-party item's metadata (plan §7, `update-item`): slug, type and
 * source type cannot change; synced items are refused by the operation itself
 * because the next sync would overwrite them.
 */
export interface UpdateForm {
  name: string;
  /**
   * What the agent should change about the capability itself. Prefilled from
   * settings → pre-prompts for this type. Empty means metadata only, applied as
   * a plain transaction; anything here makes this an agent job.
   */
  prompt: string;
  /** With a prompt: let the agent rewrite the descriptions from the new content. */
  refreshMeta: boolean;
  description: string;
  longDescription: string;
  compatibility: CodingAgent[];
  targetScope: ScopeType | "";
  /** A label slug from the checkout's catalogue, or "" for none. */
  label: string;
}

interface UpdateState {
  target: StudioItem | null;
  /** The item's state hash from the moment the form opened — the whole editing
   * session is guarded, so an edit landed elsewhere in between refuses to apply. */
  expectedHash: string | null;
  form: UpdateForm;
  probe: AdapterProbe | null;
  phase: "idle" | "applying" | "running" | "done";
  draftErrors: string[];
  error: string | null;
  outcome: RegistryOpOutcome | null;
  /** The agent's report, when the change went through a job. */
  jobReport: string | null;
  /** Capped live output of the running job. */
  log: string[];
  start(item: StudioItem): Promise<void>;
  setField<K extends keyof UpdateForm>(field: K, value: UpdateForm[K]): void;
  toggleAgent(agent: CodingAgent): void;
  apply(): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
}

/**
 * An update job edits the capability's own files and applies the metadata
 * through the operations CLI, which is the only thing allowed to write
 * `item.json`. No network, no `git`: this is an edit, not a publish.
 */
export const UPDATE_JOB_CAPABILITIES: JobCapability[] = ["read", "edit", "search", "skills", "shell:npx tsx scripts/registry-op.ts"];

const UPDATE_TASK = "update-job";
const LOG_CAP = 200;

/** The whole instruction for a prompt-driven update — the capability, then its metadata. */
export function updateJobPrompt(item: StudioItem, form: UpdateForm, patch: UpdateOp["patch"]): string {
  const fields = Object.entries(patch)
    .filter(([field]) => form.refreshMeta || (field !== "description" && field !== "longDescription"))
    .map(([field, value]) => `- ${field}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
  return [
    `Update the ${item.type} capability \`${item.slug}\` in this registry. Its files are in \`${item.dir}\`.`,
    form.prompt.trim(),
    fields.length > 0 ? `Set these fields on the item as well:\n${fields.join("\n")}` : null,
    form.refreshMeta
      ? "When the content has changed, rewrite `description` and `longDescription` to match it, following .agents/rules/registry-descriptions.md."
      : "Leave `description` and `longDescription` exactly as they are — they were written by hand.",
    "Edit content files directly, but change `item.json` only through `npx tsx scripts/registry-op.ts run --op -` as an `update` operation, whose `expectedHash` comes from `npx tsx scripts/registry-op.ts hash " +
      `${item.type} ${item.slug}\`.`,
    "Do not commit or push. Finish with a final line of exactly `UPDATED <type>/<slug>`.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const updateRefusal = (item: StudioItem): string | null =>
  isFirstParty(item.item.sourceType) ? null : `${item.item.sourceType ?? "synced"} items are refreshed by the sync — edit them upstream`;

const formFor = (item: StudioItem): UpdateForm => ({
  name: item.item.name ?? "",
  prompt: prePromptFor(item.type, "update"),
  refreshMeta: true,
  description: item.item.description ?? "",
  longDescription: item.item.longDescription ?? "",
  // a stored `gemini` shows as antigravity; saving then writes the canonical id
  compatibility: canonicalAgents(item.item.compatibility ?? []),
  targetScope: item.item.targetScope ?? "",
  label: item.item.label ?? "",
});

/** Only the fields that differ from the item on disk, so the patch says what changed. */
export function toPatch(item: StudioItem, form: UpdateForm): UpdateOp["patch"] {
  const patch: UpdateOp["patch"] = {};
  const differs = (next: string, stored: string | undefined) => next.trim() !== (stored ?? "").trim();
  if (differs(form.name, item.item.name)) patch.name = form.name.trim();
  if (differs(form.description, item.item.description)) patch.description = form.description.trim();
  if (differs(form.longDescription, item.item.longDescription)) patch.longDescription = form.longDescription.trim();
  if (form.compatibility.join(",") !== (item.item.compatibility ?? []).join(",")) patch.compatibility = form.compatibility;
  const scope = form.targetScope || undefined;
  if (scope !== item.item.targetScope) patch.targetScope = scope;
  const label = form.label || undefined;
  if (label !== item.item.label) patch.label = label;
  return patch;
}

export function formProblems(item: StudioItem, form: UpdateForm): ValidationError[] {
  return validateItem({ ...item.item, ...toPatch(item, form) }, { expectedType: item.type, expectedSlug: item.slug });
}

export const useUpdate = create<UpdateState>((set, get) => ({
  target: null,
  expectedHash: null,
  form: formFor({ type: "skill" as ComponentType, slug: "", dir: "", item: { slug: "", name: "", type: "skill", description: "", compatibility: [] }, errors: [] }),
  probe: null,
  phase: "idle",
  draftErrors: [],
  error: null,
  outcome: null,
  jobReport: null,
  log: [],

  async start(item) {
    set({ target: item, expectedHash: null, form: formFor(item), phase: "idle", draftErrors: [], error: updateRefusal(item), outcome: null, jobReport: null, log: [] });
    if (!get().probe) set({ probe: await probeAgent(useAgentSettings.getState().preferred) });
    if (updateRefusal(item)) return;
    try {
      set({ expectedHash: await itemHash(item.type, item.slug) });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  setField(field, value) {
    set({ form: { ...get().form, [field]: value } });
  },

  toggleAgent(agent) {
    const { compatibility } = get().form;
    const next = compatibility.includes(agent) ? compatibility.filter((a) => a !== agent) : [...compatibility, agent];
    set({ form: { ...get().form, compatibility: CANONICAL_AGENTS.filter((a) => next.includes(a)) } });
  },

  async apply() {
    const { target, form, probe } = get();
    if (!target) return;
    const refusal = updateRefusal(target);
    if (refusal) {
      set({ error: refusal });
      return;
    }
    const patch = toPatch(target, form);
    const asked = form.prompt.trim().length > 0;
    if (!asked && Object.keys(patch).length === 0) {
      set({ error: "nothing changed" });
      return;
    }
    if (formProblems(target, form).length > 0) {
      set({ error: "fix the highlighted fields first" });
      return;
    }
    // A prompt makes this a change to the capability itself, which only an agent
    // can make; the metadata edits ride along as instructions, so one writer
    // touches item.json.
    if (asked) {
      if (!probe?.available) {
        set({ error: probe?.diagnostic ?? "no coding agent available — see settings → coding agents" });
        return;
      }
      set({ phase: "running", error: null, draftErrors: [], log: [], jobReport: null });
      try {
        const outcome = await runAgentJob({
          taskId: UPDATE_TASK,
          prompt: updateJobPrompt(target, form, patch),
          capabilities: UPDATE_JOB_CAPABILITIES,
          onEvent: (event) => set({ log: [...get().log.slice(-LOG_CAP + 1), event.kind === "tool" ? `· ${event.text}` : event.text] }),
        });
        if (!outcome.ok) {
          set({ phase: "idle", error: outcome.denials.length > 0 ? `${outcome.text} (it asked for ${outcome.denials.join(", ")}, which it is not allowed)` : outcome.text });
          return;
        }
        set({ phase: "done", jobReport: outcome.text });
      } catch (error) {
        set({ phase: "idle", error: (error as Error).message });
      }
      return;
    }
    const expectedHash = get().expectedHash;
    if (!expectedHash) {
      set({ error: "the item's current state could not be read — reopen the form" });
      return;
    }
    set({ phase: "applying", error: null });
    try {
      const outcome = await runRegistryOp(parseOp({ v: 1, kind: "update", type: target.type, slug: target.slug, expectedHash, patch } satisfies UpdateOp));
      set({ phase: "done", outcome });
    } catch (error) {
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  async cancel() {
    if (get().phase === "running") await cancelProcess(UPDATE_TASK);
  },

  reset() {
    set({ target: null, phase: "idle", draftErrors: [], error: null, outcome: null, jobReport: null, log: [] });
  },
}));
