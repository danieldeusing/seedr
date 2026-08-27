import { RotateCw } from "lucide-react";
import { AGENT_LABELS, CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { IconButton } from "@/core/ui/IconButton";
import { Select } from "@/core/ui/Select";
import { MODEL_JOBS, useJobModels } from "./jobModels";
import { useModels } from "./models";

/**
 * Settings → models: which model each job runs on, per agent.
 *
 * The lists are asked of the CLIs, never written here. A catalogue moves — a
 * model ships, an org policy withdraws one, an account has a different set — and
 * a list in this file would be wrong within weeks and wrong quietly. When a probe
 * has not answered, the agent says so and offers nothing to choose.
 */
export function ModelsPage() {
  const byAgent = useModels((state) => state.byAgent);
  const probing = useModels((state) => state.probing);
  const probe = useModels((state) => state.probe);
  const probeAll = useModels((state) => state.probeAll);
  const chosen = useJobModels((state) => state.chosen);
  const setJobModel = useJobModels((state) => state.set);

  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-sm font-medium tracking-wider text-neutral-400 uppercase">models</h3>
        <p className="mt-1 text-neutral-500">
          Which model each job runs on. Drafting a capability from a folder of source is a reading task; committing what is already written and pushing it is not, and they need not be the same
          model. Empty means the CLI&rsquo;s own default.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <IconButton icon={RotateCw} ariaLabel="ask every agent" tip="Ask each CLI what it can run" accentColor="violet" onClick={() => void probeAll()} disabled={probing !== null} spin={probing !== null} />
        <span className="text-muted-foreground">{probing ? `asking ${AGENT_LABELS[probing as CanonicalCodingAgent]}…` : "Asked of each CLI, never a list written here."}</span>
      </div>

      {CANONICAL_AGENTS.map((agent) => {
        const catalogue = byAgent[agent];
        const models = catalogue?.models ?? [];
        return (
          <section key={agent} className="space-y-3 border border-neutral-960 bg-neutral-980 p-4">
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-300">{AGENT_LABELS[agent]}</span>
              <span className="text-muted-foreground">
                {models.length > 0
                  ? `${models.length} model${models.length === 1 ? "" : "s"}${catalogue?.probedAt ? ` · asked ${catalogue.probedAt}` : ""}`
                  : catalogue?.error
                    ? "did not answer"
                    : "not asked yet"}
              </span>
              <span className="flex-1" />
              <IconButton icon={RotateCw} ariaLabel={`ask ${AGENT_LABELS[agent]}`} tip="Ask this CLI what it can run" onClick={() => void probe(agent)} disabled={probing !== null} />
            </div>

            {catalogue?.error && (
              <p className="text-destructive" role="alert">
                {catalogue.error}
              </p>
            )}

            {models.length === 0 ? (
              <p className="text-muted-foreground">
                Nothing to choose from until this CLI answers. Every job runs on its default until then — which is a working answer, not a broken one.
              </p>
            ) : (
              MODEL_JOBS.map(({ job, label, hint }) => (
                <div key={job} className="field-row">
                  <label className="lbl" htmlFor={`model-${agent}-${job}`} data-tip={hint}>
                    {label}
                  </label>
                  <div className="field-val">
                    <Select
                      id={`model-${agent}-${job}`}
                      ariaLabel={`${label} model for ${AGENT_LABELS[agent]}`}
                      value={chosen[`${agent}/${job}`] ?? ""}
                      options={[{ value: "", label: `${AGENT_LABELS[agent]} default` }, ...models.map((model) => ({ value: model, label: model }))]}
                      onChange={(model) => setJobModel(agent, job, model)}
                    />
                  </div>
                </div>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
