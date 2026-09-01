import type { ComponentType } from "@seedr/shared";
import { ALL_TYPES } from "./paths.js";

/**
 * What a folder of content looks like, from its file names alone.
 *
 * The rule the `/add-seedr` skill has always used, written down once so the skill,
 * Studio's add form and anything else agree. It answers two questions: is this
 * folder one capability of the type I asked for, and if not, what does it look
 * like instead.
 *
 * `mainFileName` does not answer the first one. It names the single content file
 * of a single-file type, so for a plugin it says `plugin.md` — a file no plugin
 * has ever had, since a plugin is marked by `.claude-plugin/plugin.json`.
 */
export const TYPE_MARKERS: Record<ComponentType, readonly string[]> = {
  skill: ["SKILL.md"],
  plugin: [".claude-plugin/plugin.json"],
  hook: ["hook.md"],
  agent: ["agent.md"],
  mcp: ["mcp.md", ".mcp.json"],
  settings: ["settings.json", "settings.md"],
  command: ["command.md"],
  rule: ["rule.md"],
};

/** Path segments that name a type, deepest match winning — the skill's own table. */
const PATH_SEGMENTS: [string, ComponentType][] = [
  ["/skills/", "skill"],
  ["/hooks/", "hook"],
  ["/agents/", "agent"],
  ["/plugins/", "plugin"],
  [".claude-plugin/", "plugin"],
  ["/mcp/", "mcp"],
  ["/settings/", "settings"],
  ["/commands/", "command"],
  ["/rules/", "rule"],
];

/**
 * Whether these files are one capability of `type` — the marker is present, so
 * the folder *is* the thing rather than a folder of several of them.
 */
export function isOneCapability(files: readonly string[], type: ComponentType): boolean {
  return TYPE_MARKERS[type].some((marker) => files.includes(marker));
}

/**
 * The type this content looks like, or null when nothing says.
 *
 * A marker in the files is the strongest signal; the path is consulted only when
 * no marker is there, because a folder can sit anywhere but its contents cannot
 * lie about what they are.
 */
export function looksLikeType(files: readonly string[], path = ""): ComponentType | null {
  const byContent = ALL_TYPES.find((type) => isOneCapability(files, type));
  if (byContent) return byContent;
  const haystack = `${path.split("\\").join("/")}/`;
  // Deepest segment wins: `.../plugins/x/skills/` is a skill inside a plugin.
  let deepest: { at: number; type: ComponentType } | null = null;
  for (const [segment, type] of PATH_SEGMENTS) {
    const at = haystack.lastIndexOf(segment);
    if (at >= 0 && (!deepest || at > deepest.at)) deepest = { at, type };
  }
  return deepest?.type ?? null;
}
