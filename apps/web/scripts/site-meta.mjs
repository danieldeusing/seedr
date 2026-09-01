// Route metadata shared by the app (document.title on client-side navigation) and
// scripts/prerender-meta.mjs (the <head> of every prerendered dist/<route>/index.html),
// so both always agree. Plain JS with a .d.mts twin so the TypeScript app can import it.

export const SITE_ORIGIN = "https://seedr.danieldeusing.de";
export const SITE_NAME = "Seedr";
export const DEFAULT_DESCRIPTION =
  "Seed your Coding Agents with capabilities - skills, hooks, agents, and plugins for Claude Code, Copilot, Gemini, and more";

export const TYPE_PATHS = {
  skill: "skills",
  hook: "hooks",
  agent: "agents",
  plugin: "plugins",
  command: "commands",
  settings: "settings",
  mcp: "mcps",
  rule: "rules",
};

export const TYPE_LABELS = {
  skill: "Skill",
  hook: "Hook",
  agent: "Agent",
  plugin: "Plugin",
  command: "Command",
  settings: "Settings",
  mcp: "MCP Server",
  rule: "Rule",
};

export const TYPE_LABELS_PLURAL = {
  skill: "Skills",
  hook: "Hooks",
  agent: "Agents",
  plugin: "Plugins",
  command: "Commands",
  settings: "Settings",
  mcp: "MCP Servers",
  rule: "Rules",
};

const MAX_DESCRIPTION = 160;

function clip(text) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_DESCRIPTION) return oneLine;
  return `${oneLine.slice(0, MAX_DESCRIPTION - 1).replace(/\s+\S*$/, "")}…`;
}

export function homeMeta() {
  return { path: "/", title: `${SITE_NAME} — seed your coding agents with capabilities`, description: DEFAULT_DESCRIPTION, index: true };
}

export function privacyMeta() {
  return { path: "/privacy", title: `Privacy — ${SITE_NAME}`, description: `How ${SITE_NAME} handles data: no cookies, no tracking, and what the CLI's install statistics contain.`, index: true };
}

export function impressumMeta() {
  return { path: "/impressum", title: `Imprint — ${SITE_NAME}`, description: `Legal notice (Impressum) for ${SITE_NAME}.`, index: true };
}

export function notFoundMeta() {
  return { path: "/404", title: `Page not found — ${SITE_NAME}`, description: "This page does not exist.", index: false };
}

/**
 * The items a category page lists. Wrapper plugins are cross-listed on the
 * capability page they wrap, so this is NOT the raw per-type manifest length —
 * the app (getItemsByType) and the prerendered <meta> must agree or a page
 * ships a description contradicting what it renders.
 * @param {{ type: string, pluginType?: string, wrapper?: string }[]} items
 * @param {keyof typeof TYPE_PATHS} type
 */
export function itemsInCategory(items, type) {
  if (type === "plugin") return items.filter((item) => item.type === "plugin");
  return items.filter(
    (item) => item.type === type || (item.type === "plugin" && item.pluginType === "wrapper" && item.wrapper === type)
  );
}

/** @param {keyof typeof TYPE_PATHS} type @param {number} count */
export function categoryMeta(type, count) {
  const plural = TYPE_LABELS_PLURAL[type];
  return {
    path: `/${TYPE_PATHS[type]}`,
    title: `${plural} — ${SITE_NAME}`,
    description: clip(`Browse ${count} ${plural.toLowerCase()} for Claude Code, GitHub Copilot, Gemini, Codex and OpenCode, ready to install with the seedr CLI.`),
    index: true,
  };
}

/** @param {{ type: keyof typeof TYPE_PATHS, slug: string, name: string, description: string }} item */
export function itemMeta(item) {
  return {
    path: `/${TYPE_PATHS[item.type]}/${item.slug}`,
    title: `${item.name} — ${TYPE_LABELS[item.type]} — ${SITE_NAME}`,
    description: clip(item.description || DEFAULT_DESCRIPTION),
    index: true,
  };
}

/** Absolute canonical URL for a route path. */
export function canonicalUrl(path) {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}
