import type { SkillConverter, ParsedSkill } from "./types.js";

/**
 * GitHub Copilot converter.
 * Converts to .instructions.md format with simple markdown.
 */
export const copilotConverter: SkillConverter = {
  convert(skill: ParsedSkill): string {
    const { frontmatter, body } = skill;
    const lines: string[] = [];

    if (frontmatter.name) {
      lines.push(`# ${frontmatter.name}`, "");
    }

    if (frontmatter.description) {
      lines.push(frontmatter.description, "");
    }

    lines.push(body);

    return lines.join("\n");
  },
};
