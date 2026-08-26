import { useEffect, useState } from "react";
import { Ban, Check, TriangleAlert } from "lucide-react";
import { gitBranches, type BranchInfo, type GitSummary } from "@/api/git";
import { AgentLog } from "@/core/ui/AgentLog";
import { IconButton } from "@/core/ui/IconButton";
import { AgentSelect } from "@/features/settings/AgentSelect";
import { GIT_CERTIFIED, useAgentSettings } from "@/features/settings/agentSettings";
import { SignedOutNotice } from "@/features/settings/SignedOutNotice";
import { usePublish } from "./publishStore";
import { pushTriggers } from "./workflows";

const input =
  "w-full border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Publish: pick the branches, say what the commit is about, and hand it to the
 * agent. Studio does not push by itself — but it does say, before anything runs,
 * which of the chosen branches start a workflow when they receive a push.
 */
export function PublishPanel({ summary }: { summary: GitSummary }) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [triggers, setTriggers] = useState<Record<string, string[]>>({});
  const [targets, setTargets] = useState<string[]>([summary.branch]);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [armed, setArmed] = useState(false);
  const agent = useAgentSettings((state) => state.preferred);
  const setAgent = useAgentSettings((state) => state.setPreferred);
  const [error, setError] = useState<string | null>(null);
  const { phase, log, verdict, error: jobError } = usePublish();
  const { run, cancel, reset } = usePublish.getState();

  useEffect(() => {
    void gitBranches()
      .then(setBranches)
      .catch((failure: Error) => setError(failure.message));
    void pushTriggers().then(setTriggers);
  }, []);

  const toggle = (name: string) => {
    setArmed(false);
    setTargets((current) => (current.includes(name) ? current.filter((branch) => branch !== name) : [...current, name]));
  };

  const deploying = targets.flatMap((branch) => (triggers[branch] ?? []).map((workflow) => `${branch} → ${workflow}`));
  const nothingToCommit = summary.changes.length === 0;
  const busy = phase === "running";

  if (phase === "done" && verdict) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto p-6 text-xs" aria-live="polite">
        <p className="prompt">publish</p>
        {verdict.kind === "published" && <p className="mt-4 text-success">Pushed to {verdict.branches.join(", ")}.</p>}
        {verdict.kind === "stopped" && (
          <p className="mt-4 text-destructive" role="alert">
            Stopped: {verdict.reason}
          </p>
        )}
        {verdict.kind === "unclear" && <pre className="mt-4 whitespace-pre-wrap text-muted-foreground">{verdict.text}</pre>}
        {log.length > 0 && <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap border border-border bg-muted p-2">{log.join("\n")}</pre>}
        <button type="button" onClick={reset} className="doc-link doc-link--forward mt-4 cursor-pointer text-sm">
          back to publish
        </button>
      </section>
    );
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-6 text-xs">
      <p className="prompt">publish</p>

      <div className="field-row mt-4" role="group" aria-label="branches">
        <span className="lbl" data-tip="Which branches the commit ends up on. The agent merges it across — never a cherry-pick, so the commit keeps its SHA.">
          branches
        </span>
        <div className="field-val">
          {error && <span className="text-destructive">{error}</span>}
          {branches.map((branch) => (
            <label key={branch.name} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-neutral-300">
              <input type="checkbox" className="accent-violet-500" checked={targets.includes(branch.name)} onChange={() => toggle(branch.name)} disabled={busy} />
              {branch.name}
              {branch.current && <span className="text-muted-foreground">(checked out)</span>}
              {!branch.upstream && (
                <span className="text-muted-foreground" data-tip="No upstream yet — the agent will set one on the first push">
                  ·new
                </span>
              )}
              {(triggers[branch.name] ?? []).length > 0 && (
                <TriangleAlert className="size-3 text-amber-400" data-tip={`A push to ${branch.name} starts ${(triggers[branch.name] ?? []).join(", ")}`} aria-label={`${branch.name} triggers a workflow`} />
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="field-row">
        <label className="lbl" htmlFor="publish-message" data-tip="The commit message. Leave it empty and the agent writes one in this repository's style.">
          message
        </label>
        <div className="field-val">
          <textarea id="publish-message" className={`${input} min-h-16`} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="the agent writes one" disabled={busy} />
        </div>
      </div>

      <div className="field-row">
        <label className="lbl" htmlFor="publish-notes" data-tip="Anything else the agent needs: what to leave out, which branch merges into which, what to check first.">
          notes
        </label>
        <div className="field-val">
          <textarea id="publish-notes" className={`${input} min-h-16`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. do not touch registry/, merge main into prod" disabled={busy} />
        </div>
      </div>

      {deploying.length > 0 && (
        <p className="mt-3 flex items-center gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-300">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          This push starts {deploying.join(", ")} — it reaches everyone, not just this checkout.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-700 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <AgentSelect value={agent} onChange={setAgent} certified={GIT_CERTIFIED} job="git" ariaLabel="coding agent" disabled={busy} />
          <span className="min-w-0 truncate text-sm text-neutral-500" role="status">
            {busy ? "the agent is working…" : nothingToCommit ? "nothing to commit" : `${summary.changes.length} changed path(s) from ${summary.branch}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {busy ? (
            <IconButton icon={Ban} ariaLabel="cancel the run" tip="cancel the run" onClick={() => void cancel()} />
          ) : armed ? (
            <>
              <IconButton
                icon={Check}
                ariaLabel={`commit and push to ${targets.join(", ")}`}
                tip="Run it"
                accentColor="red"
                active
                onClick={() => {
                  setArmed(false);
                  void run({ source: summary.branch, targets, message, notes, changes: summary.changes });
                }}
              />
              <IconButton icon={Ban} ariaLabel="keep it local" tip="keep it local" onClick={() => setArmed(false)} />
            </>
          ) : (
            <IconButton
              icon={Check}
              ariaLabel="commit and push"
              tip={nothingToCommit ? "nothing to commit" : "Review the targets, then confirm"}
              accentColor="violet"
              onClick={() => setArmed(true)}
              disabled={nothingToCommit || targets.length === 0}
            />
          )}
        </div>
      </div>

      {armed && (
        <p className="mt-3 text-amber-300" role="alert">
          Commit on {summary.branch} and push to {targets.join(", ")}. Confirm to run.
        </p>
      )}
      {jobError && <SignedOutNotice error={jobError} />}
      <AgentLog lines={log} />
    </section>
  );
}
