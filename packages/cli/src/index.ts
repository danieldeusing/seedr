// Public API exports
export type {
  CodingAgent,
  ComponentType,
  InstallScope,
  InstallMethod,
  CodingAgentConfig,
  RegistryItem,
  RegistryManifest,
  InstallOptions,
  InstalledItem,
} from "./types.js";

export { CODING_AGENTS, ALL_AGENTS, getAgentConfig, getAgentPath } from "./config/agents.js";
export {
  loadManifest,
  getItem,
  listItems,
  searchItems,
  getItemContent,
} from "./config/registry.js";

export { installSkill, uninstallSkill, getInstalledSkills } from "./handlers/skill.js";
export { convertSkillToTool, parseSkillMarkdown } from "./converters/index.js";
export { detectInstalledAgents, detectProjectAgents, isAgentInstalled } from "./utils/detection.js";
