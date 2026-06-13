import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope } from "../types.js";
import { brand } from "../utils/ui.js";
import type { ComponentType } from "@seedr/shared";
import { ALL_AGENTS, CODING_AGENTS } from "../config/agents.js";
import { parseAgentsArg } from "../utils/detection.js";
import { promptConfirm } from "../utils/prompts.js";
import { getHandler } from "../handlers/registry.js";
import { handleCommandError } from "../utils/errors.js";
import { validateScope, validateType } from "../utils/validate-options.js";

// Ensure handlers are registered
import "../handlers/index.js";

async function findInstalledAgents(
  slug: string,
  type: ComponentType,
  scope: InstallScope
): Promise<CodingAgent[]> {
  const handler = getHandler(type);
  if (!handler) return [];

  const agents: CodingAgent[] = [];
  for (const agent of ALL_AGENTS) {
    const installed = await handler.listInstalled(agent, scope);
    if (installed.includes(slug)) {
      agents.push(agent);
    }
  }
  return agents;
}

async function removeFromAgents(
  slug: string,
  type: ComponentType,
  agents: CodingAgent[],
  scope: InstallScope
): Promise<number> {
  const handler = getHandler(type);
  if (!handler) return 0;

  let successCount = 0;
  for (const agent of agents) {
    const spinner = ora(`Removing from ${CODING_AGENTS[agent].name}...`).start();

    const removed = await handler.uninstall(slug, agent, scope);
    if (removed) {
      spinner.succeed(brand(`Removed from ${CODING_AGENTS[agent].name}`));
      successCount++;
    } else {
      spinner.info(chalk.gray(`Not found in ${CODING_AGENTS[agent].name}`));
    }
  }
  return successCount;
}

export const removeCommand = new Command("remove")
  .alias("rm")
  .description("Remove an installed item (skill, plugin, agent, hook, mcp)")
  .argument("<name>", "Name/slug of the item to remove")
  .option("-t, --type <type>", "Content type: skill, agent, hook, mcp, plugin, settings")
  .option(
    "-a, --agents <agents>",
    "Comma-separated coding agents or 'all'"
  )
  .option(
    "--scope <scope>",
    "Installation scope: project, user, or local",
    "project"
  )
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (name, options) => {
    try {
      const optionError = validateScope(options.scope) || validateType(options.type);
      if (optionError) {
        console.log(chalk.red(optionError));
        process.exit(1);
      }

      const scope: InstallScope = options.scope;
      const type: ComponentType | undefined = options.type;

      if (!type) {
        console.log(
          chalk.yellow(`Please specify the content type with --type (skill, plugin, agent, hook, mcp, settings)`)
        );
        process.exit(1);
      }

      const handler = getHandler(type);
      if (!handler) {
        console.log(chalk.red(`No handler found for type "${type}"`));
        process.exit(1);
      }

      // Determine which agents to uninstall from
      const agents = options.agents
        ? parseAgentsArg(options.agents, ALL_AGENTS)
        : await findInstalledAgents(name, type, scope);

      if (agents.length === 0) {
        console.log(
          chalk.yellow(`${type} "${name}" is not installed in ${scope} scope`)
        );
        process.exit(0);
      }

      // Confirm
      if (!options.yes) {
        console.log(brand(`\nWill remove ${type} "${name}" from:`));
        for (const agent of agents) {
          console.log(`  - ${CODING_AGENTS[agent].name}`);
        }
        console.log("");

        const confirmed = await promptConfirm("Proceed with removal?");
        if (!confirmed) {
          console.log(chalk.yellow("Removal cancelled"));
          process.exit(0);
        }
      }

      // Remove and report
      const successCount = await removeFromAgents(name, type, agents, scope);

      console.log("");
      if (successCount > 0) {
        console.log(
          brand(`Successfully removed from ${successCount} agent(s)`)
        );
      } else {
        console.log(chalk.yellow("Nothing to remove"));
      }
    } catch (error) {
      handleCommandError(error);
    }
  });
