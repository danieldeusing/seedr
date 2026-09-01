import type { ComponentType } from "@seedr/shared";
import { ALL_TYPES } from "@seedr/registry-ops/pure";
import { PromptField } from "@/core/ui/PromptField";
import { usePrePrompts, type PrePromptJob } from "./prePrompts";

/**
 * What to say for each type, as a starting point rather than a default: these
 * are placeholders, so an empty field sends nothing and the agent is told only
 * what someone chose to tell it.
 *
 * Per type because a single line cannot serve seven of them. Every type used to
 * show the skill's — "use the skill-creator skill; when finished, run
 * skill-optimizer" — which is wrong advice under `plugin`, `mcp` and `settings`,
 * and reads as an instruction rather than an example nobody adapted.
 *
 * Each names what that type actually installs, which is the part an agent gets
 * wrong: a command is `<slug>.md` and becomes `/<slug>`, a hook is a shell
 * script plus its wiring, settings are deep-merged and leave no trace to find
 * afterwards. The skill and agent lines are Daniel's own, which is what they
 * were written from.
 */
const PLACEHOLDER: Record<ComponentType, Record<PrePromptJob, string>> = {
  rule: {
    add: "e.g. Keep it to one standing instruction, short enough to read on every turn. It becomes a file under `.claude/rules` for Claude, `.github/instructions` for Copilot, and a marked section in AGENTS.md for Codex and OpenCode.",
    update: "e.g. Keep the rule to a single instruction; if it has grown into several, split it rather than lengthening it.",
  },
  skill: {
    add: "e.g. Call the Skill tool with `skill-creator` to create the new skill. Call the Skill tool with `skill-optimizer` afterwards to verify and optimise it.",
    update: "e.g. Keep the SKILL.md frontmatter intact, and call the Skill tool with `skill-optimizer` afterwards to verify and optimise the skill.",
  },
  agent: {
    add: "e.g. Call the Skill tool with `agent-creator` to create the new agent. Keep the frontmatter description specific enough that it is chosen for the right work.",
    update: "e.g. Keep the frontmatter name and tools list intact; describe when the agent should be chosen, not only what it does.",
  },
  plugin: {
    add: "e.g. Keep `.claude-plugin/plugin.json` valid and list every command, agent and skill the plugin ships — the entry is metadata only, so the manifest is what people see.",
    update: "e.g. Re-read the upstream repository before editing: a plugin entry describes someone else's code, so it must not drift from what is actually published there.",
  },
  hook: {
    add: "e.g. Write the shell script and say which event fires it (PreToolUse, PostToolUse) and with what matcher. Exit 0 to allow, non-zero to block, and say which on stderr.",
    update: "e.g. Keep the event and matcher unchanged unless asked; a hook that starts firing on different tools is a different hook.",
  },
  mcp: {
    add: "e.g. Describe the server in `.mcp.json` vocabulary — command, args, env. Name the environment variables, never a key or token itself.",
    update: "e.g. Keep the server name stable — it is what installed configs reference. Re-check the upstream package before changing the command or its args.",
  },
  settings: {
    add: "e.g. Include only the keys this item means to set. Settings are deep-merged into settings.json and leave no per-item trace, so anything extra is silently inherited by every install.",
    update: "e.g. Removing a key here does not remove it from anyone who already installed it — say so in the description rather than assuming a clean replacement.",
  },
  command: {
    add: "e.g. The file is `<slug>.md` and becomes `/<slug>`, so name it for what it does. Say in the frontmatter description when to reach for it.",
    update: "e.g. Keep the slug — renaming it changes the command people type. Frontmatter description and argument-hint stay in step with the body.",
  },
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
            <PromptField id={`preprompt-${type}-${job}`} className={textarea} value={prompts[job]} placeholder={PLACEHOLDER[type][job]} onChange={(text) => setPrompt(type, job, text)} />
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
