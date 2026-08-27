import { create } from "zustand";
import type { CodingAgent, ComponentType, ScopeType } from "@seedr/shared";
import { ALL_TYPES, CANONICAL_AGENTS, isOneCapability, looksLikeType, parseOp, typeDirName, validateItem, type AddLocalOp, type ValidationError } from "@seedr/registry-ops/pure";
import { cancelProcess, onProcessOutput, pickPath } from "@/api/agent";
import { runAgentJob, type AgentJobResult } from "@/api/agentJob";
import type { JobCapability } from "./adapters";
import { configuredAuthor } from "@/features/settings/authorSettings";
import { useAgentSettings } from "@/features/settings/agentSettings";
import { prePromptFor } from "@/features/settings/prePrompts";
import { repoIdentity, runRegistryOp } from "@/api/registryCli";
import { fs } from "@/api/fs";
import { readSourceFiles } from "@/api/source";
import { batchedLog, plainLine, type LogLine } from "@/core/logLines";
import { useStudio } from "@/features/explorer/store";
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
  /**
   * The standing context for this capability type, from settings → pre-prompts.
   * Kept apart from the run's own instruction so that writing one does not
   * overwrite the other — which is what happened when they shared a field.
   */
  prePrompt: string;
  /** Once the pre-prompt is edited by hand, changing the type stops rewriting it. */
  prePromptTouched: boolean;
  /** What this particular run should do. */
  prompt: string;
  type: ComponentType;
  slug: string;
  name: string;
  compatibility: CodingAgent[];
  targetScope: ScopeType | "";
  /** A label slug from the checkout's catalogue, or "" for none. */
  label: string;
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
  log: LogLine[];
  /** The last run was stopped on purpose, which is not a failure. */
  cancelled: boolean;
  result: AddResult | null;
  error: string | null;
  setField<K extends keyof AddLocalForm>(field: K, value: AddLocalForm[K]): void;
  setType(type: ComponentType): void;
  setSourceKind(kind: SourceKind): void;
  toggleAgent(agent: CodingAgent): void;
  /**
   * Pick the content to copy. One dialog, because the native panel is configured
   * for files or for folders and cannot offer both — so this asks for a folder,
   * then asks *which part of it* when the folder turns out to hold several
   * capabilities rather than being one.
   */
  chooseSource(): Promise<void>;
  /** Files offered after picking such a folder; empty when there is nothing to choose. */
  sourceChoices: string[];
  /** The folder the choice is being made inside. */
  pendingSource: string | null;
  /** Its file list, kept so that changing the type re-answers both questions. */
  sourceFiles: string[];
  /**
   * What the chosen content looks like, when that is not the type selected —
   * a folder of skills picked while the type says plugin. Null when they agree,
   * or when nothing about the content says.
   */
  sourceMismatch: ComponentType | null;
  /** Take the whole picked folder (null) or one file inside it. */
  takeSource(file: string | null): void;
  /** Probe Claude and prefill author/externalUrl from the repo's identity. */
  prepare(): Promise<void>;
  draft(): Promise<void>;
  /** Add it: the transaction for a folder, the agent job for a repo or a prompt. */
  apply(): Promise<void>;
  runJob(): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
}

// A long job scrolled its own beginning away at 200.
const LOG_CAP = 1000;

/**
 * Lines from a running job, coalesced to one store update a frame. Per line,
 * each of these was a render of the whole panel.
 */
const collectLog = (set: (partial: { log: LogLine[] }) => void, current: () => LogLine[]) =>
  batchedLog((batch) => set({ log: [...current(), ...batch].slice(-LOG_CAP) }));

const DRAFT_TASK = "author-draft";
const JOB_TASK = "author-job";

/**
 * What an add job may do: read and write the checkout, look the source
 * repository up, and run commands. The shell is open because authoring runs the
 * maintainer's own tooling — a skill's `init_skill.py`, `mkdir`, whatever
 * skill-creator reaches for — and an allowlist of exact prefixes turned that
 * into a wall of "permission denied" for work the person had just asked for.
 * `git` stays denied, so a job still cannot commit, push or rewrite history.
 */
export const ADD_JOB_CAPABILITIES: JobCapability[] = ["read", "edit", "search", "skills", "web", "shell"];

/** The last line an add job must print, so Studio can open what was added. */
const ADDED_LINE = /^ADDED\s+([a-z]+)\/([A-Za-z0-9._-]+)$/m;

/** Where an item's own file must be, for a claim of having added it to mean anything. */
const itemJsonPath = (type: ComponentType, slug: string): string => `registry/${typeDirName(type)}/${slug}/item.json`;

/**
 * What is wrong with what the agent claims to have added, or null when nothing
 * is. An agent that writes `item.json` by hand instead of running the operation
 * skips the validation the operation does, and the result only shows up later
 * as a red line on the item's own page — after the dialog said it worked. One
 * did exactly that, following a stale skill, and wrote a `sourceType` this
 * registry does not accept.
 */
async function faultInAdded(type: ComponentType, slug: string): Promise<string | null> {
  const path = itemJsonPath(type, slug);
  if (!(await fs.pathExists(path).catch(() => false))) {
    return `The agent reported adding ${type}/${slug}, but there is no item at ${path}. Nothing was written — read the log and try again.`;
  }
  let item: unknown;
  try {
    item = JSON.parse(await fs.readText(path));
  } catch (error) {
    return `${path} is not readable JSON: ${(error as Error).message}`;
  }
  const errors = validateItem(item);
  if (errors.length === 0) return null;
  return `The agent wrote ${path}, but it is not a valid item: ${errors.map((e) => `${e.field}: ${e.message}`).join("; ")}. Fix it, or remove it and run the job again.`;
}

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
    form.label ? `label: ${form.label}` : null,
    form.authorName.trim() && form.sourceKind === "agent" ? `author: ${form.authorName.trim()}` : null,
    form.description.trim() ? `description: ${form.description.trim()}` : null,
    form.longDescription.trim() ? `longDescription: ${form.longDescription.trim()}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * How to name a piece of this repo's tooling to an agent working in `cwd`.
 *
 * A skill is normally invoked as `/add-seedr`, which the agent resolves from
 * the directory it is running in. A registry-only checkout has no skills of its
 * own — it borrows them, exactly as it borrows the operations CLI — and an
 * agent that cannot find the skill improvises instead of saying so: that is how
 * one came to hand-write an `item.json` with a `sourceType` this registry does
 * not accept. So when the tooling is borrowed, the prompt names the file.
 */
function toolingReference(tooling: BorrowedTooling, relative: string, invocation: string): string {
  return tooling ? `the instructions in ${tooling.toolingRoot}/${relative}` : invocation;
}

/**
 * The checkout whose skills and rules this run borrows, and the one being
 * written to. Both are passed rather than read from a module global: the
 * operations CLI needs `--repo <registry>` spelled out, and a blank there is
 * not a failure anyone would notice — the CLI would quietly fall back to its
 * own directory.
 */
export type BorrowedTooling = { toolingRoot: string; registryRoot: string } | null;

/**
 * Studio already picks a checkout to borrow the operations CLI from when the
 * open one has none. Skills travel with it: a registry that cannot run the CLI
 * does not carry the skills that drive it either.
 */
export const borrowedTooling = (): BorrowedTooling => {
  const { toolingRepo, repo } = useStudio.getState();
  return toolingRepo && repo ? { toolingRoot: toolingRepo.root, registryRoot: repo.root } : null;
};

/**
 * The whole instruction the agent receives. It names the repo's own skill for
 * the job, passes the user's pre-prompt through, and asks for one machine-
 * readable line back so Studio can select what was added.
 */
export function jobPrompt(form: AddLocalForm, tooling: BorrowedTooling = null): string {
  const addSkill = toolingReference(tooling, ".agents/skills/add-seedr/SKILL.md", "the /add-seedr skill");
  // `/add-community <url>` is the skill's own trigger form, so it stays exactly
  // that when the skill is local; only a borrowed one has to be named by file.
  const repoTask = tooling
    ? `Add ${form.repoUrl.trim()} to this registry, following the instructions in ${tooling.toolingRoot}/.agents/skills/add-community/SKILL.md.`
    : `/add-community ${form.repoUrl.trim()}`;
  const task =
    form.sourceKind === "repo" ? repoTask : `Author a new first-party ${form.type} capability for this registry, then add it with ${addSkill}.`;
  const rules = tooling ? `${tooling.toolingRoot}/.agents/rules/registry-descriptions.md` : ".agents/rules/registry-descriptions.md";
  const descriptions =
    form.description.trim() && form.longDescription.trim()
      ? "Use the descriptions given above verbatim."
      : `Write the missing descriptions yourself, following ${rules}.`;
  return [
    task,
    form.prePrompt.trim(),
    form.prompt.trim(),
    `Honour these where they are given, derive the rest:\n${hints(form)}`,
    descriptions,
    tooling
      ? [
          `Read that tooling from ${tooling.toolingRoot}, but write only inside this checkout: it is the registry, and the other checkout is not yours to change.`,
          // The skill says `npx tsx scripts/registry-op.ts …`, which is a path
          // relative to the agent's own directory. There is no such script in a
          // registry-only checkout, and an agent that cannot run the operation
          // writes item.json by hand instead.
          `The operations CLI is not in this checkout either. Wherever the skill says \`npx tsx scripts/registry-op.ts <args>\`, run \`npx tsx ${tooling.toolingRoot}/scripts/registry-op.ts --repo ${tooling.registryRoot} <args>\` instead. Never write item.json yourself — the operation validates what it writes, and a hand-written one is refused.`,
        ].join(" ")
      : "Work inside this checkout only. A CLI refuses to write outside it, so a scaffolding script that wants a scratch directory should be given one *inside* the checkout — remove it when you are done.",
    "Read GitHub, never write to it: `gh api` for lookups only, never with -X, --method or -f. Do not commit or push. Finish with a final line of exactly `ADDED <type>/<slug>`.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * What the picked content looks like, when that disagrees with the selected type.
 * Null when they agree, or when nothing about the content says either way — a
 * folder of loose markdown is not evidence of anything.
 */
function mismatchAgainst(files: string[], path: string, type: ComponentType): ComponentType | null {
  const looks = looksLikeType(files, path);
  return looks && looks !== type ? looks : null;
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
  prePrompt: prePromptFor("skill", "add"),
  prePromptTouched: false,
  prompt: "",
  type: "skill",
  slug: "",
  name: "",
  compatibility: ["claude"],
  targetScope: "",
  label: "",
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
    ...(form.label ? { label: form.label } : {}),
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
    sourceType: "seedr",
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
  cancelled: false,
  result: null,
  error: null,

  setField(field, value) {
    const form = { ...get().form, [field]: value };
    if (field === "prePrompt") form.prePromptTouched = true;
    set({ form });
  },

  setType(type) {
    const { form } = get();
    // An untouched pre-prompt follows the type, so the standing context for a
    // hook is not the one a skill is added with. The run's own prompt is never
    // touched: it is what the person typed.
    set({ form: { ...form, type, prePrompt: form.prePromptTouched ? form.prePrompt : prePromptFor(type, "add") } });
    // The type is the question the source is judged against, so changing it
    // re-asks: a folder of skills chosen while the type said skill becomes a
    // mismatch the moment the type says plugin.
    const { sourceFiles, pendingSource } = get();
    if (pendingSource) set({ sourceMismatch: mismatchAgainst(sourceFiles, pendingSource, type) });
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

  sourceChoices: [],
  pendingSource: null,
  sourceFiles: [],
  sourceMismatch: null,

  async chooseSource() {
    const picked = await pickPath("folder");
    if (!picked) return;
    set({ pendingSource: picked, sourceChoices: [], sourceMismatch: null, sourceFiles: [] });
    const listed = await readSourceFiles(picked).then(({ files }) => Object.keys(files), (): string[] => []);
    set({ sourceFiles: listed, sourceMismatch: mismatchAgainst(listed, picked, get().form.type) });
    // A folder carrying the type's marker *is* the capability. One that does not,
    // and holds several files, is a folder *of* capabilities — `.claude/skills/`
    // with three unrelated skills in it — and only one of them is this item.
    const topLevel = listed.filter((file) => !file.includes("/")).sort();
    if (!isOneCapability(listed, get().form.type) && topLevel.length > 1) {
      set({ sourceChoices: topLevel });
      return;
    }
    get().takeSource(null);
  },

  takeSource(file) {
    const folder = get().pendingSource;
    if (!folder) return;
    const path = file === null ? folder : `${folder}/${file}`;
    const { form } = get();
    const slug = form.slug || slugFromPath(path);
    set({ form: { ...form, sourcePath: path, slug, name: form.name || titleFromSlug(slug) }, sourceChoices: [] });
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
          // Re-read on open, not just when the store was created: a pre-prompt
          // written in settings after the app started would otherwise never
          // reach the field it was written for. An edited prompt is left alone,
          // since it was adjusted for this run.
          prePrompt: form.prePromptTouched ? form.prePrompt : prePromptFor(form.type, "add"),
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
    const unlisten = await onProcessOutput(`${DRAFT_TASK}-0`, (event) => set({ log: [...get().log.slice(-LOG_CAP + 1), plainLine(event.line)] }));
    try {
      const { files } = await readSourceFiles(form.sourcePath);
      const notes = [form.prePrompt.trim(), form.prompt.trim()].filter(Boolean).join("\n\n");
      const result = await draftWith(useAgentSettings.getState().preferred, { type: form.type, slug: form.slug, name: form.name, compatibility: form.compatibility, files, notes }, undefined, DRAFT_TASK);
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
      const op = toOp(get().form);
      const outcome = await runRegistryOp(parseOp(op));
      // An add always names its item; the result type allows absence because the
      // catalogue operation has no item to name.
      set({ phase: "done", result: { kind: "op", type: outcome.type ?? op.type, slug: outcome.slug ?? op.slug, changedPaths: outcome.changedPaths, headBefore: outcome.headBefore } });
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
    set({ phase: "running", error: null, result: null, log: [], cancelled: false });
    try {
      const outcome: AgentJobResult = await runAgentJob({
        taskId: JOB_TASK,
        prompt: jobPrompt(form, borrowedTooling()),
        capabilities: ADD_JOB_CAPABILITIES,
        onEvent: collectLog(set, () => get().log),
      });
      if (outcome.cancelled) {
        set({ phase: "idle", cancelled: true });
        return;
      }
      if (!outcome.ok) {
        set({ phase: "idle", error: outcome.text, ...(outcome.denials.length > 0 ? { draftErrors: [`the job asked for ${outcome.denials.join(", ")}, which it is not allowed`] } : {}) });
        return;
      }
      // An agent's report is a claim, not evidence. opencode returned a tidy
      // summary with changed paths and the required ADDED line having written
      // every one of them into a different checkout — a truthful report of work
      // done somewhere else. So the claim is checked against this checkout, and
      // against the validator, before the explorer is told to open anything.
      const added = parseAdded(outcome.text);
      const fault = added ? await faultInAdded(added.type, added.slug) : null;
      if (fault) {
        set({ phase: "idle", error: fault });
        return;
      }
      set({ phase: "done", result: { kind: "job", added, text: outcome.text, denials: outcome.denials } });
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
    set({ form: emptyForm(), phase: "idle", draftErrors: [], log: [], cancelled: false, result: null, error: null });
  },
}));
