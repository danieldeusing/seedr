import * as p from "@clack/prompts";
import chalk from "chalk";
import type { CodingAgent, InstallScope, InstallMethod, RegistryItem } from "../types.js";
import { CODING_AGENTS } from "../config/agents.js";

export const brand = chalk.hex("#22c55e");
export const bgBrand = chalk.bgHex("#22c55e").black;

const LOGO = `
███████╗███████╗███████╗██████╗ ██████╗
██╔════╝██╔════╝██╔════╝██╔══██╗██╔══██╗
███████╗█████╗  █████╗  ██║  ██║██████╔╝
╚════██║██╔══╝  ██╔══╝  ██║  ██║██╔══██╗
███████║███████╗███████╗██████╔╝██║  ██║
╚══════╝╚══════╝╚══════╝╚═════╝ ╚═╝  ╚═╝`;

const URLS = {
  seedr: "https://seedr.danieldeusing.de",
};

export function printLogo(): void {
  console.log(brand(LOGO));
  console.log(brand("  🌱 Seed your Coding Agents with capabilities"));
  console.log(chalk.gray(`  ${URLS.seedr}`));
  console.log();
}

export function printHeader(text: string): void {
  console.log(bgBrand(` ${text} `));
  console.log();
}

export async function selectSkill(items: RegistryItem[]): Promise<RegistryItem | symbol> {
  const result = await p.select({
    message: "Select a skill to install",
    options: items.map((item) => ({
      label: item.name,
      value: item,
      hint: item.description,
    })),
  });
  return result as RegistryItem | symbol;
}

export async function selectAgents(compatible: CodingAgent[]): Promise<CodingAgent[] | symbol> {
  const allOption = await p.select({
    message: "Which coding agents do you want to install for?",
    options: [
      { label: `All (${compatible.length} agents)`, value: "all" as const },
      { label: "Select specific agents...", value: "select" as const },
    ],
  });

  if (p.isCancel(allOption)) return allOption;
  if (allOption === "all") return compatible;

  const result = await p.multiselect({
    message: "Select agents",
    options: compatible.map((agent) => ({
      label: CODING_AGENTS[agent].name,
      value: agent,
      hint: CODING_AGENTS[agent].projectRoot,
    })),
    initialValues: ["claude" as CodingAgent],
    required: true,
  });

  return result as CodingAgent[] | symbol;
}

export async function selectScope(includeLocal = false): Promise<InstallScope | symbol> {
  const options: { label: string; value: InstallScope; hint: string }[] = [
    { label: "Project", value: "project", hint: includeLocal ? "current directory, settings.json" : "current directory" },
    { label: "User", value: "user", hint: "home directory" },
    ...(includeLocal
      ? [{ label: "Local", value: "local" as InstallScope, hint: "current directory, settings.local.json" }]
      : []),
  ];
  const result = await p.select({ message: "Installation scope", options });
  return result as InstallScope | symbol;
}

export async function selectMethod(symlinkPath: string): Promise<InstallMethod | symbol> {
  const result = await p.select({
    message: "Installation method",
    options: [
      { label: "Symlink", value: "symlink" as const, hint: `shared at ${symlinkPath}` },
      { label: "Copy", value: "copy" as const, hint: "standalone copy per agent" },
    ],
  });
  return result as InstallMethod | symbol;
}

export async function confirm(message: string): Promise<boolean | symbol> {
  return p.confirm({ message });
}

export function cancelled(): void {
  p.cancel("Operation cancelled");
  process.exit(0);
}

export function intro(message: string): void {
  p.intro(bgBrand(` ${message} `));
}

export function outro(message: string): void {
  p.outro(brand(message));
}

export function step(message: string): void {
  p.log.step(message);
}

export function info(message: string): void {
  p.log.info(message);
}

export function success(message: string): void {
  p.log.success(message);
}

export function warn(message: string): void {
  p.log.warn(message);
}

export function error(message: string): void {
  p.log.error(message);
}

export function message(message: string): void {
  p.log.message(message);
}

export { p as prompts };
