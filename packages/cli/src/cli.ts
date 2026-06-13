import { Command } from "commander";
import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { removeCommand } from "./commands/remove.js";
import { initCommand } from "./commands/init.js";
import { printLogo } from "./utils/ui.js";
import packageJson from "../package.json";

const program = new Command();

program
  .name("seedr")
  .description("Seed your Coding Agents with capabilities")
  .version(packageJson.version)
  .addCommand(addCommand)
  .addCommand(listCommand)
  .addCommand(removeCommand)
  .addCommand(initCommand);

// Default action (no command) - show help
program.action(() => {
  printLogo();
  program.help();
});

program.parse();
