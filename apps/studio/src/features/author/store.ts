import { create } from "zustand";
import type { CodingAgent, ComponentType, ScopeType } from "@seedr/shared";
import { CANONICAL_AGENTS, parseOp, validateItem, type AddLocalOp, type ValidationError } from "@seedr/registry-ops/pure";
import { cancelProcess, onProcessOutput, pickPath } from "@/api/agent";
import { repoIdentity, runRegistryOp, type RegistryOpOutcome } from "@/api/registryCli";
import { readSourceFiles } from "@/api/source";
import { draftWithClaude, probeClaude, type AdapterProbe } from "./claudeAdapter";

/** The fields the model must not guess (plan §7): the user fills these in. */
export interface AddLocalForm {
  sourcePath: string;
  type: ComponentType;
  slug: string;
  name: string;
  compatibility: CodingAgent[];
  targetScope: ScopeType | "";
  authorName: string;
  authorUrl: string;
  externalUrl: string;
  description: string;
  longDescription: string;
}

export type Phase = "idle" | "probing" | "drafting" | "applying" | "done";

interface AuthorState {
  form: AddLocalForm;
  probe: AdapterProbe | null;
  phase: Phase;
  draftErrors: string[];
  /** Capped live output of the running agent / operation. */
  log: string[];
  outcome: RegistryOpOutcome | null;
  error: string | null;
  setField<K extends keyof AddLocalForm>(field: K, value: AddLocalForm[K]): void;
  toggleAgent(agent: CodingAgent): void;
  chooseSource(): Promise<void>;
  /** Probe Claude and prefill author/externalUrl from the repo's identity. */
  prepare(): Promise<void>;
  draft(): Promise<void>;
  apply(): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
}

const LOG_CAP = 200;
const DRAFT_TASK = "author-draft";

const slugFromPath = (path: string): string => {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return (segments[segments.length - 1] ?? "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "");
};

const titleFromSlug = (slug: string): string => slug.split(/[-_.]/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");

export const emptyForm = (): AddLocalForm => ({
  sourcePath: "",
  type: "skill",
  slug: "",
  name: "",
  compatibility: ["claude"],
  targetScope: "",
  authorName: "",
  authorUrl: "",
  externalUrl: "",
  description: "",
  longDescription: "",
});

/** The operation the form describes, exactly as the CLI will receive it. */
export function toOp(form: AddLocalForm): AddLocalOp {
  return {
    v: 1,
    kind: "add-local",
    type: form.type,
    slug: form.slug.trim(),
    sourcePath: form.sourcePath,
    name: form.name.trim(),
    description: form.description.trim(),
    longDescription: form.longDescription.trim(),
    compatibility: form.compatibility,
    author: form.authorUrl.trim() ? { name: form.authorName.trim(), url: form.authorUrl.trim() } : { name: form.authorName.trim() },
    ...(form.externalUrl.trim() ? { externalUrl: form.externalUrl.trim() } : {}),
    ...(form.targetScope ? { targetScope: form.targetScope } : {}),
  };
}

/** What the one validator says about the item this form would produce. */
export function formProblems(form: AddLocalForm): ValidationError[] {
  const op = toOp(form);
  const problems = validateItem({
    slug: op.slug,
    name: op.name,
    type: op.type,
    description: op.description,
    longDescription: op.longDescription,
    compatibility: op.compatibility,
    sourceType: "toolr",
    author: op.author,
    ...(op.externalUrl ? { externalUrl: op.externalUrl } : {}),
    ...(op.targetScope ? { targetScope: op.targetScope } : {}),
  });
  if (!form.sourcePath) problems.unshift({ field: "sourcePath", message: "choose the file or folder to add" });
  return problems;
}

export const useAuthor = create<AuthorState>((set, get) => ({
  form: emptyForm(),
  probe: null,
  phase: "idle",
  draftErrors: [],
  log: [],
  outcome: null,
  error: null,

  setField(field, value) {
    set({ form: { ...get().form, [field]: value } });
  },

  toggleAgent(agent) {
    const { compatibility } = get().form;
    const next = compatibility.includes(agent) ? compatibility.filter((a) => a !== agent) : [...compatibility, agent];
    set({ form: { ...get().form, compatibility: CANONICAL_AGENTS.filter((a) => next.includes(a)) } });
  },

  async chooseSource() {
    const picked = await pickPath("folder");
    if (!picked) return;
    const { form } = get();
    const slug = form.slug || slugFromPath(picked);
    set({ form: { ...form, sourcePath: picked, slug, name: form.name || titleFromSlug(slug) } });
  },

  async prepare() {
    set({ phase: "probing", error: null });
    try {
      const [probe, identity] = await Promise.all([probeClaude(), repoIdentity().catch(() => null)]);
      const { form } = get();
      set({
        probe,
        phase: "idle",
        form: {
          ...form,
          authorName: form.authorName || identity?.authorName || "",
          authorUrl: form.authorUrl || (identity?.owner ? `https://github.com/${identity.owner}` : ""),
        },
      });
    } catch (error) {
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  async draft() {
    const { form, probe } = get();
    if (!probe?.available) {
      set({ draftErrors: [probe?.diagnostic ?? "no agent available"] });
      return;
    }
    if (!form.sourcePath) {
      set({ draftErrors: ["choose the source first"] });
      return;
    }
    set({ phase: "drafting", draftErrors: [], log: [], error: null });
    const unlisten = await onProcessOutput(`${DRAFT_TASK}-0`, (event) => set({ log: [...get().log.slice(-LOG_CAP + 1), event.line] }));
    try {
      const { files } = await readSourceFiles(form.sourcePath);
      const result = await draftWithClaude({ type: form.type, slug: form.slug, name: form.name, compatibility: form.compatibility, files }, undefined, DRAFT_TASK);
      if (result.ok) {
        set({ form: { ...get().form, description: result.draft.description, longDescription: result.draft.longDescription }, phase: "idle" });
      } else {
        set({ draftErrors: result.errors, phase: "idle" });
      }
    } catch (error) {
      set({ draftErrors: [(error as Error).message], phase: "idle" });
    } finally {
      unlisten();
    }
  },

  async apply() {
    const problems = formProblems(get().form);
    if (problems.length > 0) {
      set({ error: "fix the highlighted fields first" });
      return;
    }
    set({ phase: "applying", error: null, outcome: null });
    try {
      const outcome = await runRegistryOp(parseOp(toOp(get().form)));
      set({ phase: "done", outcome });
    } catch (error) {
      // The CLI already rolled back; the message says why.
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  async cancel() {
    if (get().phase === "drafting") {
      await cancelProcess(`${DRAFT_TASK}-0`);
      await cancelProcess(`${DRAFT_TASK}-1`);
    }
  },

  reset() {
    set({ form: emptyForm(), phase: "idle", draftErrors: [], log: [], outcome: null, error: null });
  },
}));
