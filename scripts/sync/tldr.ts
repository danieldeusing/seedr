/**
 * A first `longDescription` for a plugin imported wholesale from a marketplace mirror,
 * drafted from the plugin's own files: what each component says about itself in its
 * frontmatter, how the plugin installs, and — when that says too little — the README's
 * opening paragraph, then the marketplace entry's summary. `longDescription` is curated
 * (item.ts), so a maintainer's rewrite replaces the draft for good; the draft only has to
 * pass the description gate with facts read from the source, never invented ones.
 */

import { MIN_LONG_DESCRIPTION_WORDS } from "@seedr/registry-ops/pure";
import { findEntry, type CollectedContent, type PluginComponents } from "./content.js";
import { parseFrontmatter } from "./utils.js";

export interface DraftInput {
  /** Marketplace entry name and marketplace: `claude plugin install <name>@<marketplace>`. */
  name: string;
  marketplace: string;
  /** "owner/repo" holding the content, and the directory inside it ("" for the root). */
  repo: string;
  path: string;
  /** The entry's own summary — the last resort when the files say too little. */
  summary?: string;
  components: PluginComponents;
  content: CollectedContent;
}

const NAMED_PER_KIND = 8;
const COMPONENT_WORDS = 18;
const README_WORDS = 60;

interface Kind {
  key: keyof PluginComponents;
  singular: string;
  plural: string;
  /** Where a component's own markdown lives, for the description in its frontmatter. */
  markdown?: (name: string) => RegExp;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const KINDS: Kind[] = [
  { key: "skills", singular: "skill", plural: "skills", markdown: (name) => new RegExp(`(^|/)${escapeRegExp(name)}/SKILL\\.md$`) },
  { key: "agents", singular: "agent", plural: "agents", markdown: (name) => new RegExp(`(^|/)agents/(.+/)?${escapeRegExp(name)}\\.md$`) },
  { key: "commands", singular: "command", plural: "commands", markdown: (name) => new RegExp(`(^|/)commands/(.+/)?${escapeRegExp(name)}\\.md$`) },
  { key: "hooks", singular: "hook", plural: "hooks" },
  { key: "mcpServers", singular: "MCP server", plural: "MCP servers" },
];

export function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

function firstWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= limit ? words.join(" ") : `${words.slice(0, limit).join(" ")}…`;
}

/** "a", "a and b", "a, b and c" */
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The first sentence of a component's frontmatter description, shortened. */
function componentDescription(kind: Kind, name: string, content: CollectedContent): string | null {
  if (!kind.markdown) return null;
  const pattern = kind.markdown(name);
  const entry = content.entries.find((candidate) => pattern.test(candidate.path));
  if (!entry) return null;
  const description = parseFrontmatter(entry.bytes.toString("utf-8"))?.description?.replace(/\s+/g, " ").trim();
  if (!description) return null;
  const sentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  return firstWords(sentence.replace(/[.!?]$/, ""), COMPONENT_WORDS);
}

function listNamed(kind: Kind, names: readonly string[], content: CollectedContent): string {
  const named = names.slice(0, NAMED_PER_KIND).map((name) => {
    const description = componentDescription(kind, name, content);
    return description ? `\`${name}\` (${description})` : `\`${name}\``;
  });
  const rest = names.length - named.length;
  return rest > 0 ? `${named.join(", ")}, and ${rest} more` : named.join(", ");
}

/**
 * The README's opening paragraph: the first run of prose lines after the title, badges,
 * images and HTML are skipped, with links and emphasis reduced to their text.
 */
export function readmeLead(content: CollectedContent): string | null {
  const bytes = findEntry(content, "README.md") ?? findEntry(content, "readme.md");
  if (!bytes) return null;
  const paragraph: string[] = [];
  let inFence = false;
  for (const raw of bytes.toString("utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const skipped = line === "" || /^(#|!\[|\[!\[|<|\||>|---|\*\*\*|[-*] |\d+\. )/.test(line) || /^\[[^\]]*\]\([^)]*\)$/.test(line);
    if (!skipped) paragraph.push(line);
    else if (paragraph.length > 0) break;
  }
  if (paragraph.length === 0) return null;
  const text = paragraph
    .join(" ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)([^*_]+)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
  return firstWords(text, README_WORDS);
}

/** The draft, or null when even the README and the entry's summary leave it under the gate's minimum. */
export function draftLongDescription(input: DraftInput): string | null {
  const kinds = KINDS.map((kind) => ({ kind, names: input.components[kind.key] ?? [] })).filter(({ names }) => names.length > 0);
  const total = kinds.reduce((sum, { names }) => sum + names.length, 0);
  const count = ({ kind, names }: { kind: Kind; names: string[] }): string => `**${names.length} ${names.length === 1 ? kind.singular : kind.plural}**`;

  const paragraphs: string[] = [];
  if (total >= 3) {
    const bullets = kinds.map(
      ({ kind, names }) => `- **${kind.plural.charAt(0).toUpperCase()}${kind.plural.slice(1)}** (${names.length}): ${listNamed(kind, names, input.content)}`,
    );
    paragraphs.push(`Ships ${joinList(kinds.map(count))}.`, bullets.join("\n"));
  } else if (total > 0) {
    paragraphs.push(`Ships ${joinList(kinds.map((entry) => `${count(entry)}, ${listNamed(entry.kind, entry.names, input.content)}`))}.`);
  }
  paragraphs.push(`Installs with \`claude plugin install ${input.name}@${input.marketplace}\` from \`${input.repo}\`${input.path ? ` (\`${input.path}\`)` : ""}.`);

  for (const filler of [readmeLead(input.content), input.summary?.trim()]) {
    if (countWords(paragraphs.join("\n\n")) >= MIN_LONG_DESCRIPTION_WORDS) break;
    if (filler) paragraphs.push(filler);
  }
  const draft = paragraphs.join("\n\n");
  return countWords(draft) < MIN_LONG_DESCRIPTION_WORDS ? null : draft;
}
