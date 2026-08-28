import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { IconButton } from "@/core/ui/IconButton";
import { Select } from "@/core/ui/Select";
import { useJobModels, type ModelJob } from "./jobModels";
import { effortsFor, useModels } from "./models";

/**
 * Which model this job runs on, beside the agent that will run it.
 *
 * Here rather than in settings because the choice belongs to the job in front of
 * you: drafting a capability from a folder of source is a reading task worth a
 * large model, and committing what is already written is not. Deciding that two
 * dialogs away, in a page listing every agent at once, is deciding it out of
 * context — and then having to remember it was decided at all.
 *
 * The list is asked of the CLI, never written here, and asked on first sight of
 * an agent rather than on a visit to settings: the answer is cached per machine,
 * so this costs one process the first time an agent is used and nothing after.
 *
 * Empty means the CLI's own default, which stays the right answer until someone
 * has a reason to say otherwise.
 */
export function ModelSelect({ job, agent, disabled = false }: { job: ModelJob; agent: CanonicalCodingAgent; disabled?: boolean }) {
  const catalogue = useModels((state) => state.byAgent[agent]);
  const probing = useModels((state) => state.probing);
  const probe = useModels((state) => state.probe);
  const chosen = useJobModels((state) => state.chosen[`${agent}/${job}`] ?? "");
  const chosenEffort = useJobModels((state) => state.chosen[`${agent}/${job}#effort`] ?? "");
  const setJobModel = useJobModels((state) => state.set);
  const setEffort = useJobModels((state) => state.setEffort);

  useEffect(() => {
    // Only when nothing is known about this agent yet. A catalogue that came
    // back empty with a reason is an answer too, and asking again on every
    // render would spawn a CLI per render.
    if (!catalogue) void probe(agent);
  }, [agent, catalogue, probe]);

  const models = catalogue?.models ?? [];
  const efforts = effortsFor(agent, chosen);
  const busy = probing === agent;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {/* The empty branch carries no `role="status"`: it labels the control
          beside it rather than announcing progress, and a second live region
          competed with each form's own status line. */}
      {models.length === 0 ? (
        <span className="truncate text-sm text-neutral-500">
          {busy ? "asking for models…" : catalogue?.error ? "default model — the CLI did not answer" : "default model"}
        </span>
      ) : (
        <Select
          ariaLabel={`model for this ${job}`}
          value={chosen}
          options={[{ value: "", label: "default model" }, ...models.map((model) => ({ value: model, label: model }))]}
          onChange={(model) => setJobModel(agent, job, model)}
          disabled={disabled || busy}
        />
      )}
      {/* Only where the CLI has one, and only levels the chosen model accepts:
          codex's differ model by model, so a fixed list would offer `gpt-5.4` an
          `ultra` it refuses. An agent without the flag shows no dropdown. */}
      {efforts.length > 0 && (
        <Select
          ariaLabel={`effort for this ${job}`}
          value={chosenEffort}
          options={[{ value: "", label: "default effort" }, ...efforts.map((effort) => ({ value: effort, label: effort }))]}
          onChange={(effort) => setEffort(agent, job, effort)}
          disabled={disabled || busy}
        />
      )}
      <IconButton
        icon={RotateCw}
        size="xs"
        ariaLabel={`ask ${agent} what it can run`}
        tip="Ask this CLI what it can run — the catalogue moves"
        onClick={() => void probe(agent)}
        disabled={disabled || busy}
        spin={busy}
      />
    </span>
  );
}
