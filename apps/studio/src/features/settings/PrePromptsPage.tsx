import type { ComponentType } from "@seedr/shared";
import { ALL_TYPES } from "@seedr/registry-ops/pure";
import { PromptField } from "@/core/ui/PromptField";
import { usePrePrompts, type PrePromptJob } from "./prePrompts";

const PLACEHOLDER: Record<PrePromptJob, string> = {
  add: "e.g. use the skill-creator skill; when finished, run skill-optimizer",
  update: "e.g. keep the SKILL.md frontmatter intact and re-run skill-optimizer afterwards",
};

const JOB_TIP: Record<PrePromptJob, string> = {
  add: "Sent ahead of the prompt whenever a capability of this type is added",
  update: "Sent ahead of the prompt whenever a capability of this type is edited",
};

const textarea =
  "w-full min-h-16 border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none";

function TypeCard({ type }: { type: ComponentType }) {
  const prompts = usePrePrompts((s) => s.prompts[type]);
  const setPrompt = usePrePrompts((s) => s.set);

  return (
    <li className="space-y-3 border border-neutral-960 bg-neutral-980 p-4">
      <h4 className="text-sm font-medium text-neutral-200">{type}</h4>
      {(["add", "update"] as const).map((job) => (
        <div key={job} className="field-row">
          <label className="lbl" htmlFor={`preprompt-${type}-${job}`} data-tip={JOB_TIP[job]}>
            {job}
          </label>
          <div className="field-val">
            <PromptField id={`preprompt-${type}-${job}`} className={textarea} value={prompts[job]} placeholder={PLACEHOLDER[job]} onChange={(text) => setPrompt(type, job, text)} />
          </div>
        </div>
      ))}
    </li>
  );
}

/**
 * Settings → pre-prompts: the standing context an agent gets for a capability
 * type, once per job. Not a system prompt — it is shown in the add and edit
 * dialogs, where it can still be read and changed before anything runs.
 */
export function PrePromptsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-sm font-medium tracking-wider text-neutral-400 uppercase">capability pre-prompts</h3>
        <p className="mt-1 text-neutral-500">What the agent should always be told for a type — which authoring skill to use, what to run afterwards. The add and edit dialogs show it and send it ahead of their own prompt.</p>
      </header>
      <ul className="space-y-3">
        {ALL_TYPES.map((type) => (
          <TypeCard key={type} type={type} />
        ))}
      </ul>
    </div>
  );
}
