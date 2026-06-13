import type { SkillConverter, ParsedSkill } from "./types.js";

/**
 * Claude Code converter - returns content as-is (canonical format).
 */
export const claudeConverter: SkillConverter = {
  convert(skill: ParsedSkill): string {
    return skill.raw;
  },
};
