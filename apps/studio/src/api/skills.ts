import { invoke } from "@/core/lib/tauriInvoke";

/**
 * The skills `claude` could be asked for by name in this checkout: the repo's
 * own under `.agents/skills`, and the ones installed for the user. Studio does
 * not run them — it offers them while a prompt is being written, so a
 * pre-prompt can say "use the skill-creator skill" without a typo.
 */
export interface SkillEntry {
  name: string;
  description: string;
  scope: "project" | "user";
}

export const listSkills = (): Promise<SkillEntry[]> => invoke<SkillEntry[]>("list_skills");
