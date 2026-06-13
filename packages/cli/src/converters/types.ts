/**
 * Strategy pattern interfaces for skill conversion.
 *
 * Each AI tool has a converter that transforms the canonical (Claude) format
 * to the tool-specific format.
 */

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  "allowed-tools"?: string[];
  [key: string]: unknown;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  raw: string;
}

/**
 * Strategy interface for converting skills to tool-specific formats.
 */
export interface SkillConverter {
  /**
   * Convert a parsed skill to the tool-specific format.
   * @param skill - The parsed skill with frontmatter and body
   * @returns The converted content as a string
   */
  convert(skill: ParsedSkill): string;
}
