import { useEffect, useMemo, useRef } from "react";
import type { ScopeType } from "@seedr/shared";
import { AGENT_LABELS, CANONICAL_AGENTS, KNOWN_SCOPES } from "@seedr/registry-ops/pure";
import type { StudioItem } from "@/features/explorer/registry";
import { Ban, Check, X } from "lucide-react";
import { AgentLog } from "@/core/ui/AgentLog";
import { IconButton } from "@/core/ui/IconButton";
import { PromptField } from "@/core/ui/PromptField";
import { Select } from "@/core/ui/Select";
import { AgentSelect } from "@/features/settings/AgentSelect";
import { LabelRow } from "@/features/settings/LabelRow";
import { DRAFT_CERTIFIED, useAgentSettings } from "@/features/settings/agentSettings";
import { SignedOutNotice } from "@/features/settings/SignedOutNotice";
import { formProblems, toPatch, updateRefusal, useUpdate } from "./updateStore";

interface UpdateFormProps {
  item: StudioItem;
  onDone(): void;
}

/** Edit a first-party item's metadata; applied as one hash-guarded `update` transaction. */
export function UpdateForm({ item, onDone }: UpdateFormProps) {
  const form = useUpdate((s) => s.form);
  const probe = useUpdate((s) => s.probe);
  const phase = useUpdate((s) => s.phase);
  const draftErrors = useUpdate((s) => s.draftErrors);
  const error = useUpdate((s) => s.error);
  const outcome = useUpdate((s) => s.outcome);
  const jobReport = useUpdate((s) => s.jobReport);
  const log = useUpdate((s) => s.log);
  const target = useUpdate((s) => s.target);
  const { start, setField, toggleAgent, apply, cancel, reset } = useUpdate.getState();

  useEffect(() => {
    // The watcher rebuilds every StudioItem object on any registry event; the form
    // (and its open-time hash guard) restarts only when a different item is opened.
    if (target?.type !== item.type || target?.slug !== item.slug) void start(item);
  }, [item, target, start]);

  const close = () => {
    reset();
    onDone();
  };

  const refusal = updateRefusal(item);
  const problems = useMemo(() => formProblems(item, form), [item, form]);
  const changed = useMemo(() => Object.keys(toPatch(item, form)), [item, form]);
  const busy = phase === "applying" || phase === "running";
  // A prompt turns this from a metadata patch into a change to the capability.
  const asked = form.prompt.trim().length > 0;
  // the design system styles text inputs, selects and textareas itself
  const input = "w-full border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
  const formRef = useRef<HTMLFormElement>(null);
  const agent = useAgentSettings((state) => state.preferred);
  const setAgent = useAgentSettings((state) => state.setPreferred);
  const problemFor = (field: string) => problems.filter((p) => p.field === field);

  if (phase === "done" && (outcome || jobReport !== null)) {
    return (
      <section className="p-6 text-xs" aria-live="polite">
        <p className="prompt">{outcome ? "registry-op run --op update" : "agent job"}</p>
        {outcome ? (
          <>
            <p className="mt-4 text-primary">
              Updated {outcome.type}/{outcome.slug} at {outcome.headBefore.slice(0, 7)}.
            </p>
            <ul className="mt-2 text-muted-foreground">
              {outcome.changedPaths.map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="mt-4 text-primary">
              The agent finished with {item.type}/{item.slug}.
            </p>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-muted-foreground">{jobReport}</pre>
            <p className="mt-4 text-muted-foreground">Review it with git status before committing.</p>
          </>
        )}
        <button type="button" onClick={close} className="doc-link doc-link--forward mt-4 cursor-pointer text-sm">
          back to the item
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
      <p className="prompt">
        update {item.type}/{item.slug}
      </p>
      {refusal && (
        <p className="mt-3 text-destructive" role="alert">
          {refusal}
        </p>
      )}

      <div className="field-row mt-4">
        <label className="lbl" htmlFor="update-pre-prompt" data-tip="The standing context for this type, from settings → pre-prompts. Sent ahead of the prompt below; edit it here to change it for this run only.">
          pre-prompt
        </label>
        <div className="field-val">
          <PromptField
            id="update-pre-prompt"
            className={`${input} min-h-16`}
            value={form.prePrompt}
            onChange={(value) => setField("prePrompt", value)}
            placeholder={`nothing standing for ${item.type} — set one in settings → pre-prompts`}
            disabled={busy || !!refusal}
          />
        </div>
      </div>

      <div className="field-row">
        <label className="lbl" htmlFor="update-prompt" data-tip="What this run should change about the capability. Leave it empty to apply only the metadata below.">
          prompt
        </label>
        <div className="field-val">
          <PromptField
            id="update-prompt"
            className={`${input} min-h-16`}
            value={form.prompt}
            onChange={(value) => setField("prompt", value)}
            placeholder="what to change — leave empty for metadata only, type / for a skill"
            disabled={busy || !!refusal}
          />
        </div>
      </div>

      {asked && (
        <div className="field-row">
          <span className="lbl" data-tip="Off when you have written the description yourself and want it kept exactly as it is.">metadata</span>
          <div className="field-val">
            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-neutral-300">
              <input type="checkbox" className="accent-violet-500" checked={form.refreshMeta} onChange={() => setField("refreshMeta", !form.refreshMeta)} disabled={busy || !!refusal} /> let the agent rewrite the
              description and tl;dr to match
            </label>
          </div>
        </div>
      )}

      <div className="field-row">
        <label className="lbl" htmlFor="update-name" data-tip="The display name, shown in the explorer and on the web.">
          name
        </label>
        <div className="field-val">
          <input id="update-name" className={input} value={form.name} onChange={(e) => setField("name", e.target.value)} disabled={busy || !!refusal} />
        </div>
      </div>
      <Problems errors={problemFor("name")} />

      {/* A legend cannot sit in the field-row grid, which is what pushed the
          checkboxes out of the value column and wrapped names mid-word. Same
          table-style row as every other field: label column, value column. */}
      <div className="field-row" role="group" aria-label="agents">
        <span className="lbl" data-tip="The coding agents this capability supports. Installing it for an agent it does not list is refused.">
          agents
        </span>
        <div className="field-val">
          {CANONICAL_AGENTS.map((agent) => (
            <label key={agent} className="flex cursor-pointer items-center gap-1.5 text-neutral-300 whitespace-nowrap">
              <input type="checkbox" className="accent-violet-500" checked={form.compatibility.includes(agent)} onChange={() => toggleAgent(agent)} disabled={busy || !!refusal} /> {AGENT_LABELS[agent]}
            </label>
          ))}
        </div>
      </div>
      <Problems errors={problemFor("compatibility")} />

      <div className="field-row">
        <label className="lbl" htmlFor="update-scope" data-tip="Where the CLI installs it by default — the project, or the user's home.">
          scope
        </label>
        <div className="field-val">
          <Select<ScopeType | "">
            id="update-scope"
            ariaLabel="scope"
            value={form.targetScope}
            options={[{ value: "" as const, label: "no default scope" }, ...KNOWN_SCOPES.map((scope) => ({ value: scope, label: scope }))]}
            onChange={(scope) => setField("targetScope", scope)}
            disabled={busy || !!refusal}
          />
        </div>
      </div>

      <LabelRow value={form.label} onChange={(label) => setField("label", label)} disabled={busy || !!refusal} id="update-label" />

      <div className="field-row">
        <label className="lbl" htmlFor="update-description" data-tip="One sentence: what it does. Shown in every list.">
          description
        </label>
        <div className="field-val">
          <input id="update-description" className={input} value={form.description} onChange={(e) => setField("description", e.target.value)} disabled={busy || !!refusal} />
        </div>
      </div>
      <Problems errors={problemFor("description")} />

      <div className="field-row">
        <label className="lbl" htmlFor="update-long" data-tip="The TL;DR on the detail page — what is inside, how much, what makes it different. At least 30 words.">
          tl;dr
        </label>
        <div className="field-val">
          <textarea id="update-long" className={`${input} min-h-24`} value={form.longDescription} onChange={(e) => setField("longDescription", e.target.value)} disabled={busy || !!refusal} />
        </div>
      </div>
      <Problems errors={problemFor("longDescription")} />

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-700 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <AgentSelect value={agent} onChange={setAgent} certified={DRAFT_CERTIFIED} job="update" ariaLabel="coding agent" disabled={busy || !!refusal} />
          <span className="min-w-0 truncate text-sm text-neutral-500" role="status">
            {phase === "running"
              ? "the agent is working…"
              : phase === "applying"
                ? "applying…"
                : asked
                  ? `the agent changes the ${item.type}${changed.length > 0 ? `, and ${changed.length} field${changed.length === 1 ? "" : "s"} with it` : ""}`
                  : changed.length === 0
                    ? "nothing changed yet"
                    : `${changed.length} change${changed.length === 1 ? "" : "s"} to apply`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {phase === "running" && <IconButton icon={Ban} ariaLabel="cancel the run" tip="cancel the run" onClick={() => void cancel()} />}
          <IconButton icon={X} ariaLabel="cancel" tip="cancel" onClick={close} />
          <IconButton
            icon={Check}
            ariaLabel={asked ? "hand it to the agent" : `apply ${changed.length} change${changed.length === 1 ? "" : "s"}`}
            tip={asked ? "hand it to the agent" : "apply the changes"}
            accentColor="violet"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={busy || !!refusal || (!asked && changed.length === 0) || problems.length > 0 || (asked && !probe?.available)}
            spin={busy}
          />
        </div>
      </div>
      {draftErrors.length > 0 && (
        <p className="mt-3 text-destructive" role="alert">
          Draft rejected: {draftErrors.join("; ")}
        </p>
      )}
      <AgentLog lines={log} />
      {error && !refusal && <SignedOutNotice error={error} />}
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
