import { useEffect, useMemo } from "react";
import type { ScopeType } from "@seedr/shared";
import { CANONICAL_AGENTS, KNOWN_SCOPES, formatErrors } from "@seedr/registry-ops/pure";
import type { StudioItem } from "@/features/explorer/registry";
import { formProblems, toPatch, updateRefusal, useUpdate } from "./updateStore";

interface UpdateFormProps {
  item: StudioItem;
  onDone(): void;
}

/** Edit a toolr item's metadata; applied as one hash-guarded `update` transaction. */
export function UpdateForm({ item, onDone }: UpdateFormProps) {
  const form = useUpdate((s) => s.form);
  const probe = useUpdate((s) => s.probe);
  const phase = useUpdate((s) => s.phase);
  const draftErrors = useUpdate((s) => s.draftErrors);
  const error = useUpdate((s) => s.error);
  const outcome = useUpdate((s) => s.outcome);
  const { start, setField, toggleAgent, redraft, apply, reset } = useUpdate.getState();

  useEffect(() => {
    void start(item);
    return () => reset();
  }, [item, start, reset]);

  const refusal = updateRefusal(item);
  const problems = useMemo(() => formProblems(item, form), [item, form]);
  const changed = useMemo(() => Object.keys(toPatch(item, form)), [item, form]);
  const busy = phase === "drafting" || phase === "applying";
  const input = "w-full border border-border bg-muted px-2 py-1 text-xs";
  const problemFor = (field: string) => problems.filter((p) => p.field === field);

  if (phase === "done" && outcome) {
    return (
      <section className="p-6 text-xs" aria-live="polite">
        <p className="prompt">registry-op run --op update</p>
        <p className="mt-4 text-primary">
          Updated {outcome.type}/{outcome.slug} at {outcome.headBefore.slice(0, 7)}.
        </p>
        <ul className="mt-2 text-muted-foreground">
          {outcome.changedPaths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
        <button type="button" onClick={onDone} className="btn-terminal btn-terminal--ghost btn-terminal--compact mt-4">
          back to the item
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
      <p className="prompt">
        update {item.type}/{item.slug}
      </p>
      {refusal && (
        <p className="mt-3 text-destructive" role="alert">
          {refusal}
        </p>
      )}

      <div className="field-row mt-4">
        <label className="lbl" htmlFor="update-name">
          name
        </label>
        <div className="field-val">
          <input id="update-name" className={input} value={form.name} onChange={(e) => setField("name", e.target.value)} disabled={busy || !!refusal} />
        </div>
      </div>
      <Problems errors={problemFor("name")} />

      <fieldset className="field-row" disabled={busy || !!refusal}>
        <legend className="lbl">agents</legend>
        <div className="field-val">
          {CANONICAL_AGENTS.map((agent) => (
            <label key={agent} className="mr-3">
              <input type="checkbox" checked={form.compatibility.includes(agent)} onChange={() => toggleAgent(agent)} /> {agent}
            </label>
          ))}
        </div>
      </fieldset>
      <Problems errors={problemFor("compatibility")} />

      <div className="field-row">
        <label className="lbl" htmlFor="update-scope">
          scope
        </label>
        <div className="field-val">
          <select id="update-scope" value={form.targetScope} onChange={(e) => setField("targetScope", e.target.value as ScopeType | "")} disabled={busy || !!refusal}>
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
        <label className="lbl" htmlFor="update-description">
          description
        </label>
        <div className="field-val">
          <input id="update-description" className={input} value={form.description} onChange={(e) => setField("description", e.target.value)} disabled={busy || !!refusal} />
        </div>
      </div>
      <Problems errors={problemFor("description")} />

      <div className="field-row">
        <label className="lbl" htmlFor="update-long">
          tl;dr
        </label>
        <div className="field-val">
          <textarea id="update-long" className={`${input} min-h-24`} value={form.longDescription} onChange={(e) => setField("longDescription", e.target.value)} disabled={busy || !!refusal} />
        </div>
      </div>
      <Problems errors={problemFor("longDescription")} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void redraft()} className="btn-terminal btn-terminal--ghost btn-terminal--compact" disabled={busy || !!refusal || !probe?.available}>
          {phase === "drafting" ? "drafting…" : "redraft descriptions with Claude"}
        </button>
        <button type="submit" className="btn-terminal btn-terminal--compact" disabled={busy || !!refusal || changed.length === 0 || problems.length > 0}>
          {phase === "applying" ? "applying…" : changed.length === 0 ? "nothing changed" : `apply ${changed.length} change${changed.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" onClick={onDone} className="link-quiet">
          cancel
        </button>
      </div>
      {draftErrors.length > 0 && (
        <p className="mt-3 text-destructive" role="alert">
          Draft rejected: {draftErrors.join("; ")}
        </p>
      )}
      {error && !refusal && (
        <p className="mt-3 text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Problems({ errors }: { errors: { field: string; message: string }[] }) {
  if (errors.length === 0) return null;
  return <p className="mb-2 pl-[8.5rem] text-destructive">{formatErrors(errors)}</p>;
}
