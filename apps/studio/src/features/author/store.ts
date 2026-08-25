import { create } from "zustand";
import type { CodingAgent, ComponentType, ScopeType } from "@seedr/shared";
import { ALL_TYPES, CANONICAL_AGENTS, parseOp, validateItem, type AddLocalOp, type ValidationError } from "@seedr/registry-ops/pure";
import { cancelProcess, onProcessOutput, pickPath } from "@/api/agent";
import { runAgentJob, type AgentJobResult } from "@/api/agentJob";
import { configuredAuthor } from "@/features/settings/authorSettings";
import { useAgentSettings } from "@/features/settings/agentSettings";
import { prePromptFor } from "@/features/settings/prePrompts";
import { repoIdentity, runRegistryOp } from "@/api/registryCli";
import { readSourceFiles } from "@/api/source";
import { draftWith, probeAgent, type AdapterProbe } from "./claudeAdapter";

/**
 * Where a capability's content comes from. A folder is copied by the
 * deterministic transaction; a repository and an agent-authored one are jobs the
 * coding agent does in the checkout, using this repo's own add skills.
 */
export type SourceKind = "folder" | "repo" | "agent";

/** The fields the model must not guess (plan §7): the user fills these in. */
export interface AddLocalForm {
  sourceKind: SourceKind;
  sourcePath: string;
  repoUrl: string;
  /** Extra context for the agent; prefilled from settings → pre-prompts. */
  prompt: string;
  /** Once the prompt is edited by hand, changing the type stops rewriting it. */
  promptTouched: boolean;
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

export type Phase = "idle" | "probing" | "drafting" | "applying" | "running" | "done";

/** What finished: a transaction with its changed paths, or a job with its report. */
export type AddResult =
  | { kind: "op"; type: ComponentType; slug: string; changedPaths: string[]; headBefore: string }
  | { kind: "job"; added: { type: ComponentType; slug: string } | null; text: string; denials: string[] };

interface AuthorState {
  form: AddLocalForm;
  probe: AdapterProbe | null;
  /** Settings' author, or what the checkout's remote says — the prefill to restore. */
  defaultAuthor: { name: string; url: string };
  phase: Phase;
  draftErrors: string[];
  /** Capped live output of the running agent / operation. */
  log: string[];
  result: AddResult | null;
  error: string | null;
  setField<K extends keyof AddLocalForm>(field: K, value: AddLocalForm[K]): void;
  setType(type: ComponentType): void;
  setSourceKind(kind: SourceKind): void;
  toggleAgent(agent: CodingAgent): void;
  chooseSource(): Promise<void>;
  /** Probe Claude and prefill author/externalUrl from the repo's identity. */
  prepare(): Promise<void>;
  draft(): Promise<void>;
  /** Add it: the transaction for a folder, the agent job for a repo or a prompt. */
  apply(): Promise<void>;
  runJob(): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
}

const LOG_CAP = 200;
const DRAFT_TASK = "author-draft";
const JOB_TASK = "author-job";

/**
 * Least privilege for an add job: read and write the checkout, look the source
 * repository up (the add-community skill is built on `gh api`), and run the
 * operations CLI — which is what actually mutates the registry, as a
 * transaction. No `git`, so a job cannot commit, and no unscoped shell.
 */
export const ADD_JOB_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "WebFetch", "Bash(gh api:*)", "Bash(npx tsx scripts/registry-op.ts:*)"];

/** The last line an add job must print, so Studio can open what was added. */
const ADDED_LINE = /^ADDED\s+([a-z]+)\/([A-Za-z0-9._-]+)$/m;

export function parseAdded(text: string): { type: ComponentType; slug: string } | null {
  const match = ADDED_LINE.exec(text);
  if (!match) return null;
  const [, type, slug] = match;
  return ALL_TYPES.includes(type as ComponentType) ? { type: type as ComponentType, slug: slug as string } : null;
}

/** Everything the user filled in that the agent should honour rather than derive. */
function hints(form: AddLocalForm): string {
  const lines = [
    `type: ${form.type}`,
    form.slug.trim() ? `slug: ${form.slug.trim()}` : null,
    form.name.trim() ? `name: ${form.name.trim()}` : null,
    `agents: ${form.compatibility.join(", ")}`,
    form.targetScope ? `default scope: ${form.targetScope}` : null,
    form.authorName.trim() && form.sourceKind === "agent" ? `author: ${form.authorName.trim()}` : null,
    form.description.trim() ? `description: ${form.description.trim()}` : null,
    form.longDescription.trim() ? `longDescription: ${form.longDescription.trim()}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * The whole instruction the agent receives. It names the repo's own skill for
 * the job, passes the user's pre-prompt through, and asks for one machine-
 * readable line back so Studio can select what was added.
 */
export function jobPrompt(form: AddLocalForm): string {
  const task =
    form.sourceKind === "repo"
      ? `/add-community ${form.repoUrl.trim()}`
      : `Author a new first-party ${form.type} capability for this registry, then add it with the /add-toolr skill.`;
  const descriptions =
    form.description.trim() && form.longDescription.trim()
      ? "Use the descriptions given above verbatim."
      : "Write the missing descriptions yourself, following .agents/rules/registry-descriptions.md.";
  return [
    task,
    form.prompt.trim(),
    `Honour these where they are given, derive the rest:\n${hints(form)}`,
    descriptions,
    "Read GitHub, never write to it: `gh api` for lookups only, never with -X, --method or -f. Do not commit or push. Finish with a final line of exactly `ADDED <type>/<slug>`.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

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
  sourceKind: "folder",
  sourcePath: "",
  repoUrl: "",
  prompt: prePromptFor("skill", "add"),
  promptTouched: false,
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

/** A GitHub repository, or a path inside one — what add-community accepts. */
export function githubProblem(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "paste the repository's URL";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "not a URL";
  }
  if (parsed.protocol !== "https:") return "only https URLs are fetched";
  if (parsed.hostname !== "github.com") return "only github.com repositories are supported today";
  if (parsed.pathname.split("/").filter(Boolean).length < 2) return "name the owner and the repository";
  return null;
}

/** What the one validator says about the item this form would produce. */
export function formProblems(form: AddLocalForm): ValidationError[] {
  // A job is described, not validated: the agent derives the item from the
  // repository or the prompt, and anything filled in here is a hint it follows.
  if (form.sourceKind === "repo") {
    const problem = githubProblem(form.repoUrl);
    return problem ? [{ field: "repoUrl", message: problem }] : [];
  }
  if (form.sourceKind === "agent") {
    return form.prompt.trim() ? [] : [{ field: "prompt", message: "describe the capability the agent should write" }];
  }
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
  // An empty description is not a problem to fix: submitting drafts it. One that
  // is filled in and breaks a rule still is.
  const drafted = [!form.description.trim() && "description", !form.longDescription.trim() && "longDescription"].filter(Boolean);
  return problems.filter((problem) => !drafted.includes(problem.field));
}

export const useAuthor = create<AuthorState>((set, get) => ({
  form: emptyForm(),
  probe: null,
  defaultAuthor: { name: "", url: "" },
  phase: "idle",
  draftErrors: [],
  log: [],
  result: null,
  error: null,

  setField(field, value) {
    const form = { ...get().form, [field]: value };
    if (field === "prompt") form.promptTouched = true;
    set({ form });
  },

  setType(type) {
    const { form } = get();
    // An untouched prompt follows the type, so the pre-prompt configured for a
    // hook is not the one a skill is added with.
    set({ form: { ...form, type, prompt: form.promptTouched ? form.prompt : prePromptFor(type, "add") } });
  },

  setSourceKind(kind) {
    const { form } = get();
    // A repository carries its own author, so the fields start empty and say so
    // — still editable, for the case where the repo is wrong about it.
    const author = kind === "repo" ? { authorName: "", authorUrl: "" } : { authorName: form.authorName || get().defaultAuthor.name, authorUrl: form.authorUrl || get().defaultAuthor.url };
    set({ form: { ...form, sourceKind: kind, ...author } });
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
      const [probe, identity] = await Promise.all([probeAgent(useAgentSettings.getState().preferred), repoIdentity().catch(() => null)]);
      // Settings wins over the checkout: a fork's remote is not who authored this.
      const configured = configuredAuthor();
      const defaultAuthor = {
        name: configured.name || identity?.authorName || "",
        url: configured.url || (identity?.owner ? `https://github.com/${identity.owner}` : ""),
      };
      const { form } = get();
      const derived = form.sourceKind === "repo";
      set({
        probe,
        defaultAuthor,
        phase: "idle",
        form: {
          ...form,
          authorName: derived ? form.authorName : form.authorName || defaultAuthor.name,
          authorUrl: derived ? form.authorUrl : form.authorUrl || defaultAuthor.url,
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
      const result = await draftWith(useAgentSettings.getState().preferred, { type: form.type, slug: form.slug, name: form.name, compatibility: form.compatibility, files, notes: form.prompt }, undefined, DRAFT_TASK);
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
    const { form } = get();
    if (formProblems(form).length > 0) {
      set({ error: "fix the highlighted fields first" });
      return;
    }
    if (form.sourceKind !== "folder") return get().runJob();
    // The transaction needs both descriptions; whatever was left empty is
    // drafted now, so "leave it empty" is a real answer and not a dead end.
    if (!form.description.trim() || !form.longDescription.trim()) {
      await get().draft();
      const drafted = get().form;
      if (!drafted.description.trim() || !drafted.longDescription.trim()) {
        if (get().draftErrors.length === 0) set({ draftErrors: ["the draft came back empty — write the descriptions yourself"] });
        return;
      }
    }
    set({ phase: "applying", error: null, result: null });
    try {
      const outcome = await runRegistryOp(parseOp(toOp(get().form)));
      set({ phase: "done", result: { kind: "op", type: outcome.type, slug: outcome.slug, changedPaths: outcome.changedPaths, headBefore: outcome.headBefore } });
    } catch (error) {
      // The CLI already rolled back; the message says why.
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  async runJob() {
    const { form, probe } = get();
    if (!probe?.available) {
      set({ error: probe?.diagnostic ?? "no coding agent available — see settings → coding agents" });
      return;
    }
    set({ phase: "running", error: null, result: null, log: [] });
    try {
      const outcome: AgentJobResult = await runAgentJob({
        taskId: JOB_TASK,
        prompt: jobPrompt(form),
        allowedTools: ADD_JOB_TOOLS,
        onEvent: (event) => set({ log: [...get().log.slice(-LOG_CAP + 1), event.kind === "tool" ? `· ${event.text}` : event.text] }),
      });
      if (!outcome.ok) {
        set({ phase: "idle", error: outcome.text, ...(outcome.denials.length > 0 ? { draftErrors: [`the job asked for ${outcome.denials.join(", ")}, which it is not allowed`] } : {}) });
        return;
      }
      set({ phase: "done", result: { kind: "job", added: parseAdded(outcome.text), text: outcome.text, denials: outcome.denials } });
    } catch (error) {
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  async cancel() {
    const { phase } = get();
    if (phase === "drafting") {
      await cancelProcess(`${DRAFT_TASK}-0`);
      await cancelProcess(`${DRAFT_TASK}-1`);
    }
    if (phase === "running") await cancelProcess(JOB_TASK);
  },

  reset() {
    set({ form: emptyForm(), phase: "idle", draftErrors: [], log: [], result: null, error: null });
  },
}));
