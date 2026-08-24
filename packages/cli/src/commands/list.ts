import { Command } from "commander";
import chalk from "chalk";
import type { CodingAgent, ComponentType, InstallScope } from "../types.js";
import { brand } from "../utils/ui.js";
import { listItems } from "../config/registry.js";
import { ALL_AGENTS, CODING_AGENTS } from "../config/agents.js";
import { getHandler, getRegisteredTypes } from "../handlers/registry.js";
import { handleCommandError } from "../utils/errors.js";
import { parseAgentsArgStrict } from "../utils/detection.js";
import { validateScope, validateType } from "../utils/validate-options.js";

// Ensure handlers are registered
import "../handlers/index.js";

// Display constants
const SEPARATOR_WIDTH = 40;
const SLUG_COLUMN_WIDTH = 24;

/**
 * Settings items are deep-merged into settings.json and leave no marker
 * behind, so there is nothing to discover after the fact.
 */
export const SETTINGS_NOT_DISCOVERABLE = "settings items cannot be discovered (they are merged into settings.json)";

// Type-to-color mapping for consistent styling
const TYPE_COLORS: Record<ComponentType, (s: string) => string> = {
  skill: chalk.magenta,
  hook: chalk.hex("#a855f7"),
  agent: chalk.blue,
  plugin: chalk.hex("#6366f1"),
  command: chalk.hex("#f59e0b"),
  settings: chalk.hex("#f97316"),
  mcp: chalk.hex("#2dd4bf"),
};

export interface ListOptions {
  type?: string;
  installed?: boolean;
  agents?: string;
  scope?: string;
}

export interface InstalledGroup {
  type: ComponentType;
  agent: CodingAgent;
  slugs: string[];
}

/**
 * Ask every registered handler what is installed, for the requested types,
 * agents and scope. Groups are ordered by type, then agent; empty groups are
 * omitted.
 */
export async function collectInstalledItems(params: {
  types?: ComponentType[];
  agents?: CodingAgent[];
  scope: InstallScope;
  cwd: string;
}): Promise<InstalledGroup[]> {
  const types = params.types ?? getRegisteredTypes();
  const agents = params.agents ?? ALL_AGENTS;
  const groups: InstalledGroup[] = [];

  for (const type of types) {
    const handler = getHandler(type);
    if (!handler) continue;
    for (const agent of agents) {
      const slugs = await handler.listInstalled(agent, params.scope, params.cwd);
      if (slugs.length > 0) {
        groups.push({ type, agent, slugs: [...slugs].sort() });
      }
    }
  }

  return groups;
}

function resolveListAgents(agentsArg: string | undefined): CodingAgent[] | string {
  if (!agentsArg || agentsArg === "all") return [...ALL_AGENTS];
  const { agents, unknown } = parseAgentsArgStrict(agentsArg);
  if (unknown.length > 0) {
    return `Unknown agent(s): ${unknown.join(", ")}. Valid agents: ${ALL_AGENTS.join(", ")} or "all"`;
  }
  return agents;
}

/**
 * The `list` flow without the commander wrapper. Returns the exit code.
 */
export async function runList(options: ListOptions, cwd: string = process.cwd()): Promise<number> {
  const optionError = validateType(options.type) || validateScope(options.scope);
  if (optionError) {
    console.log(chalk.red(optionError));
    return 1;
  }

  const type = options.type as ComponentType | undefined;
  if (!options.installed) {
    await listAvailable(type);
    return 0;
  }

  const agents = resolveListAgents(options.agents);
  if (typeof agents === "string") {
    console.log(chalk.red(agents));
    return 1;
  }

  const scope = (options.scope ?? "project") as InstallScope;
  await listInstalled({ types: type ? [type] : undefined, agents, scope, cwd });
  return 0;
}

export const listCommand = new Command("list")
  .alias("ls")
  .description("List available or installed items")
  .option("-t, --type <type>", "Filter by type (skill, hook, agent, plugin, mcp, settings)")
  .option("-i, --installed", "Show only installed items")
  .option("-a, --agents <agents>", "Comma-separated coding agents or 'all' (installed check)", "all")
  .option("--scope <scope>", "Scope for installed check (project, user, local)", "project")
  .action(async (options: ListOptions) => {
    try {
      const exitCode = await runList(options);
      if (exitCode !== 0) process.exit(exitCode);
    } catch (error) {
      handleCommandError(error);
    }
  });

async function listAvailable(type?: ComponentType): Promise<void> {
  const items = await listItems(type);

  if (items.length === 0) {
    console.log(chalk.yellow("No items found in registry"));
    return;
  }

  // Group by type
  const grouped = groupByType(items);

  for (const [itemType, typeItems] of Object.entries(grouped)) {
    const colorFn = TYPE_COLORS[itemType as ComponentType] ?? chalk.white;
    console.log(colorFn(`\n${itemType.toUpperCase()}S`));
    console.log(chalk.gray("─".repeat(SEPARATOR_WIDTH)));

    for (const item of typeItems) {
      const compatIcons = [...new Set(item.compatibility.map((a) => CODING_AGENTS[a].shortName))].join(" ");
      const featured = item.featured ? chalk.yellow("★ ") : "  ";
      console.log(
        `${featured}${chalk.white(item.slug.padEnd(SLUG_COLUMN_WIDTH))} ${chalk.gray(compatIcons)}`
      );
      console.log(`   ${chalk.gray(item.description)}`);
    }
  }

  console.log("");
  console.log(
    chalk.gray(`Total: ${items.length} items. Use 'npx @danieldeusing/seedr add <name>' to install.`)
  );
}

async function listInstalled(params: {
  types?: ComponentType[];
  agents: CodingAgent[];
  scope: InstallScope;
  cwd: string;
}): Promise<void> {
  console.log(brand(`\nInstalled items (${params.scope} scope):\n`));

  const groups = await collectInstalledItems(params);
  let total = 0;
  let currentType: ComponentType | null = null;

  for (const group of groups) {
    if (group.type !== currentType) {
      currentType = group.type;
      const colorFn = TYPE_COLORS[group.type] ?? chalk.white;
      console.log(colorFn(`${group.type.toUpperCase()}S`));
    }
    console.log(chalk.blue(`  ${CODING_AGENTS[group.agent].name}`));
    for (const slug of group.slugs) {
      console.log(`    ${chalk.white(slug)}`);
      total++;
    }
    console.log("");
  }

  if (!params.types || params.types.includes("settings")) {
    console.log(chalk.gray(`Note: ${SETTINGS_NOT_DISCOVERABLE}`));
  }

  if (total === 0) {
    console.log(chalk.yellow("No items installed"));
  } else {
    console.log(chalk.gray(`Total: ${total} installed`));
  }
}

/** Group items by their type */
function groupByType<T extends { type: ComponentType }>(
  items: T[]
): Record<ComponentType, T[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.type]) {
        acc[item.type] = [];
      }
      acc[item.type].push(item);
      return acc;
    },
    {} as Record<ComponentType, T[]>
  );
}
