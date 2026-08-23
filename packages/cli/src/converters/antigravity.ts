import type { SkillConverter, ParsedSkill } from "./types.js";

/**
 * Google Antigravity converter — the former Gemini Code Assist converter,
 * unchanged in output (plan §5, B1 renames; a format change would be B2's to make).
 * Produces a markdown skill with a blockquote description.
 */
export const antigravityConverter: SkillConverter = {
  convert(skill: ParsedSkill): string {
    const { frontmatter, body } = skill;
    const lines: string[] = [];

    if (frontmatter.name) {
      lines.push(`# ${frontmatter.name}`, "");
    }

    if (frontmatter.description) {
      lines.push(`> ${frontmatter.description}`, "");
    }

    lines.push("## Instructions", "", body);

    return lines.join("\n");
  },
};
