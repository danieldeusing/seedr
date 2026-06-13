import type { SkillConverter, ParsedSkill } from "./types.js";

/**
 * Gemini Code Assist converter.
 * Converts to GEMINI.md format with blockquote description.
 */
export const geminiConverter: SkillConverter = {
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
