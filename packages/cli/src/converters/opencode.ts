import type { SkillConverter, ParsedSkill } from "./types.js";

/**
 * OpenCode converter.
 * Converts to agent markdown format with horizontal rule separator.
 */
export const opencodeConverter: SkillConverter = {
  convert(skill: ParsedSkill): string {
    const { frontmatter, body } = skill;
    const lines: string[] = [];

    if (frontmatter.name) {
      lines.push(`# ${frontmatter.name}`, "");
    }

    if (frontmatter.description) {
      lines.push(frontmatter.description, "");
    }

    lines.push("---", "", body);

    return lines.join("\n");
  },
};
