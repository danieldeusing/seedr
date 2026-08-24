import { useEffect, useMemo, useRef } from "react";
import type { ComponentType, ScopeType } from "@seedr/shared";
import { ALL_TYPES, AGENT_LABELS, CANONICAL_AGENTS, KNOWN_SCOPES, formatErrors } from "@seedr/registry-ops/pure";
import { Ban, Check, FolderOpen, Sparkles } from "lucide-react";
import { IconButton } from "@/core/ui/IconButton";
import { formProblems, useAuthor } from "./store";

// The CLI has no install handler for `command` items yet (plan trap 12); until
// it does, Studio does not offer authoring them.
const AUTHORABLE_TYPES = ALL_TYPES.filter((type) => type !== "command");

interface AuthorFormProps {
  onAdded(type: ComponentType, slug: string): void;
}

/**
 * Add a local capability: the user supplies what the model must not guess,
 * optionally asks Claude for the two descriptions, reviews everything, and
 * applies it as one transaction.
 */
export function AuthorForm({ onAdded }: AuthorFormProps) {
  const form = useAuthor((s) => s.form);
  const probe = useAuthor((s) => s.probe);
  const phase = useAuthor((s) => s.phase);
  const draftErrors = useAuthor((s) => s.draftErrors);
  const log = useAuthor((s) => s.log);
  const outcome = useAuthor((s) => s.outcome);
  const error = useAuthor((s) => s.error);
  const { setField, toggleAgent, chooseSource, prepare, draft, apply, cancel, reset } = useAuthor.getState();

  useEffect(() => {
    void prepare();
  }, [prepare]);

  useEffect(() => {
    if (phase === "done" && outcome) onAdded(outcome.type, outcome.slug);
  }, [phase, outcome, onAdded]);

  const problems = useMemo(() => formProblems(form), [form]);
  const problemFor = (field: string) => problems.filter((p) => p.field === field);
  const busy = phase === "probing" || phase === "drafting" || phase === "applying";
  // the design system styles text inputs, selects and textareas itself
  const formRef = useRef<HTMLFormElement>(null);
  const input = "w-full border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

  if (phase === "done" && outcome) {
    return (
      <section className="p-6 text-xs" aria-live="polite">
        <p className="prompt">registry-op run --op add-local</p>
        <p className="mt-4 text-primary">
          Added {outcome.type}/{outcome.slug} at {outcome.headBefore.slice(0, 7)}.
        </p>
        <ul className="mt-2 text-muted-foreground">
          {outcome.changedPaths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
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
      className="flex h-full min-h-0 flex-col overflow-y-auto p-6 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        void apply();
      }}
    >
      <p className="prompt">add-local</p>

      <div className="field-row mt-4">
        <span className="lbl">source</span>
        <div className="field-val">
          <code className="truncate text-muted-foreground">{form.sourcePath || "nothing chosen"}</code>
          <IconButton icon={FolderOpen} ariaLabel="choose folder" tip="Pick the capability's source folder" onClick={() => void chooseSource()} disabled={busy} />
          <button type="button" hidden onClick={() => void chooseSource()} disabled={busy}>
            choose folder
          </button>
        </div>
      </div>
      <Problems errors={problemFor("sourcePath")} />

      <div className="field-row">
        <label className="lbl" htmlFor="author-type">
          type
        </label>
        <div className="field-val">
          <select id="author-type" value={form.type} onChange={(e) => setField("type", e.target.value as ComponentType)} disabled={busy}>
            {AUTHORABLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <label className="lbl" htmlFor="author-slug">
          slug
        </label>
        <div className="field-val">
          <input id="author-slug" className={input} value={form.slug} onChange={(e) => setField("slug", e.target.value)} disabled={busy} />
        </div>
      </div>
      <Problems errors={problemFor("slug")} />

      <div className="field-row">
        <label className="lbl" htmlFor="author-name">
          name
        </label>
        <div className="field-val">
          <input id="author-name" className={input} value={form.name} onChange={(e) => setField("name", e.target.value)} disabled={busy} />
        </div>
      </div>
      <Problems errors={problemFor("name")} />

      <fieldset className="field-row" disabled={busy}>
        <legend className="lbl">agents</legend>
        <div className="field-val">
          {CANONICAL_AGENTS.map((agent) => (
            <label key={agent} className="mr-3">
              <input type="checkbox" checked={form.compatibility.includes(agent)} onChange={() => toggleAgent(agent)} /> {AGENT_LABELS[agent]}
            </label>
          ))}
        </div>
      </fieldset>
      <Problems errors={problemFor("compatibility")} />

      <div className="field-row">
        <label className="lbl" htmlFor="author-scope">
          scope
        </label>
        <div className="field-val">
          <select id="author-scope" value={form.targetScope} onChange={(e) => setField("targetScope", e.target.value as ScopeType | "")} disabled={busy}>
            <option value="">no default scope</option>
            {KNOWN_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <label className="lbl" htmlFor="author-author">
          author
        </label>
        <div className="field-val">
          <input id="author-author" className={input} value={form.authorName} onChange={(e) => setField("authorName", e.target.value)} placeholder="name" disabled={busy} />
          <input aria-label="author url" className={input} value={form.authorUrl} onChange={(e) => setField("authorUrl", e.target.value)} placeholder="https://github.com/you" disabled={busy} />
        </div>
      </div>
      <Problems errors={[...problemFor("author"), ...problemFor("author.url")]} />

      <div className="field-row">
        <label className="lbl" htmlFor="author-description">
          description
        </label>
        <div className="field-val">
          <input id="author-description" className={input} value={form.description} onChange={(e) => setField("description", e.target.value)} disabled={busy} />
        </div>
      </div>
      <Problems errors={problemFor("description")} />

      <div className="field-row">
        <label className="lbl" htmlFor="author-long">
          tl;dr
        </label>
        <div className="field-val">
          <textarea id="author-long" className={`${input} min-h-24`} value={form.longDescription} onChange={(e) => setField("longDescription", e.target.value)} disabled={busy} />
        </div>
      </div>
      <Problems errors={problemFor("longDescription")} />

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-700 pt-3">
        <span className="min-w-0 truncate text-sm text-neutral-500" role="status">
          {phase === "drafting" ? "drafting…" : phase === "applying" ? "applying…" : probe === null ? "probing Claude Code…" : probe.available ? `Claude Code ${probe.version}` : probe.diagnostic}
        </span>
        <div className="flex items-center gap-2">
          {phase === "drafting" ? (
            <IconButton icon={Ban} ariaLabel="cancel the draft" tip="cancel the draft" onClick={() => void cancel()} />
          ) : (
            <IconButton icon={Sparkles} ariaLabel="draft descriptions with Claude" tip="draft descriptions with Claude" onClick={() => void draft()} disabled={busy || !probe?.available} />
          )}
          <IconButton icon={Check} ariaLabel="add to registry" tip="add to registry" accentColor="violet" onClick={() => formRef.current?.requestSubmit()} disabled={busy || problems.length > 0} spin={phase === "applying"} />
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
        <pre className="mt-3 max-h-40 overflow-auto border border-border bg-muted p-2" aria-live="polite" aria-label="agent output">
          {log.join("\n")}
        </pre>
      )}
    </form>
  );
}

function Problems({ errors }: { errors: { field: string; message: string }[] }) {
  if (errors.length === 0) return null;
  return <p className="mb-2 pl-[var(--field-label-w)] text-destructive">{formatErrors(errors)}</p>;
}
