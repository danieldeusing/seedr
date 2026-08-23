import { useEffect, useMemo } from "react";
import type { ComponentType, ScopeType } from "@seedr/shared";
import { ALL_TYPES, CANONICAL_AGENTS, KNOWN_SCOPES, formatErrors } from "@seedr/registry-ops/pure";
import { formProblems, useAuthor } from "./store";

// New items only ever name canonical agents; the deprecated `gemini` id is not offered.
const AGENT_LABELS: Record<(typeof CANONICAL_AGENTS)[number], string> = {
  claude: "Claude Code",
  copilot: "GitHub Copilot",
  antigravity: "Google Antigravity",
  codex: "OpenAI Codex",
  opencode: "OpenCode",
};

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
  const input = "w-full border border-border bg-muted px-2 py-1 text-xs";

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
        <button type="button" onClick={reset} className="btn-terminal btn-terminal--ghost btn-terminal--compact mt-4">
          add another
        </button>
      </section>
    );
  }

  return (
    <form
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
          <button type="button" onClick={() => void chooseSource()} className="btn-terminal btn-terminal--ghost btn-terminal--compact" disabled={busy}>
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
            {ALL_TYPES.map((type) => (
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void draft()} className="btn-terminal btn-terminal--ghost btn-terminal--compact" disabled={busy || !probe?.available}>
          {phase === "drafting" ? "drafting…" : "draft descriptions with Claude"}
        </button>
        {phase === "drafting" && (
          <button type="button" onClick={() => void cancel()} className="btn-terminal btn-terminal--ghost btn-terminal--compact">
            cancel
          </button>
        )}
        <button type="submit" className="btn-terminal btn-terminal--compact" disabled={busy || problems.length > 0}>
          {phase === "applying" ? "applying…" : "add to registry"}
        </button>
        <span className="text-muted-foreground">
          {probe === null ? "probing Claude Code…" : probe.available ? `Claude Code ${probe.version}` : probe.diagnostic}
        </span>
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
  return <p className="mb-2 pl-[8.5rem] text-destructive">{formatErrors(errors)}</p>;
}
