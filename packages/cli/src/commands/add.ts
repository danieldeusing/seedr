import { Command } from "commander";
import chalk from "chalk";
import type { CodingAgent, InstallScope, InstallMethod, RegistryItem } from "../types.js";
import type { ComponentType } from "@seedr/shared";
import { listItems, getItem, searchItems } from "../config/registry.js";
import { parseAgentsArg } from "../utils/detection.js";
import * as ui from "../utils/ui.js";
import { getHandler } from "../handlers/registry.js";
import type { InstallResult } from "../handlers/types.js";
import { handleCommandError } from "../utils/errors.js";
import { validateScope, validateMethod, validateType } from "../utils/validate-options.js";
import { trackInstalls } from "../utils/analytics.js";
import { CODING_AGENTS, getContentPath } from "../config/agents.js";
import { filterCompatibleAgents } from "../config/compatibility.js";
import { getAgentsPath } from "../utils/fs.js";

// Ensure handlers are registered
import "../handlers/index.js";

async function resolveItem(
  itemName: string | undefined,
  type: ComponentType | undefined
): Promise<RegistryItem | null> {
  if (itemName) {
    const item = await getItem(itemName, type);
    if (item) return item;

    const results = await searchItems(itemName);
    const filtered = type ? results.filter((r) => r.type === type) : results;

    if (filtered.length === 0) {
      // Check if the item exists under a different type
      if (type && results.length > 0) {
        const match = results.find((r) => r.slug === itemName);
        if (match) {
          ui.error(`"${itemName}" is a ${match.type}, not a ${type}. Run: seedr add ${itemName} --type ${match.type}`);
        } else {
          ui.error(`No ${type} matching "${itemName}". Found: ${results.map((r) => `${r.slug} (${r.type})`).join(", ")}`);
        }
      } else {
        ui.error(`"${itemName}" not found`);
      }
      return null;
    }
    if (filtered.length === 1) {
      return filtered[0]!;
    }
    ui.warn(`Multiple matches for "${itemName}"`);
    const selected = await ui.selectSkill(filtered);
    if (ui.prompts.isCancel(selected)) {
      ui.cancelled();
      return null;
    }
    return selected as RegistryItem;
  }

  // No name provided - list items of the specified type (or all skills)
  const items = await listItems(type || "skill");
  if (items.length === 0) {
    ui.error(`No ${type || "skill"}s available in registry`);
    return null;
  }
  const selected = await ui.selectSkill(items);
  if (ui.prompts.isCancel(selected)) {
    ui.cancelled();
    return null;
  }
  return selected as RegistryItem;
}

function resolveAgents(
  agentsArg: string | undefined,
  item: RegistryItem
): CodingAgent[] {
  // Filter agents by both item compatibility and type compatibility
  const typeCompatible = filterCompatibleAgents(item.type, item.compatibility);

  if (!agentsArg) return [];

  const agents = parseAgentsArg(agentsArg, typeCompatible);

  if (agentsArg === "all") return agents;

  const incompatible = agents.filter((a) => !typeCompatible.includes(a));
  if (incompatible.length > 0) {
    ui.warn(`${incompatible.join(", ")} not compatible with this ${item.type}`);
    return agents.filter((a) => typeCompatible.includes(a));
  }
  return agents;
}

function printDryRunSummary(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  cwd: string
): void {
  ui.info("Dry run - no files will be written\n");

  console.log(ui.brand("  Would install:"));
  console.log(`    ${item.type}: ${chalk.white(item.name)}`);
  console.log(`    Scope: ${chalk.white(scope)}`);
  console.log(`    Method: ${chalk.white(method)}`);
  console.log();

  // Show central location for symlink method
  if (method === "symlink" && item.type === "skill") {
    const centralPath = getAgentsPath("skill", item.slug, scope, cwd);
    console.log(ui.brand("  Central storage:"));
    console.log(`    ${chalk.gray("→")} ${chalk.gray(centralPath)}`);
    console.log();
    console.log(ui.brand("  Symlinks from agent folders:"));
  } else {
    console.log(ui.brand("  Target locations:"));
  }

  for (const agent of agents) {
    const config = CODING_AGENTS[agent];
    const contentPath = getContentPath(agent, item.type, scope, cwd);
    if (!contentPath) {
      console.log(`    ${chalk.gray("→")} ${chalk.white(config.name)}: ${chalk.red("not supported")}`);
      continue;
    }

    const targetPath = `${contentPath}/${item.slug}`;
    console.log(`    ${chalk.gray("→")} ${chalk.white(config.name)}: ${chalk.gray(targetPath)}`);
  }
  console.log();
}

function printInstallSummary(results: InstallResult[]): void {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (successful.length > 0) {
    ui.success(`Installed for ${successful.length} agent(s)`);
    for (const r of successful) {
      console.log(chalk.gray(`    → ${r.path}`));
    }
  }

  if (failed.length > 0) {
    ui.error(`Failed for ${failed.length} agent(s)`);
    for (const r of failed) {
      console.log(chalk.red(`    × ${r.agent}: ${r.error}`));
    }
    process.exit(1);
  }
}

export const addCommand = new Command("add")
  .description("Install a skill, agent, hook, or other configuration")
  .argument("[name]", "Name of the item to install")
  .option("-t, --type <type>", "Content type: skill, agent, hook, mcp, plugin, settings")
  .option(
    "-a, --agents <agents>",
    "Comma-separated coding agents or 'all' (claude,copilot,gemini,codex,opencode)"
  )
  .option("-s, --scope <scope>", "Installation scope: project, user, or local")
  .option("-m, --method <method>", "Installation method: symlink or copy")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("-f, --force", "Overwrite existing files")
  .option("-n, --dry-run", "Show what would be installed without making changes")
  .action(async (name, options) => {
    try {
      ui.printLogo();
      ui.intro("Seedr");

      const optionError =
        validateType(options.type) ||
        validateScope(options.scope) ||
        validateMethod(options.method);
      if (optionError) {
        ui.error(optionError);
        process.exit(1);
      }

      const itemName = name;
      const contentType = options.type as ComponentType | undefined;

      // Step 1: Get or prompt for item
      const item = await resolveItem(itemName, contentType);
      if (!item) process.exit(1);

      ui.step(`Selected: ${ui.brand(item.name)} ${chalk.gray(`(${item.type})`)} ${chalk.gray(`- ${item.description}`)}`);

      // Verify handler exists for this type
      const handler = getHandler(item.type);
      if (!handler) {
        ui.error(`No handler found for type "${item.type}"`);
        process.exit(1);
      }

      // Step 2: Get or prompt for agents
      let agents = resolveAgents(options.agents, item);
      const typeCompatible = filterCompatibleAgents(item.type, item.compatibility);

      if (agents.length === 0) {
        if (typeCompatible.length === 1) {
          // Only one compatible agent, use it directly
          agents = typeCompatible;
        } else {
          const selected = await ui.selectAgents(typeCompatible);
          if (ui.prompts.isCancel(selected)) {
            ui.cancelled();
            return;
          }
          agents = selected as CodingAgent[];
        }
      }

      if (agents.length === 0) {
        ui.error("No valid agents selected");
        process.exit(1);
      }

      ui.step(`Agents: ${ui.brand(agents.join(", "))}`);

      // Step 3: Get or prompt for scope
      let scope: InstallScope;
      if (options.scope) {
        scope = options.scope;
      } else {
        const supportsLocal = ["plugin", "settings", "hook"].includes(item.type);
        const selected = await ui.selectScope(supportsLocal);
        if (ui.prompts.isCancel(selected)) {
          ui.cancelled();
          return;
        }
        scope = selected as InstallScope;
      }

      ui.step(`Scope: ${ui.brand(scope)}`);

      // Step 4: Get or prompt for method (only if multiple agents selected)
      let method: InstallMethod;
      if (options.method) {
        method = options.method;
      } else if (agents.length === 1) {
        // Single agent - always use copy (symlink only makes sense for shared central storage)
        method = "copy";
      } else {
        const symlinkPath = getAgentsPath(item.type, item.slug, scope, process.cwd());
        const selected = await ui.selectMethod(symlinkPath);
        if (ui.prompts.isCancel(selected)) {
          ui.cancelled();
          return;
        }
        method = selected as InstallMethod;
      }

      ui.step(`Method: ${ui.brand(method)}`);

      // Dry run: show what would happen and exit
      if (options.dryRun) {
        console.log();
        printDryRunSummary(item, agents, scope, method, process.cwd());
        ui.outro("Dry run complete");
        return;
      }

      // Step 5: Confirm
      if (!options.yes) {
        console.log();
        const confirmed = await ui.confirm("Proceed with installation?");
        if (ui.prompts.isCancel(confirmed) || !confirmed) {
          ui.cancelled();
          return;
        }
      }

      // Overwrite an existing destination only when explicitly forced, or when
      // the user passed through the interactive confirmation above. With
      // --yes (non-interactive) and no --force, refuse to clobber existing files.
      const force = Boolean(options.force) || !options.yes;

      // Step 6: Install using the handler and print summary
      console.log();
      const results = await handler.install(item, agents, scope, method, force, process.cwd());
      trackInstalls(item.slug, item.type, results, scope);
      printInstallSummary(results);

      ui.outro("Installation complete");
    } catch (error) {
      handleCommandError(error);
    }
  });
