/**
 * Content handlers for installing different types of Claude Code content.
 *
 * Each handler implements the ContentHandler interface and is registered
 * in the handler registry for dynamic dispatch.
 */

// Export types
export type { ContentHandler, InstallResult } from "./types.js";

// Export handler registry
export { registerHandler, getHandler, hasHandler, getRegisteredTypes } from "./registry.js";

// Export individual handlers
export { skillHandler, installSkill, uninstallSkill, getInstalledSkills } from "./skill.js";
export { agentHandler, installAgent, uninstallAgent, getInstalledAgents } from "./agent.js";
export { hookHandler, installHook, uninstallHook, getInstalledHooks } from "./hook.js";
export { mcpHandler, installMcp, uninstallMcp, getInstalledMcpServers } from "./mcp.js";
export { settingsHandler, installSettings } from "./settings.js";
export { pluginHandler, installPlugin, uninstallPlugin, getInstalledPlugins } from "./plugin.js";

// Register all handlers
import { registerHandler } from "./registry.js";
import { skillHandler } from "./skill.js";
import { agentHandler } from "./agent.js";
import { hookHandler } from "./hook.js";
import { mcpHandler } from "./mcp.js";
import { settingsHandler } from "./settings.js";
import { pluginHandler } from "./plugin.js";

registerHandler(skillHandler);
registerHandler(agentHandler);
registerHandler(hookHandler);
registerHandler(mcpHandler);
registerHandler(settingsHandler);
registerHandler(pluginHandler);
