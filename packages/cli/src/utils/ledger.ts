import { homedir } from "node:os";
import { join } from "node:path";
import type { CodingAgent, InstallScope } from "../types.js";
import type { ComponentType } from "@seedr/shared";
import { readJson, writeJson } from "./json.js";

/**
 * What seedr installed, so drift from the registry can be seen.
 *
 * Every agent records that an item is present — Claude's `installed_plugins.json`,
 * Copilot's `enabledPlugins` — but only Claude records WHICH VERSION, and only
 * for plugins. So `seedr list --installed` could say an item was there and never
 * which release it was, and a workstation could sit three versions behind the
 * registry with nothing on screen to say so. That is not hypothetical: it is how
 * vu3-agent-kit ran at 0.15.18 against a registry serving 0.15.21.
 *
 * One file, written by seedr and read by seedr. It is a record, never a source of
 * truth: the agent's own config decides what is installed, and an entry here that
 * disagrees is stale, not authoritative.
 */
export const LEDGER_PATH = join(homedir(), ".seedr", "installed.json");

export interface LedgerEntry {
  type: ComponentType;
  slug: string;
  /** The registry item's version at install time; absent for an item that carries none. */
  version?: string;
  /** What the content hashed to, so a changed item is visible even at an unchanged version. */
  contentDigest?: string;
  agents: CodingAgent[];
  scope: InstallScope;
  installedAt: string;
}

export interface Ledger {
  version: 1;
  items: Record<string, LedgerEntry>;
}

export function ledgerKey(type: ComponentType, slug: string): string {
  return `${type}:${slug}`;
}

export async function readLedger(): Promise<Ledger> {
  const ledger = await readJson<Partial<Ledger>>(LEDGER_PATH);
  return { version: 1, items: ledger.items ?? {} };
}

/**
 * Record one install. The agents of an earlier install are kept: installing for
 * OpenCode alone does not mean Copilot lost it. A different version replaces the
 * old record outright — that IS the update.
 */
export async function recordInstall(entry: LedgerEntry): Promise<void> {
  const ledger = await readLedger();
  const key = ledgerKey(entry.type, entry.slug);
  const previous = ledger.items[key];
  const agents =
    previous && previous.version === entry.version
      ? [...new Set([...previous.agents, ...entry.agents])].sort()
      : [...entry.agents].sort();
  ledger.items[key] = { ...entry, agents };
  await writeJson(LEDGER_PATH, ledger);
}

/** Forget the agents an item was just removed from, and the item once none are left. */
export async function recordRemoval(type: ComponentType, slug: string, agents: CodingAgent[]): Promise<void> {
  const ledger = await readLedger();
  const key = ledgerKey(type, slug);
  const entry = ledger.items[key];
  if (!entry) return;
  const left = entry.agents.filter((agent) => !agents.includes(agent));
  if (left.length === 0) delete ledger.items[key];
  else ledger.items[key] = { ...entry, agents: left };
  await writeJson(LEDGER_PATH, ledger);
}
