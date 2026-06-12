import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { join } from "node:path";
import { brand } from "../utils/ui.js";
import { ALL_AGENTS, CODING_AGENTS, getAgentPath } from "../config/agents.js";
import { parseAgentsArg } from "../utils/detection.js";
import { promptConfirm } from "../utils/prompts.js";
import { ensureDir, exists, writeTextFile } from "../utils/fs.js";
import { handleCommandError } from "../utils/errors.js";

export const initCommand = new Command("init")
  .description("Initialize coding agent configuration directories")
  .option(
    "-a, --agents <agents>",
    "Comma-separated coding agents or 'all'",
    "claude"
  )
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (options) => {
    try {
      // Determine which agents to initialize
      const agents = parseAgentsArg(options.agents, ALL_AGENTS);

      if (agents.length === 0) {
        console.error(chalk.red("No valid agents specified"));
        process.exit(1);
      }

      console.log(brand("\nWill initialize configuration for:"));
      for (const agent of agents) {
        const path = getAgentPath(agent, "project");
        console.log(`  - ${CODING_AGENTS[agent].name} → ${path}`);
      }
      console.log("");

      if (!options.yes) {
        const confirmed = await promptConfirm("Proceed?");
        if (!confirmed) {
          console.log(chalk.yellow("Cancelled"));
          process.exit(0);
        }
      }

      for (const agent of agents) {
        const spinner = ora(`Initializing ${CODING_AGENTS[agent].name}...`).start();

        const path = getAgentPath(agent, "project");

        if (await exists(path)) {
          spinner.info(
            chalk.gray(`${CODING_AGENTS[agent].name} already initialized`)
          );
          continue;
        }

        await ensureDir(path);

        // Create a placeholder/readme file
        const readmePath = join(path, "README.md");
        await writeTextFile(
          readmePath,
          `# ${CODING_AGENTS[agent].name} Configuration

This directory contains AI configuration files for ${CODING_AGENTS[agent].name}.

Add skills with:
\`\`\`bash
npx @danieldeusing/seedr add <skill-name> --agents ${agent}
\`\`\`

Browse available skills at https://seedr.danieldeusing.de
`
        );

        spinner.succeed(brand(`Initialized ${CODING_AGENTS[agent].name}`));
      }

      console.log("");
      console.log(
        brand("Done! Use 'npx @danieldeusing/seedr add <skill>' to install skills.")
      );
    } catch (error) {
      handleCommandError(error);
    }
  });
