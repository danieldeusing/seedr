import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ScopeType } from "@seedr/shared";
import { ALL_TYPES, AGENT_LABELS, CANONICAL_AGENTS, KNOWN_SCOPES, TYPE_MARKERS } from "@seedr/registry-ops/pure";
import { Ban, Check, FolderOpen, Plus, TriangleAlert } from "lucide-react";
import { AgentLog } from "@/core/ui/AgentLog";
import { FormActions } from "@/core/ui/FormActions";
import { IconButton } from "@/core/ui/IconButton";
import { PromptField } from "@/core/ui/PromptField";
import { Select } from "@/core/ui/Select";
import { AgentSelect } from "@/features/settings/AgentSelect";
import { ModelSelect } from "@/features/settings/ModelSelect";
import { LabelRow } from "@/features/settings/LabelRow";
import { DRAFT_CERTIFIED, useAgentSettings } from "@/features/settings/agentSettings";
import { SignedOutNotice } from "@/features/settings/SignedOutNotice";
import { formProblems, useAuthor, type SourceKind } from "./store";

const AUTHORABLE_TYPES = ALL_TYPES;

const SOURCE_KINDS: { value: SourceKind; label: string }[] = [
  { value: "folder", label: "a local folder" },
  { value: "repo", label: "a git repository" },
  { value: "agent", label: "the agent writes it" },
];

/** What each label means, in one line — hover explains the vocabulary. */
const TIPS = {
  from: "Where the content comes from: a folder copied into this registry as our own item, a repository recorded as a community item the CLI fetches at install time, or a capability the agent writes from your prompt.",
  source: "The folder holding the capability — the skill directory, the hook script. Its contents are copied in whole.",
  repository: "The GitHub repository holding the capability. Nothing is copied: the item records the URL and the CLI fetches from it at install time.",
  prePrompt: "The standing context for this type, from settings → pre-prompts. It is sent ahead of the prompt below; edit it here to change it for this run only.",
  prompt: "What this run should do. Type / for a skill.",
  type: "Which kind of capability this is. It decides the registry folder and the install handler.",
  slug: "The item's id: lowercase, no spaces. It is the directory name, and what `seedr add` takes.",
  name: "The display name, shown in the explorer and on the web.",
  agents: "The coding agents this capability supports. Installing it for an agent it does not list is refused.",
  scope: "Where the CLI installs it by default — the project, or the user's home.",
  author: "Who made it. Prefilled from settings → author; for a repository it comes from the source, unless you say otherwise here.",
};

interface AuthorFormProps {
  onAdded(type: ComponentType, slug: string): void;
}

/**
 * Add a capability. A local folder is copied in by the deterministic
 * transaction; a repository or a prompt is a job the coding agent does with
 * this repo's own add skills — which end in that same transaction.
 */
/**
 * The log subscribes for itself so the form does not.
 *
 * A form of two dozen controls re-rendered on every line an agent streamed,
 * which is what made clicking and scrolling take seconds while a job ran.
 */
function JobLog({ fill = false }: { fill?: boolean }) {
  const log = useAuthor((state) => state.log);
  return <AgentLog lines={log} fill={fill} />;
}

const choiceButton = "cursor-pointer border border-violet-500/30 px-2 py-0.5 text-neutral-200 transition-colors hover:border-violet-500 hover:text-violet-300";

export function AuthorForm({ onAdded }: AuthorFormProps) {
  const form = useAuthor((s) => s.form);
  const probe = useAuthor((s) => s.probe);
  const phase = useAuthor((s) => s.phase);
  const draftErrors = useAuthor((s) => s.draftErrors);
  const cancelled = useAuthor((s) => s.cancelled);
  const result = useAuthor((s) => s.result);
  const error = useAuthor((s) => s.error);
  const { setField, setType, setSourceKind, toggleAgent, chooseSource, takeSource, prepare, apply, cancel, reset } = useAuthor.getState();
  const sourceChoices = useAuthor((state) => state.sourceChoices);
  const sourceMismatch = useAuthor((state) => state.sourceMismatch);
  const [askingAboutMismatch, setAskingAboutMismatch] = useState(false);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  useEffect(() => {
    if (phase !== "done" || !result) return;
    if (result.kind === "op") onAdded(result.type, result.slug);
    else if (result.added) onAdded(result.added.type, result.added.slug);
  }, [phase, result, onAdded]);

  const problems = useMemo(() => formProblems(form), [form]);
  const problemFor = (field: string) => problems.filter((p) => p.field === field);
  const busy = phase === "probing" || phase === "drafting" || phase === "applying" || phase === "running";
  /** A repository or a prompt is carried out by the agent, not by the transaction. */
  const byAgent = form.sourceKind !== "folder";
  const formRef = useRef<HTMLFormElement>(null);
  const agent = useAgentSettings((state) => state.preferred);
  const setAgent = useAgentSettings((state) => state.setPreferred);
  /** For a repository, what the agent works out from the source unless overridden. */
  const derivedPlaceholder = form.sourceKind === "repo" ? "derived from the source" : "";
  const input =
    "w-full border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

  if (phase === "done" && result) {
    return (
      <section className="flex min-h-0 flex-1 flex-col p-6 text-xs" aria-live="polite">
        <p className="prompt">{result.kind === "op" ? "registry-op run --op add-local" : "agent job"}</p>
        {result.kind === "op" ? (
          <>
            <p className="mt-4 text-primary">
              Added {result.type}/{result.slug} at {result.headBefore.slice(0, 7)}.
            </p>
            <ul className="mt-2 text-muted-foreground">
              {result.changedPaths.map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          </>
        ) : (
          // The agent's closing message is not shown a second time here: every
          // line it printed, that one included, is already in the log below.
          // Printing both put the same transcript on the screen twice.
          <p className="mt-4 text-primary">{result.added ? `Added ${result.added.type}/${result.added.slug}.` : "The job finished without naming what it added."}</p>
        )}
        <p className="mt-4 text-muted-foreground">Review with git status and commit when you are happy. It is selected in the explorer behind this dialog.</p>
        <JobLog fill />
        {/* Bottom right, where this dialog's other confirm sits: the log above it
            grows, and a button that follows the log wanders up the page. */}
        <div className="mt-auto flex justify-end pt-4">
          <IconButton icon={Plus} ariaLabel="add another" tip="Add another capability" accentColor="violet" onClick={reset} />
        </div>
      </section>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex h-full min-h-0 flex-col overflow-y-auto p-6 pb-10 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        // A mismatch is not refused outright — the detection is a reading of file
        // names, and the person picking the folder knows more than it does.
        if (sourceMismatch) {
          setAskingAboutMismatch(true);
          return;
        }
        void apply();
      }}
    >
      <p className="prompt">{form.sourceKind === "folder" ? "add-local" : form.sourceKind === "repo" ? "add-community" : "add-seedr"}</p>

      <div className="field-row mt-4">
        <span className="lbl" data-tip={TIPS.from}>
          from
        </span>
        <div className="field-val">
          <Select<SourceKind> ariaLabel="source kind" value={form.sourceKind} options={SOURCE_KINDS} onChange={setSourceKind} disabled={busy} />
        </div>
      </div>

      <div className="field-row">
        <label className="lbl" htmlFor="author-type" data-tip={TIPS.type}>
          type
        </label>
        <div className="field-val">
          <Select id="author-type" ariaLabel="type" value={form.type} options={AUTHORABLE_TYPES.map((type) => ({ value: type, label: type }))} onChange={setType} disabled={busy} invalid={!!sourceMismatch} />
        </div>
      </div>

      {form.sourceKind === "folder" && (
        <>
          <div className="field-row">
            <span className="lbl" data-tip={TIPS.source}>
              source
            </span>
            <div className="field-val">
              <code className="truncate text-muted-foreground">{form.sourcePath || "nothing chosen"}</code>
              <IconButton icon={FolderOpen} ariaLabel="choose source" tip="Pick the folder to copy — Studio asks which part of it if the folder holds several capabilities" onClick={() => void chooseSource()} disabled={busy} />
            </div>
          </div>
          {sourceChoices.length > 0 && (
            <div className="field-row">
              <span
                className="lbl"
                data-tip={`That folder carries no ${TYPE_MARKERS[form.type].join(" or ")}, so it holds several ${form.type}s rather than being one. Copy all of it, or the one file that is this item.`}
              >
                which part
              </span>
              <div className="field-val">
                <button type="button" className={choiceButton} onClick={() => takeSource(null)}>
                  the whole folder
                </button>
                {sourceChoices.map((file) => (
                  <button key={file} type="button" className={choiceButton} onClick={() => takeSource(file)}>
                    {file}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sourceMismatch && (
            <div className="field-row">
              <span className="lbl" />
              <p className="field-val text-destructive" role="alert">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                That content looks like a {sourceMismatch}, but the type says {form.type}. Change the type, or pick different content.
              </p>
            </div>
          )}
          <Problems errors={problemFor("sourcePath")} />
        </>
      )}

      {form.sourceKind === "repo" && (
        <>
          <div className="field-row">
            <label className="lbl" htmlFor="author-repo" data-tip={TIPS.repository}>
              repository
            </label>
            <div className="field-val">
              <input id="author-repo" className={input} value={form.repoUrl} onChange={(e) => setField("repoUrl", e.target.value)} placeholder="https://github.com/owner/repo" disabled={busy} />
            </div>
          </div>
          <Problems errors={problemFor("repoUrl")} />
        </>
      )}

      <div className="field-row">
        <label className="lbl" htmlFor="author-pre-prompt" data-tip={TIPS.prePrompt}>
          pre-prompt
        </label>
        <div className="field-val">
          <PromptField
            id="author-pre-prompt"
            className={`${input} min-h-16`}
            value={form.prePrompt}
            onChange={(value) => setField("prePrompt", value)}
            placeholder={`nothing standing for ${form.type} — set one in settings → pre-prompts`}
            disabled={busy}
          />
        </div>
      </div>

      <div className="field-row">
        <label className="lbl" htmlFor="author-prompt" data-tip={TIPS.prompt}>
          prompt
        </label>
        <div className="field-val">
          <PromptField
            id="author-prompt"
            className={`${input} min-h-16`}
            value={form.prompt}
            onChange={(value) => setField("prompt", value)}
            placeholder={byAgent ? "what the agent should know — type / for a skill" : "extra context for drafting the descriptions"}
            disabled={busy}
          />
        </div>
      </div>
      <Problems errors={problemFor("prompt")} />

      {byAgent && (
        <div className="field-row">
          <span className="lbl" />
          <p className="field-val text-muted-foreground">The fields below are hints — the agent derives whatever you leave empty.</p>
        </div>
      )}

      <div className="field-row">
        <label className="lbl" htmlFor="author-slug" data-tip={TIPS.slug}>
          slug
        </label>
        <div className="field-val">
          <input id="author-slug" className={input} value={form.slug} onChange={(e) => setField("slug", e.target.value)} placeholder={byAgent ? "derived from the source" : ""} disabled={busy} />
        </div>
      </div>
      <Problems errors={problemFor("slug")} />

      <div className="field-row">
        <label className="lbl" htmlFor="author-name" data-tip={TIPS.name}>
          name
        </label>
        <div className="field-val">
          <input id="author-name" className={input} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder={byAgent ? "derived from the source" : ""} disabled={busy} />
        </div>
      </div>
      <Problems errors={problemFor("name")} />

      {/* A legend cannot sit in the field-row grid, which is what pushed the
          checkboxes out of the value column and wrapped names mid-word. Same
          table-style row as every other field: label column, value column. */}
      <div className="field-row" role="group" aria-label="agents">
        <span className="lbl" data-tip={TIPS.agents}>
          agents
        </span>
        <div className="field-val">
          {CANONICAL_AGENTS.map((canonical) => (
            <label key={canonical} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-neutral-300">
              <input type="checkbox" className="accent-violet-500" checked={form.compatibility.includes(canonical)} onChange={() => toggleAgent(canonical)} disabled={busy} /> {AGENT_LABELS[canonical]}
            </label>
          ))}
        </div>
      </div>
      <Problems errors={problemFor("compatibility")} />

      <div className="field-row">
        <label className="lbl" htmlFor="author-scope" data-tip={TIPS.scope}>
          scope
        </label>
        <div className="field-val">
          <Select<ScopeType | "">
            id="author-scope"
            ariaLabel="scope"
            value={form.targetScope}
            options={[{ value: "" as const, label: "no default scope" }, ...KNOWN_SCOPES.map((scope) => ({ value: scope, label: scope }))]}
            onChange={(scope) => setField("targetScope", scope)}
            disabled={busy}
          />
        </div>
      </div>

      <LabelRow value={form.label} onChange={(label) => setField("label", label)} disabled={busy} id="author-label" />

      <div className="field-row">
        <label className="lbl" htmlFor="author-author" data-tip={TIPS.author}>
          author
        </label>
        <div className="field-val">
          <input
            id="author-author"
            className={input}
            value={form.authorName}
            onChange={(e) => setField("authorName", e.target.value)}
            placeholder={derivedPlaceholder || "name"}
            disabled={busy}
          />
          <input
            aria-label="author url"
            className={input}
            value={form.authorUrl}
            onChange={(e) => setField("authorUrl", e.target.value)}
            placeholder={derivedPlaceholder || "https://github.com/you"}
            disabled={busy}
          />
        </div>
      </div>
      <Problems errors={[...problemFor("author"), ...problemFor("author.url")]} />

      <div className="field-row">
        <span className="lbl" />
        <p className="field-val text-muted-foreground">The agent writes the description and the TL;DR from the content itself — edit them afterwards on the item.</p>
      </div>
      <Problems errors={[...problemFor("description"), ...problemFor("longDescription")]} />

      <div className="mt-4 flex items-center gap-2 border-t border-neutral-700 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <AgentSelect value={agent} onChange={setAgent} certified={DRAFT_CERTIFIED} job="draft" ariaLabel="coding agent" disabled={busy} />
          <ModelSelect job="add" agent={agent} disabled={busy} />
          <span className="min-w-0 truncate text-sm text-neutral-500" role="status">
            {phase === "drafting"
              ? "drafting…"
              : phase === "running"
                ? "the agent is working…"
                : phase === "applying"
                  ? "applying…"
                  : cancelled
                    ? "stopped — nothing was added"
                    : probe === null
                      ? "probing…"
                      : probe.available
                        ? probe.version
                        : probe.diagnostic}
          </span>
        </div>
      </div>

      {draftErrors.length > 0 && (
        <p className="mt-3 text-destructive" role="alert">
          Draft rejected: {draftErrors.join("; ")}
        </p>
      )}
      {error && <SignedOutNotice error={error} />}
      <JobLog />
      {askingAboutMismatch && sourceMismatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="add it anyway">
          <div className="absolute inset-0 bg-[var(--dialog-backdrop)] backdrop-blur-sm" onClick={() => setAskingAboutMismatch(false)} />
          <div className="relative mx-4 w-full max-w-md border border-neutral-700 bg-neutral-980 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-neutral-960 px-6 py-4">
              <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-white">Add it as a {form.type} anyway?</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-neutral-300">
                The content at <code className="break-all text-primary">{form.sourcePath}</code> looks like a {sourceMismatch}: it carries{" "}
                {TYPE_MARKERS[sourceMismatch].join(" or ")}, not {TYPE_MARKERS[form.type].join(" or ")}.
              </p>
              <p className="mt-2 text-muted-foreground">
                That is read from file names alone, so it can be wrong — a {form.type} that happens to look like a {sourceMismatch} is yours to add.
              </p>
              <FormActions
                border={false}
                confirmLabel={`add as a ${form.type}`}
                confirmIcon={Check}
                confirmColor="red"
                onConfirm={() => {
                  setAskingAboutMismatch(false);
                  void apply();
                }}
                cancelLabel="go back and change it"
                onCancel={() => setAskingAboutMismatch(false)}
              />
            </div>
          </div>
        </div>
      )}
      {/* Below the log, not beside the status: the log grows and is resizable,
          so buttons above it drift further from the output they act on. */}
      {/* `mt-auto` pins this to the bottom of the dialog: the form is a full-height
          flex column, so a short form leaves the gap above the buttons rather
          than below them. Moving them under the log had left the submit floating
          in the middle of an otherwise empty dialog. */}
      <div className="mt-auto flex items-center justify-end gap-2 pt-3">
        {(phase === "drafting" || phase === "running") && <IconButton icon={Ban} ariaLabel="cancel the run" tip="cancel the run" onClick={() => void cancel()} />}
        <IconButton
          icon={Check}
          ariaLabel={byAgent ? "hand it to the agent" : "add to registry"}
          tip={byAgent ? "hand it to the agent" : "add to registry"}
          accentColor="violet"
          onClick={() => formRef.current?.requestSubmit()}
          disabled={busy || problems.length > 0}
          spin={phase === "applying" || phase === "running"}
        />
      </div>
    </form>
  );
}

function Problems({ errors }: { errors: { field: string; message: string }[] }) {
  if (errors.length === 0) return null;
  // An empty label cell puts the message exactly on the value column — the
  // field is evident from the row above, so the "field:" prefix goes.
  return (
    <div className="field-row">
      <span className="lbl" />
      <p className="field-val text-sm text-red-400">{errors.map((error) => error.message).join("; ")}</p>
    </div>
  );
}
