import { Command } from "commander";
import chalk from "chalk";
import type { CodingAgent, InstallScope, InstallMethod, RegistryItem } from "../types.js";
import type { ComponentType } from "@seedr/shared";
import { listItems, getItem, getItemsBySlug, searchItems } from "../config/registry.js";
import { isLegacyAgent } from "@seedr/registry-ops/pure";
import { parseAgentsArgStrict } from "../utils/detection.js";
import * as ui from "../utils/ui.js";
import { getHandler } from "../handlers/registry.js";
import type { ContentHandler, InstallResult, PlannedChange } from "../handlers/types.js";
import { handleCommandError } from "../utils/errors.js";
import { validateScope, validateMethod, validateType } from "../utils/validate-options.js";
import { trackInstalls, TELEMETRY_HELP_TEXT } from "../utils/analytics.js";
import { ALL_AGENTS, CODING_AGENTS } from "../config/agents.js";
import { describeIncompatibility, filterCompatibleAgents, isTypeSupported } from "../config/compatibility.js";
import { getAgentsPath } from "../utils/fs.js";

// Ensure handlers are registered
import "../handlers/index.js";

const CANCELLED_MESSAGE = "Operation cancelled";

/** Returned by the interactive helpers when the user aborted a prompt. */
const CANCELLED = Symbol("cancelled");
type Cancelled = typeof CANCELLED;

function cancelPrompt(): Cancelled {
  ui.prompts.cancel(CANCELLED_MESSAGE);
  return CANCELLED;
}

export interface AddOptions {
  type?: string;
  agents?: string;
  scope?: string;
  method?: string;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Pure decision logic (no prompts, no process.exit) — tested directly
// ---------------------------------------------------------------------------

export type AgentResolution =
  | { ok: true; agents: CodingAgent[]; explicit: boolean; deprecationWarning?: string }
  | { ok: false; error: string };

/** The agents an item can be installed for: its own `compatibility`, narrowed by what the type supports. */
export function compatibleAgentsFor(item: RegistryItem): CodingAgent[] {
  return filterCompatibleAgents(item.type, item.compatibility);
}

/** Why this item cannot go to this agent: a type-level reason, or the item's own compatibility list. */
function explainIncompatibility(item: RegistryItem, agent: CodingAgent): string {
  if (!isTypeSupported(item.type, agent)) {
    return describeIncompatibility(item.type, agent);
  }
  return `the registry lists "${item.slug}" for ${item.compatibility.join(", ")} only`;
}

/**
 * Turn `--agents` into a concrete agent list.
 *
 * - absent → nothing chosen yet (`explicit: false`); the caller prompts or
 *   falls back to the single compatible agent.
 * - `all` → every compatible agent; never an error for the incompatible rest.
 * - explicit names → every one must be known and compatible with both the
 *   content type and the item, otherwise the whole request is refused so an
 *   explicit choice is never silently replaced by another agent.
 */
export function resolveRequestedAgents(
  agentsArg: string | undefined,
  item: RegistryItem
): AgentResolution {
  const compatible = compatibleAgentsFor(item);
  const compatibleList = compatible.length > 0 ? compatible.join(", ") : "(none)";

  if (agentsArg === undefined || agentsArg.trim() === "") {
    return { ok: true, agents: [], explicit: false };
  }

  const deprecationWarning = agentsArg
    .split(",")
    .map((raw) => raw.trim().toLowerCase())
    .some((id) => isLegacyAgent(id))
    ? "'gemini' is now 'antigravity' (Google Antigravity, installs to .agents/)"
    : undefined;

  if (agentsArg.trim() === "all") {
    if (compatible.length === 0) {
      return { ok: false, error: `No agent supports ${item.type} "${item.slug}"` };
    }
    return { ok: true, agents: compatible, explicit: true, deprecationWarning };
  }

  const { agents, unknown } = parseAgentsArgStrict(agentsArg);
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown agent(s): ${unknown.join(", ")}. Valid agents: ${ALL_AGENTS.join(", ")} or "all"`,
    };
  }
  if (agents.length === 0) {
    return { ok: false, error: "No agents given" };
  }

  const incompatible = agents.filter((agent) => !compatible.includes(agent));
  if (incompatible.length > 0) {
    const reasons = incompatible.map((agent) => `${agent}: ${explainIncompatibility(item, agent)}`);
    return {
      ok: false,
      error:
        `Cannot install ${item.type} "${item.slug}" for ${incompatible.join(", ")}. ` +
        `Compatible agents: ${compatibleList}. ${reasons.join("; ")}`,
    };
  }

  return { ok: true, agents, explicit: true, deprecationWarning };
}

/**
 * Overwrite an existing destination only when explicitly forced, or when the
 * user went through the interactive confirmation. With `--yes`
 * (non-interactive) and no `--force`, refuse to clobber existing files.
 */
export function decideForce(options: Pick<AddOptions, "force" | "yes">): boolean {
  return Boolean(options.force) || !options.yes;
}

/** Ask the handler what it would do; handlers without `plan` fall back to a path-only description. */
export async function planInstall(
  handler: ContentHandler,
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  cwd: string
): Promise<PlannedChange[]> {
  if (handler.plan) {
    return handler.plan(item, agents, scope, method, cwd);
  }
  return agents.map((agent) => ({
    agent,
    kind: "create" as const,
    path: getAgentsPath(item.type, item.slug, scope, cwd),
    detail: "(handler provides no detailed plan)",
  }));
}

const KIND_LABEL: Record<PlannedChange["kind"], string> = {
  create: "create",
  modify: "modify",
  delete: "delete",
};

/** Render a plan as printable lines: exact paths, grouped by agent. */
export function formatPlan(changes: PlannedChange[]): string[] {
  if (changes.length === 0) return ["  (no filesystem changes)"];
  const lines: string[] = [];
  const groups = new Map<string, PlannedChange[]>();
  for (const change of changes) {
    const label = change.agent === "shared" ? "shared" : CODING_AGENTS[change.agent].name;
    groups.set(label, [...(groups.get(label) ?? []), change]);
  }
  for (const [label, group] of groups) {
    lines.push(`  ${label}:`);
    for (const change of group) {
      const detail = change.detail ? `  ${chalk.gray(`— ${change.detail}`)}` : "";
      lines.push(`    ${chalk.gray(`[${KIND_LABEL[change.kind]}]`)} ${change.path}${detail}`);
    }
  }
  return lines;
}

/** Exit code for a batch of results: 1 when any agent failed. */
export function summarizeResults(results: InstallResult[]): { successful: InstallResult[]; failed: InstallResult[]; exitCode: number } {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  return { successful, failed, exitCode: failed.length > 0 ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// Interactive resolution
// ---------------------------------------------------------------------------

async function resolveItemByName(itemName: string, type: ComponentType | undefined): Promise<RegistryItem | null | Cancelled> {
  if (type) {
    const typed = await getItem(itemName, type);
    if (typed) return typed;
  } else {
    // An exact slug can name items of several types (skill-creator is both a
    // skill and a plugin). Taking the first match installed one of them with no
    // sign the other existed.
    const matches = await getItemsBySlug(itemName);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      const types = matches.map((match: RegistryItem) => match.type);
      if (!ui.isInteractive()) {
        ui.error(`"${itemName}" exists as ${types.join(" and ")}. Pass --type <${types.join("|")}> to choose.`);
        return null;
      }
      ui.warn(`"${itemName}" exists as ${types.join(" and ")} — pass --type to skip this question.`);
      const chosen = await ui.selectSkill(matches);
      if (ui.prompts.isCancel(chosen)) return cancelPrompt();
      return chosen as RegistryItem;
    }
  }

  const results = await searchItems(itemName);
  const filtered = type ? results.filter((r) => r.type === type) : results;

  if (filtered.length === 0) {
    reportNotFound(itemName, type, results);
    return null;
  }
  if (filtered.length === 1) {
    return filtered[0]!;
  }
  ui.warn(`Multiple matches for "${itemName}"`);
  const selected = await ui.selectSkill(filtered);
  if (ui.prompts.isCancel(selected)) return cancelPrompt();
  return selected as RegistryItem;
}

function reportNotFound(itemName: string, type: ComponentType | undefined, results: RegistryItem[]): void {
  if (!type || results.length === 0) {
    ui.error(`"${itemName}" not found`);
    return;
  }
  const match = results.find((r) => r.slug === itemName);
  if (match) {
    ui.error(`"${itemName}" is a ${match.type}, not a ${type}. Run: seedr add ${itemName} --type ${match.type}`);
  } else {
    ui.error(`No ${type} matching "${itemName}". Found: ${results.map((r) => `${r.slug} (${r.type})`).join(", ")}`);
  }
}

async function resolveItem(
  itemName: string | undefined,
  type: ComponentType | undefined
): Promise<RegistryItem | null | Cancelled> {
  if (itemName) return resolveItemByName(itemName, type);

  // No name provided - list items of the specified type (or all skills)
  const items = await listItems(type || "skill");
  if (items.length === 0) {
    ui.error(`No ${type || "skill"}s available in registry`);
    return null;
  }
  const selected = await ui.selectSkill(items);
  if (ui.prompts.isCancel(selected)) return cancelPrompt();
  return selected as RegistryItem;
}

async function chooseAgents(options: AddOptions, item: RegistryItem): Promise<CodingAgent[] | null | Cancelled> {
  const resolution = resolveRequestedAgents(options.agents, item);
  if (!resolution.ok) {
    ui.error(resolution.error);
    return null;
  }
  if (resolution.deprecationWarning) ui.warn(resolution.deprecationWarning);
  if (resolution.agents.length > 0) return resolution.agents;

  const compatible = compatibleAgentsFor(item);
  if (compatible.length === 0) {
    ui.error(`No agent supports ${item.type} "${item.slug}"`);
    return null;
  }
  if (compatible.length === 1) return compatible;

  const selected = await ui.selectAgents(compatible);
  if (ui.prompts.isCancel(selected)) return cancelPrompt();
  return selected as CodingAgent[];
}

async function chooseScope(options: AddOptions, item: RegistryItem): Promise<InstallScope | Cancelled> {
  if (options.scope) return options.scope as InstallScope;
  const supportsLocal = ["plugin", "settings", "hook"].includes(item.type);
  const selected = await ui.selectScope(supportsLocal);
  if (ui.prompts.isCancel(selected)) return cancelPrompt();
  return selected as InstallScope;
}

async function chooseMethod(
  options: AddOptions,
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  cwd: string
): Promise<InstallMethod | Cancelled> {
  if (options.method) return options.method as InstallMethod;
  // Single agent - always use copy (symlink only makes sense for shared central storage)
  if (agents.length === 1) return "copy";
  const symlinkPath = getAgentsPath(item.type, item.slug, scope, cwd);
  const selected = await ui.selectMethod(symlinkPath);
  if (ui.prompts.isCancel(selected)) return cancelPrompt();
  return selected as InstallMethod;
}

function printPlan(title: string, changes: PlannedChange[]): void {
  console.log();
  console.log(ui.brand(`  ${title}`));
  for (const line of formatPlan(changes)) console.log(line);
  console.log();
}

function printInstallSummary(results: InstallResult[]): number {
  const { successful, failed, exitCode } = summarizeResults(results);

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
  }
  return exitCode;
}

/**
 * The `add` flow without the commander wrapper. Returns the exit code:
 * 0 on success or a cancelled prompt, 1 on any refusal or failure.
 */
export async function runAdd(name: string | undefined, options: AddOptions, cwd: string = process.cwd()): Promise<number> {
  const optionError =
    validateType(options.type) ||
    validateScope(options.scope) ||
    validateMethod(options.method);
  if (optionError) {
    ui.error(optionError);
    return 1;
  }

  const item = await resolveItem(name, options.type as ComponentType | undefined);
  if (item === CANCELLED) return 0;
  if (!item) return 1;

  ui.step(`Selected: ${ui.brand(item.name)} ${chalk.gray(`(${item.type})`)} ${chalk.gray(`- ${item.description}`)}`);

  const handler = getHandler(item.type);
  if (!handler) {
    ui.error(`No handler found for type "${item.type}"`);
    return 1;
  }

  const agents = await chooseAgents(options, item);
  if (agents === CANCELLED) return 0;
  if (!agents) return 1;
  ui.step(`Agents: ${ui.brand(agents.join(", "))}`);

  const scope = await chooseScope(options, item);
  if (scope === CANCELLED) return 0;
  ui.step(`Scope: ${ui.brand(scope)}`);

  const method = await chooseMethod(options, item, agents, scope, cwd);
  if (method === CANCELLED) return 0;
  ui.step(`Method: ${ui.brand(method)}`);

  // The plan is a read-only description; nothing is written before the install call.
  if (options.dryRun) {
    ui.info("Dry run - no files will be written");
    printPlan("Would write:", await planInstall(handler, item, agents, scope, method, cwd));
    ui.outro("Dry run complete");
    return 0;
  }

  if (!options.yes) {
    printPlan("Will write:", await planInstall(handler, item, agents, scope, method, cwd));
    const confirmed = await ui.confirm("Proceed with installation?");
    if (ui.prompts.isCancel(confirmed) || !confirmed) {
      cancelPrompt();
      return 0;
    }
  }

  console.log();
  const results = await handler.install(item, agents, scope, method, decideForce(options), cwd);
  void trackInstalls(item.slug, item.type, results, scope);
  const exitCode = printInstallSummary(results);
  if (exitCode === 0) ui.outro("Installation complete");
  return exitCode;
}

export const addCommand = new Command("add")
  .description("Install a skill, agent, hook, or other configuration")
  .argument("[name]", "Name of the item to install")
  .option("-t, --type <type>", "Content type: skill, agent, hook, mcp, plugin, settings")
  .option(
    "-a, --agents <agents>",
    "Comma-separated coding agents or 'all' (claude,copilot,antigravity,codex,opencode; 'gemini' is a deprecated alias of antigravity). " +
      "Every named agent must support the item; 'all' means all compatible agents. " +
      "MCP servers: claude, codex, opencode (copilot's and antigravity's formats are unverified)"
  )
  .option("-s, --scope <scope>", "Installation scope: project, user, or local")
  .option("-m, --method <method>", "Installation method: symlink or copy")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("-f, --force", "Overwrite existing files")
  .option("-n, --dry-run", "Show exactly which files would be written, without writing or reporting anything")
  .addHelpText("after", `\nTelemetry: ${TELEMETRY_HELP_TEXT}.`)
  .action(async (name: string | undefined, options: AddOptions) => {
    try {
      ui.printLogo();
      ui.intro("Seedr");
      const exitCode = await runAdd(name, options);
      if (exitCode !== 0) process.exit(exitCode);
    } catch (error) {
      handleCommandError(error);
    }
  });
