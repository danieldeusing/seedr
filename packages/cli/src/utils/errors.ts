import chalk from "chalk";

/** `Error: a`, then `  caused by: b` for each wrapped cause. */
function describe(error: unknown): string[] {
  if (!(error instanceof Error)) return [typeof error === "string" ? error : "Unknown error"];
  const lines = [error.message];
  let cause: unknown = error.cause;
  while (cause instanceof Error) {
    lines.push(cause.message);
    cause = cause.cause;
  }
  if (cause !== undefined && typeof cause === "string") lines.push(cause);
  return lines;
}

export function handleCommandError(error: unknown): never {
  const [message, ...causes] = describe(error);
  console.error(chalk.red(`Error: ${message}`));
  // The wrapped cause is what distinguishes DNS failure from a proxy or a TLS
  // error; without it every registry problem reads the same.
  for (const cause of causes) console.error(chalk.gray(`  caused by: ${cause}`));
  if (process.env.SEEDR_DEBUG && error instanceof Error && error.stack) {
    console.error(chalk.gray(error.stack));
  }
  process.exit(1);
}
