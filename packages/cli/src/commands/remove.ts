import { Command } from "commander";
import * as ui from "../utils/ui.js";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope } from "../types.js";
import { brand } from "../utils/ui.js";
import type { ComponentType } from "@seedr/shared";
import { SETTINGS_NOT_DISCOVERABLE } from "../handlers/settings.js";
import { ALL_AGENTS, CODING_AGENTS } from "../config/agents.js";
import { parseAgentsArgStrict } from "../utils/detection.js";
import { getHandler } from "../handlers/registry.js";
import { handleCommandError } from "../utils/errors.js";
import { isValidSlug, MAX_SLUG_LENGTH, SLUG_PATTERN } from "../utils/slug.js";
import { validateScope, validateType, TYPE_LIST } from "../utils/validate-options.js";
import { isTypeSupported, describeIncompatibility } from "../config/compatibility.js";

// Ensure handlers are registered
import "../handlers/index.js";

export interface RemoveOptions {
  type?: string;
  agents?: string;
  scope?: string;
  yes?: boolean;
}

async function findInstalledAgents(
  slug: string,
  type: ComponentType,
  scope: InstallScope,
  cwd: string
): Promise<CodingAgent[]> {
  const handler = getHandler(type);
  if (!handler) return [];

  const agents: CodingAgent[] = [];
  for (const agent of ALL_AGENTS) {
    const installed = await handler.listInstalled(agent, scope, cwd);
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
  scope: InstallScope,
  cwd: string
): Promise<number> {
  const handler = getHandler(type);
  if (!handler) return 0;

  let successCount = 0;
  for (const agent of agents) {
    // "Not found" and "could never have been there" are different answers, and
    // reporting the second as the first sends people looking for an install
    // that was never possible. The exit code is unchanged: removal stays
    // idempotent, and naming an agent explicitly must not change the verdict.
    if (!isTypeSupported(type, agent)) {
      ora().start().info(
        chalk.gray(`Skipped ${CODING_AGENTS[agent].name}: ${describeIncompatibility(type, agent)}`)
      );
      continue;
    }

    const spinner = ora(`Removing from ${CODING_AGENTS[agent].name}...`).start();

    const removed = await handler.uninstall(slug, agent, scope, cwd);
    if (removed) {
      spinner.succeed(brand(`Removed from ${CODING_AGENTS[agent].name}`));
      successCount++;
    } else {
      spinner.info(chalk.gray(`Not found in ${CODING_AGENTS[agent].name}`));
    }
  }
  return successCount;
}

/**
 * Validate everything about a removal request before any handler runs.
 * Returns an error message, or null when the request is well-formed.
 */
export function validateRemoveRequest(name: unknown, options: RemoveOptions): string | null {
  if (!isValidSlug(name)) {
    return `Invalid item name ${JSON.stringify(name)}: expected a slug matching ${SLUG_PATTERN.source} (at most ${MAX_SLUG_LENGTH} characters)`;
  }
  const optionError = validateScope(options.scope) || validateType(options.type);
  if (optionError) return optionError;
  if (!options.type) {
    return "Please specify the content type with --type (skill, plugin, agent, hook, mcp, settings)";
  }
  if (options.agents && options.agents !== "all") {
    const { unknown } = parseAgentsArgStrict(options.agents);
    if (unknown.length > 0) {
      return `Unknown agent(s): ${unknown.join(", ")}. Valid agents: ${ALL_AGENTS.join(", ")} or "all"`;
    }
  }
  return null;
}

/**
 * The `remove` flow without the commander wrapper. Returns the exit code.
 */
export async function runRemove(name: string, options: RemoveOptions, cwd: string = process.cwd()): Promise<number> {
  const requestError = validateRemoveRequest(name, options);
  if (requestError) {
    console.log(chalk.red(requestError));
    return 1;
  }

  const scope = (options.scope ?? "project") as InstallScope;
  const type = options.type as ComponentType;

  const handler = getHandler(type);
  if (!handler) {
    console.log(chalk.red(`No handler found for type "${type}"`));
    return 1;
  }

  // Determine which agents to uninstall from
  let agents: CodingAgent[];
  if (!options.agents) {
    agents = await findInstalledAgents(name, type, scope, cwd);
  } else if (options.agents === "all") {
    agents = [...ALL_AGENTS];
  } else {
    agents = parseAgentsArgStrict(options.agents).agents;
  }

  if (agents.length === 0) {
    if (type === "settings") {
      // Auto-detection cannot see settings, so "not installed" would be a guess.
      console.log(chalk.yellow(`Cannot detect where "${name}" is installed: ${SETTINGS_NOT_DISCOVERABLE}`));
      console.log(chalk.gray("Name the agents explicitly, e.g. --agents claude"));
      return 1;
    }
    console.log(chalk.yellow(`${type} "${name}" is not installed in ${scope} scope`));
    return 0;
  }

  // Confirm
  if (!options.yes) {
    console.log(brand(`\nWill remove ${type} "${name}" from:`));
    for (const agent of agents) {
      console.log(`  - ${CODING_AGENTS[agent].name}`);
    }
    console.log("");

    const answer = await ui.confirm("Proceed with removal?");
    const confirmed = !ui.prompts.isCancel(answer) && answer;
    if (!confirmed) {
      console.log(chalk.yellow("Removal cancelled"));
      return 0;
    }
  }

  // Remove and report
  const successCount = await removeFromAgents(name, type, agents, scope, cwd);

  console.log("");
  if (successCount > 0) {
    console.log(brand(`Successfully removed from ${successCount} agent(s)`));
    return 0;
  }
  // The item is absent, which is the state the caller asked for — removal is
  // idempotent, and naming the agents explicitly must not change the verdict.
  // Exit 1 is reserved for "could not do what was asked" (see the settings
  // branch above), not for "already done".
  console.log(chalk.yellow("Nothing to remove"));
  return 0;
}

export const removeCommand = new Command("remove")
  .alias("rm")
  .description("Remove an installed item (skill, plugin, agent, hook, mcp)")
  .argument("<name>", "Name/slug of the item to remove")
  .option("-t, --type <type>", `Content type: ${TYPE_LIST}`)
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
  .action(async (name: string, options: RemoveOptions) => {
    try {
      const exitCode = await runRemove(name, options);
      if (exitCode !== 0) process.exit(exitCode);
    } catch (error) {
      handleCommandError(error);
    }
  });
