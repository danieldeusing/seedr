/**
 * Skill Converter Registry
 *
 * Strategy pattern implementation for converting skills between AI tool formats.
 * The canonical format is Claude Code's markdown with YAML frontmatter.
 *
 * To add a new tool:
 * 1. Create a new converter file (e.g., newtool.ts)
 * 2. Implement the SkillConverter interface
 * 3. Add it to the converters registry below
 */

import matter from "gray-matter";
import type { CodingAgent } from "../types.js";
import type { SkillConverter, ParsedSkill, SkillFrontmatter } from "./types.js";
import { claudeConverter } from "./claude.js";
import { copilotConverter } from "./copilot.js";
import { geminiConverter } from "./gemini.js";
import { codexConverter } from "./codex.js";
import { opencodeConverter } from "./opencode.js";

// Re-export types for external use
export type { SkillConverter, ParsedSkill, SkillFrontmatter } from "./types.js";

/**
 * Registry of converters for each AI tool.
 * New tools should be added here.
 */
const converters: Record<CodingAgent, SkillConverter> = {
  claude: claudeConverter,
  copilot: copilotConverter,
  gemini: geminiConverter,
  codex: codexConverter,
  opencode: opencodeConverter,
};

/**
 * Parse skill markdown content into frontmatter and body.
 */
export function parseSkillMarkdown(content: string): ParsedSkill {
  const { data, content: body } = matter(content);
  return {
    frontmatter: data as SkillFrontmatter,
    body: body.trim(),
    raw: content,
  };
}

/**
 * Convert skill content to a specific tool format using the Strategy pattern.
 *
 * @param content - Raw skill content in canonical (Claude) format
 * @param targetTool - The AI tool to convert for
 * @returns Converted content string
 */
export function convertSkillToTool(content: string, targetTool: CodingAgent): string {
  const converter = converters[targetTool];
  if (!converter) {
    // Fallback for unknown tools - return as-is
    return content;
  }

  const skill = parseSkillMarkdown(content);
  return converter.convert(skill);
}

/**
 * Get the converter for a specific tool.
 * Useful for testing or advanced use cases.
 */
export function getConverter(tool: CodingAgent): SkillConverter | undefined {
  return converters[tool];
}

/**
 * Check if a converter exists for a tool.
 */
export function hasConverter(tool: CodingAgent): boolean {
  return tool in converters;
}
