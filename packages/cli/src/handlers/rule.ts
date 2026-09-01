import { dirname } from "node:path";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItemSourcePath, fetchItemFile } from "../config/registry.js";
import { CODING_AGENTS } from "../config/agents.js";
import { assertOverwritable, exists, removePathEntry, resolveContained } from "../utils/fs.js";
import { assertValidSlug } from "../utils/slug.js";
import {
  listSections,
  removeSection,
  ruleTargetFor,
  stripFrontmatter,
  upsertSection,
  type RuleTarget,
} from "./ruleTargets.js";
import type { ContentHandler, InstallResult, PlannedChange } from "./types.js";

const SLUG_LABEL = "rule slug";
const RULE_FILE = "rule.md";

async function readTextOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

/** The rule's markdown: from the local checkout when present, otherwise fetched. */
async function readRuleContent(item: RegistryItem): Promise<string> {
  const sourcePath = getItemSourcePath(item);
  if (sourcePath) {
    const local = await readTextOrEmpty(`${sourcePath}/${RULE_FILE}`);
    if (local) return local;
  }
  return fetchItemFile(item, RULE_FILE);
}

/** Where this rule lands for one agent, proven contained in the scope root. */
async function destinationFor(
  target: RuleTarget,
  slug: string,
  scope: InstallScope,
  cwd: string
): Promise<string> {
  if (target.kind === "section") return target.file(scope, cwd);
  const dir = target.dir(scope, cwd);
  return resolveContained(dir, target.fileName(slug));
}

async function installRuleForAgent(
  item: RegistryItem,
  agent: CodingAgent,
  scope: InstallScope,
  force: boolean,
  cwd: string,
  content: string
): Promise<InstallResult> {
  const spinner = ora(`Installing ${item.name} for ${CODING_AGENTS[agent].name}...`).start();

  try {
    const target = ruleTargetFor(agent);
    const destination = await destinationFor(target, item.slug, scope, cwd);
    await mkdir(dirname(destination), { recursive: true });

    if (target.kind === "file") {
      // A rule file is the whole file, so replacing one needs the same consent
      // any other overwrite does.
      await assertOverwritable(destination, force);
      await writeFile(
        destination,
        target.keepsFrontmatter ? content : stripFrontmatter(content),
        "utf-8"
      );
    } else {
      // A section shares the file with whatever else is in it, so this is a
      // merge, not an overwrite — no `--force` is required to replace our own
      // marked block, and nothing outside it is touched.
      const document = await readTextOrEmpty(destination);
      await writeFile(destination, upsertSection(document, item.slug, content), "utf-8");
    }

    spinner.succeed(brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`));
    return { agent, success: true, path: destination };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(chalk.red(`Failed to install for ${CODING_AGENTS[agent].name}: ${message}`));
    return { agent, success: false, path: "", error: message };
  }
}

export async function installRule(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  _method: InstallMethod,
  force: boolean,
  cwd: string = process.cwd()
): Promise<InstallResult[]> {
  assertValidSlug(item.slug, SLUG_LABEL);
  const content = await readRuleContent(item);

  const results: InstallResult[] = [];
  for (const agent of agents) {
    results.push(await installRuleForAgent(item, agent, scope, force, cwd, content));
  }
  return results;
}

export async function uninstallRule(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  assertValidSlug(slug, SLUG_LABEL);

  let target: RuleTarget;
  try {
    target = ruleTargetFor(agent);
  } catch {
    return false;
  }

  const destination = await destinationFor(target, slug, scope, cwd);
  if (target.kind === "file") return removePathEntry(destination);

  // Only our own marked block is removed; the rest of the file is a person's.
  const document = await readTextOrEmpty(destination);
  const stripped = removeSection(document, slug);
  if (stripped === null) return false;
  await writeFile(destination, stripped, "utf-8");
  return true;
}

export async function getInstalledRules(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  let target: RuleTarget;
  try {
    target = ruleTargetFor(agent);
  } catch {
    return [];
  }

  if (target.kind === "section") {
    return listSections(await readTextOrEmpty(target.file(scope, cwd)));
  }

  const dir = target.dir(scope, cwd);
  if (!(await exists(dir))) return [];
  const suffix = target.fileName("");
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix) && !entry.name.startsWith("."))
    .map((entry) => entry.name.slice(0, -suffix.length));
}

export async function planRule(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  _method: InstallMethod,
  cwd: string
): Promise<PlannedChange[]> {
  assertValidSlug(item.slug, SLUG_LABEL);
  const changes: PlannedChange[] = [];

  for (const agent of agents) {
    const target = ruleTargetFor(agent);
    const destination = await destinationFor(target, item.slug, scope, cwd);
    const present = await exists(destination);

    changes.push({
      agent,
      kind: present ? "modify" : "create",
      path: destination,
      detail:
        target.kind === "file"
          ? "rule file"
          : `merged section <!-- seedr:rule:${item.slug} --> (the rest of the file is untouched)`,
    });
  }

  return changes;
}

export const ruleHandler: ContentHandler = {
  type: "rule",
  honoursMethod: false,

  async install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]> {
    return installRule(item, agents, scope, method, force, cwd);
  },

  async uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean> {
    return uninstallRule(slug, agent, scope, cwd);
  },

  async listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]> {
    return getInstalledRules(agent, scope, cwd);
  },

  plan: planRule,
};
