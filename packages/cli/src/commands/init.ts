import { Command } from "commander";
import * as ui from "../utils/ui.js";
import chalk from "chalk";
import ora from "ora";
import { join } from "node:path";
import { brand } from "../utils/ui.js";
import type { CodingAgent } from "../types.js";
import { ALL_AGENTS, CODING_AGENTS, getAgentPath } from "../config/agents.js";
import { parseAgentsArgStrict } from "../utils/detection.js";
import { ensureDir, exists, writeTextFile } from "../utils/fs.js";
import { handleCommandError } from "../utils/errors.js";

export interface InitOptions {
  agents?: string;
  yes?: boolean;
}

export function readmeFor(agent: CodingAgent): string {
  return `# ${CODING_AGENTS[agent].name} Configuration

This directory contains AI configuration files for ${CODING_AGENTS[agent].name}.

Add skills with:
\`\`\`bash
npx @danieldeusing/seedr add <skill-name> --agents ${agent}
\`\`\`

Browse available skills at https://seedr.danieldeusing.de
`;
}

/** Create an agent's project directory with a README; returns false when it already existed. */
export async function initializeAgent(agent: CodingAgent, cwd: string): Promise<boolean> {
  const path = getAgentPath(agent, "project", cwd);
  if (await exists(path)) return false;
  await ensureDir(path);
  await writeTextFile(join(path, "README.md"), readmeFor(agent));
  return true;
}

/**
 * The `init` flow without the commander wrapper. Returns the exit code.
 */
export async function runInit(options: InitOptions, cwd: string = process.cwd()): Promise<number> {
  const agentsArg = options.agents ?? "claude";
  let agents: CodingAgent[];
  if (agentsArg === "all") {
    agents = [...ALL_AGENTS];
  } else {
    const parsed = parseAgentsArgStrict(agentsArg);
    if (parsed.unknown.length > 0) {
      console.error(chalk.red(`Unknown agent(s): ${parsed.unknown.join(", ")}. Valid agents: ${ALL_AGENTS.join(", ")} or "all"`));
      return 1;
    }
    agents = parsed.agents;
  }

  if (agents.length === 0) {
    console.error(chalk.red("No valid agents specified"));
    return 1;
  }

  console.log(brand("\nWill initialize configuration for:"));
  for (const agent of agents) {
    console.log(`  - ${CODING_AGENTS[agent].name} → ${getAgentPath(agent, "project", cwd)}`);
  }
  console.log("");

  if (!options.yes) {
    const answer = await ui.confirm("Proceed?");
    const confirmed = !ui.prompts.isCancel(answer) && answer;
    if (!confirmed) {
      console.log(chalk.yellow("Cancelled"));
      return 0;
    }
  }

  for (const agent of agents) {
    const spinner = ora(`Initializing ${CODING_AGENTS[agent].name}...`).start();
    if (await initializeAgent(agent, cwd)) {
      spinner.succeed(brand(`Initialized ${CODING_AGENTS[agent].name}`));
    } else {
      spinner.info(chalk.gray(`${CODING_AGENTS[agent].name} already initialized`));
    }
  }

  console.log("");
  console.log(brand("Done! Use 'npx @danieldeusing/seedr add <skill>' to install skills."));
  return 0;
}

export const initCommand = new Command("init")
  .description("Initialize coding agent configuration directories")
  .option(
    "-a, --agents <agents>",
    "Comma-separated coding agents or 'all'",
    "claude"
  )
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (options: InitOptions) => {
    try {
      const exitCode = await runInit(options);
      if (exitCode !== 0) process.exit(exitCode);
    } catch (error) {
      handleCommandError(error);
    }
  });
