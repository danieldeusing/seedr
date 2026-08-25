import { useEffect, useMemo, useRef } from "react";
import type { ComponentType, ScopeType } from "@seedr/shared";
import { ALL_TYPES, AGENT_LABELS, CANONICAL_AGENTS, KNOWN_SCOPES } from "@seedr/registry-ops/pure";
import { Ban, Check, FolderOpen } from "lucide-react";
import { IconButton } from "@/core/ui/IconButton";
import { PromptField } from "@/core/ui/PromptField";
import { Select } from "@/core/ui/Select";
import { AgentSelect } from "@/features/settings/AgentSelect";
import { DRAFT_CERTIFIED, useAgentSettings } from "@/features/settings/agentSettings";
import { formProblems, useAuthor, type SourceKind } from "./store";

// The CLI has no install handler for `command` items yet (plan trap 12); until
// it does, Studio does not offer authoring them.
const AUTHORABLE_TYPES = ALL_TYPES.filter((type) => type !== "command");

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
  prompt: "Sent to the coding agent ahead of the job. Prefilled from settings → pre-prompts for this type; edit it freely — it is exactly what the agent is told.",
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
export function AuthorForm({ onAdded }: AuthorFormProps) {
  const form = useAuthor((s) => s.form);
  const probe = useAuthor((s) => s.probe);
  const phase = useAuthor((s) => s.phase);
  const draftErrors = useAuthor((s) => s.draftErrors);
  const log = useAuthor((s) => s.log);
  const result = useAuthor((s) => s.result);
  const error = useAuthor((s) => s.error);
  const { setField, setType, setSourceKind, toggleAgent, chooseSource, prepare, apply, cancel, reset } = useAuthor.getState();

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
      <section className="p-6 text-xs" aria-live="polite">
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
          <>
            <p className="mt-4 text-primary">{result.added ? `Added ${result.added.type}/${result.added.slug}.` : "The job finished without naming what it added."}</p>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-muted-foreground">{result.text}</pre>
          </>
        )}
        <p className="mt-4 text-muted-foreground">Review with git status and commit when you are happy.</p>
        <button type="button" onClick={reset} className="doc-link doc-link--forward mt-4 cursor-pointer text-sm">
          add another
        </button>
      </section>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex h-full min-h-0 flex-col overflow-y-auto p-6 pb-10 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
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

      {form.sourceKind === "folder" && (
        <>
          <div className="field-row">
            <span className="lbl" data-tip={TIPS.source}>
              source
            </span>
            <div className="field-val">
              <code className="truncate text-muted-foreground">{form.sourcePath || "nothing chosen"}</code>
              <IconButton icon={FolderOpen} ariaLabel="choose folder" tip="Pick the capability's source folder" onClick={() => void chooseSource()} disabled={busy} />
            </div>
          </div>
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
        <label className="lbl" htmlFor="author-type" data-tip={TIPS.type}>
          type
        </label>
        <div className="field-val">
          <Select id="author-type" ariaLabel="type" value={form.type} options={AUTHORABLE_TYPES.map((type) => ({ value: type, label: type }))} onChange={setType} disabled={busy} />
        </div>
      </div>

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

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-700 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <AgentSelect value={agent} onChange={setAgent} certified={DRAFT_CERTIFIED} job="draft" ariaLabel="coding agent" disabled={busy} />
          <span className="min-w-0 truncate text-sm text-neutral-500" role="status">
            {phase === "drafting"
              ? "drafting…"
              : phase === "running"
                ? "the agent is working…"
                : phase === "applying"
                  ? "applying…"
                  : probe === null
                    ? "probing…"
                    : probe.available
                      ? probe.version
                      : probe.diagnostic}
          </span>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {draftErrors.length > 0 && (
        <p className="mt-3 text-destructive" role="alert">
          Draft rejected: {draftErrors.join("; ")}
        </p>
      )}
      {error && (
        <p className="mt-3 text-destructive" role="alert">
          {error}
        </p>
      )}
      {log.length > 0 && (
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-muted p-2" aria-live="polite" aria-label="agent output">
          {log.join("\n")}
        </pre>
      )}
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
