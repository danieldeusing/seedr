import chalk from "chalk";

export function handleCommandError(error: unknown): never {
  console.error(
    chalk.red(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
  );
  process.exit(1);
}
