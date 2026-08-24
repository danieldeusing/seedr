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

import { parse as parseYaml } from "yaml";
import type { CodingAgent } from "../types.js";
import type { SkillConverter, ParsedSkill, SkillFrontmatter } from "./types.js";
import { claudeConverter } from "./claude.js";
import { copilotConverter } from "./copilot.js";
import { antigravityConverter } from "./antigravity.js";
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
  antigravity: antigravityConverter,
  gemini: antigravityConverter,
  codex: codexConverter,
  opencode: opencodeConverter,
};

/**
 * Parse skill markdown content into frontmatter and body.
 */
export function parseSkillMarkdown(content: string): ParsedSkill {
  const { frontmatter, body } = splitFrontmatter(content);
  return {
    frontmatter,
    body: body.trim(),
    raw: content,
  };
}

const FRONTMATTER_PATTERN = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split a markdown document into its YAML frontmatter block and body.
 *
 * Only a leading `---` fence is recognised, and the YAML is parsed with the
 * maintained `yaml` package. Frontmatter that is not a YAML mapping (or fails
 * to parse) yields an empty frontmatter object rather than throwing, so a
 * malformed skill still converts as a plain document.
 */
export function splitFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  let frontmatter: SkillFrontmatter = {};
  try {
    const parsed: unknown = parseYaml(match[1]!);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as SkillFrontmatter;
    }
  } catch {
    frontmatter = {};
  }

  return { frontmatter, body: content.slice(match[0].length) };
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
