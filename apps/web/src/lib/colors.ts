import type { ComponentType, CodingAgent, SourceType, ScopeType } from "./types";

// Tailwind color names used by badge accents (see Label in components/ui/Label.tsx)
export type BadgeColor =
  | "neutral"
  | "green"
  | "red"
  | "blue"
  | "orange"
  | "purple"
  | "amber"
  | "emerald"
  | "indigo"
  | "teal"
  | "violet"
  | "pink";

// Icon names consumed by breadcrumb rendering
export type IconName = "sparkles" | "anchor" | "bot" | "puzzle" | "terminal" | "settings" | "server";

// Type labels for display (singular)
export const typeLabels: Record<ComponentType, string> = {
  skill: "Skill",
  hook: "Hook",
  agent: "Agent",
  plugin: "Plugin",
  command: "Command",
  settings: "Settings",
  mcp: "MCP Server",
};

// Type labels for display (plural)
export const typeLabelPlural: Record<ComponentType, string> = {
  skill: "Skills",
  hook: "Hooks",
  agent: "Agents",
  plugin: "Plugins",
  command: "Commands",
  settings: "Settings",
  mcp: "MCP Servers",
};

// URL path segment per type ("settings" is already plural)
export const typeToPath: Record<ComponentType, string> = {
  skill: "skills",
  hook: "hooks",
  agent: "agents",
  plugin: "plugins",
  command: "commands",
  settings: "settings",
  mcp: "mcps",
};

export function pathToType(path: string): ComponentType {
  return (path === "settings" ? "settings" : path.replace(/s$/, "")) as ComponentType;
}

// Type border colors for card indicators (using -500 to match configr)
export const typeBorderColors: Record<ComponentType, string> = {
  skill: "border-l-pink-500",
  command: "border-l-amber-500",
  hook: "border-l-purple-500",
  agent: "border-l-blue-500",
  mcp: "border-l-teal-500",
  settings: "border-l-orange-500",
  plugin: "border-l-indigo-500",
};

// Type icon/text colors (matching configr)
export const typeTextColors: Record<ComponentType, string> = {
  skill: "text-pink-500",
  command: "text-amber-500",
  hook: "text-purple-500",
  agent: "text-blue-500",
  mcp: "text-teal-500",
  settings: "text-orange-500",
  plugin: "text-indigo-500",
};

// Type to breadcrumb icon/color mapping
export const typeBreadcrumbIcon: Record<ComponentType, IconName> = {
  skill: "sparkles",
  hook: "anchor",
  agent: "bot",
  plugin: "puzzle",
  command: "terminal",
  settings: "settings",
  mcp: "server",
};

export const typeBreadcrumbColor: Record<ComponentType, string> = {
  skill: "pink",
  hook: "purple",
  agent: "blue",
  plugin: "indigo",
  command: "amber",
  settings: "orange",
  mcp: "teal",
};

// Source to badge color mapping (matches configr)
export const sourceToBadgeColor: Record<SourceType, BadgeColor> = {
  official: "amber",
  toolr: "blue",
  community: "violet",
};

export const sourceLabels: Record<SourceType, string> = {
  official: "Official",
  toolr: "Seedr",
  community: "Community",
};

export const agentLabels: Record<CodingAgent, string> = {
  claude: "Claude Code",
  copilot: "GitHub Copilot",
  gemini: "Gemini",
  codex: "Codex",
  opencode: "OpenCode",
};

// Scope to badge color mapping (matches configr)
export const scopeToBadgeColor: Record<ScopeType, BadgeColor> = {
  user: "emerald",
  project: "pink",
  local: "orange",
};

export const scopeLabels: Record<ScopeType, string> = {
  user: "User",
  project: "Project",
  local: "Local",
};

export const pluginTypeToBadgeColor: Record<"package" | "wrapper" | "integration", BadgeColor> = {
  package: "teal",
  wrapper: "neutral",
  integration: "red",
};
