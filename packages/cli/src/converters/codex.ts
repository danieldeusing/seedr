import type { SkillConverter, ParsedSkill } from "./types.js";

/**
 * OpenAI Codex converter.
 * Converts to AGENTS.md format with structured metadata.
 */
export const codexConverter: SkillConverter = {
  convert(skill: ParsedSkill): string {
    const { frontmatter, body } = skill;
    const lines: string[] = [];

    lines.push("# Agent Instructions", "");

    if (frontmatter.name) {
      lines.push(`**Name:** ${frontmatter.name}`);
    }

    if (frontmatter.description) {
      lines.push(`**Description:** ${frontmatter.description}`);
    }

    if (frontmatter.name || frontmatter.description) {
      lines.push("");
    }

    lines.push("## Behavior", "", body);

    return lines.join("\n");
  },
};
