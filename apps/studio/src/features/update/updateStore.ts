import { create } from "zustand";
import type { CodingAgent, ComponentType, FileTreeNode, ScopeType } from "@seedr/shared";
import { CANONICAL_AGENTS, canonicalAgents, parseOp, validateItem, type UpdateOp, type ValidationError } from "@seedr/registry-ops/pure";
import { fs } from "@/api/fs";
import { itemHash, runRegistryOp, type RegistryOpOutcome } from "@/api/registryCli";
import { draftWithClaude, probeClaude, type AdapterProbe } from "@/features/author/claudeAdapter";
import { prePromptFor } from "@/features/settings/prePrompts";
import { MAX_DIGEST_CHARS } from "@/features/author/metadataContract";
import { loadFileTree, type StudioItem } from "@/features/explorer/registry";

/**
 * Update a first-party item's metadata (plan §7, `update-item`): slug, type and
 * source type cannot change; synced items are refused by the operation itself
 * because the next sync would overwrite them.
 */
export interface UpdateForm {
  name: string;
  /** Context for the redraft; prefilled from settings → pre-prompts for this type. */
  prompt: string;
  description: string;
  longDescription: string;
  compatibility: CodingAgent[];
  targetScope: ScopeType | "";
}

interface UpdateState {
  target: StudioItem | null;
  /** The item's state hash from the moment the form opened — the whole editing
   * session is guarded, so an edit landed elsewhere in between refuses to apply. */
  expectedHash: string | null;
  form: UpdateForm;
  probe: AdapterProbe | null;
  phase: "idle" | "drafting" | "applying" | "done";
  draftErrors: string[];
  error: string | null;
  outcome: RegistryOpOutcome | null;
  start(item: StudioItem): Promise<void>;
  setField<K extends keyof UpdateForm>(field: K, value: UpdateForm[K]): void;
  toggleAgent(agent: CodingAgent): void;
  redraft(): Promise<void>;
  apply(): Promise<void>;
  reset(): void;
}

export const updateRefusal = (item: StudioItem): string | null =>
  item.item.sourceType === "toolr" ? null : `${item.item.sourceType ?? "synced"} items are refreshed by the sync — edit them upstream`;

const formFor = (item: StudioItem): UpdateForm => ({
  name: item.item.name ?? "",
  prompt: prePromptFor(item.type, "update"),
  description: item.item.description ?? "",
  longDescription: item.item.longDescription ?? "",
  // a stored `gemini` shows as antigravity; saving then writes the canonical id
  compatibility: canonicalAgents(item.item.compatibility ?? []),
  targetScope: item.item.targetScope ?? "",
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
  return patch;
}

export function formProblems(item: StudioItem, form: UpdateForm): ValidationError[] {
  return validateItem({ ...item.item, ...toPatch(item, form) }, { expectedType: item.type, expectedSlug: item.slug });
}

/** Read the item's own text files through the scoped filesystem, for the redraft digest. */
async function readItemFiles(dir: string, nodes: FileTreeNode[], prefix = ""): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let budget = MAX_DIGEST_CHARS;
  for (const node of nodes) {
    const rel = `${prefix}${node.name}`;
    if (node.type === "directory") {
      Object.assign(files, await readItemFiles(dir, node.children ?? [], `${rel}/`));
      continue;
    }
    if (budget <= 0) break;
    try {
      const text = await fs.readText(`${dir}/${rel}`);
      files[rel] = text.slice(0, budget);
      budget -= text.length;
    } catch {
      // binary or oversized: the host refused it; leave it out of the digest
    }
  }
  return files;
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

  async start(item) {
    set({ target: item, expectedHash: null, form: formFor(item), phase: "idle", draftErrors: [], error: updateRefusal(item), outcome: null });
    if (!get().probe) set({ probe: await probeClaude() });
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

  async redraft() {
    const { target, probe, form } = get();
    if (!target) return;
    if (!probe?.available) {
      set({ draftErrors: [probe?.diagnostic ?? "no agent available"] });
      return;
    }
    set({ phase: "drafting", draftErrors: [] });
    try {
      const files = await readItemFiles(target.dir, await loadFileTree(fs, target.dir));
      const result = await draftWithClaude({ type: target.type, slug: target.slug, name: form.name, compatibility: form.compatibility, files, notes: form.prompt }, undefined, `update-draft-${target.slug}`);
      if (result.ok) set({ form: { ...get().form, description: result.draft.description, longDescription: result.draft.longDescription }, phase: "idle" });
      else set({ draftErrors: result.errors, phase: "idle" });
    } catch (error) {
      set({ draftErrors: [(error as Error).message], phase: "idle" });
    }
  },

  async apply() {
    const { target, form } = get();
    if (!target) return;
    const refusal = updateRefusal(target);
    if (refusal) {
      set({ error: refusal });
      return;
    }
    const patch = toPatch(target, form);
    if (Object.keys(patch).length === 0) {
      set({ error: "nothing changed" });
      return;
    }
    if (formProblems(target, form).length > 0) {
      set({ error: "fix the highlighted fields first" });
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

  reset() {
    set({ target: null, phase: "idle", draftErrors: [], error: null, outcome: null });
  },
}));
