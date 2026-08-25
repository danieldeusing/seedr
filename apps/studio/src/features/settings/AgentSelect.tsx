import type { CanonicalCodingAgent } from "@seedr/shared";
import { AGENT_LABELS, CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { Select } from "@/core/ui/Select";

/**
 * Choose which coding agent runs a job. Every agent is listed so the choice is
 * visibly a choice, but only the ones with a certified adapter for this job are
 * selectable — the others say why not.
 */
export function AgentSelect({
  value,
  onChange,
  certified,
  job,
  ariaLabel,
  disabled = false,
}: {
  value: CanonicalCodingAgent;
  onChange(agent: CanonicalCodingAgent): void;
  certified: readonly CanonicalCodingAgent[];
  /** Names the job in the refusal tip, e.g. "draft" or "git". */
  job: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      disabled={disabled}
      options={CANONICAL_AGENTS.map((agent) => ({
        value: agent,
        label: AGENT_LABELS[agent],
        disabled: !certified.includes(agent),
        tip: certified.includes(agent) ? undefined : `${AGENT_LABELS[agent]} has no certified ${job} adapter yet`,
      }))}
    />
  );
}
