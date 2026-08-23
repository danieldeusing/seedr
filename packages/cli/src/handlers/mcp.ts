import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import chalk from "chalk";
import ora from "ora";
import type { CodingAgent, InstallScope, InstallMethod } from "../types.js";
import type { RegistryItem } from "@seedr/shared";
import { brand } from "../utils/ui.js";
import { getItem, getItemContent } from "../config/registry.js";
import { getMcpConfigPath, CODING_AGENTS } from "../config/agents.js";
import { isTypeSupported } from "../config/compatibility.js";
import { ensureDir, exists, writeFileAtomic } from "../utils/fs.js";
import { readJson, writeJson } from "../utils/json.js";
import { assertValidSlug } from "../utils/slug.js";
import {
  hasTomlTable,
  listTomlChildTables,
  removeTomlTables,
  upsertTomlTables,
  type TomlTableSpec,
  type TomlValue,
} from "../utils/toml.js";
import type { ContentHandler, InstallResult, PlannedChange } from "./types.js";

/**
 * Registry MCP definitions use Claude Code's `.mcp.json` vocabulary
 * (`command`/`args`/`env` for stdio, `type: "http" | "sse"` + `url` +
 * `headers` for remote servers). Every other agent gets a translation into
 * its own schema — see the adapters below.
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: "stdio" | "http" | "sse";
  url?: string;
  headers?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  trust?: boolean;
  bearer_token_env_var?: string;
  [key: string]: unknown;
}

export interface McpDefinition {
  name: string;
  config: McpServerConfig;
}

const MCP_SERVERS_KEY = "mcpServers";
const CODEX_TABLE = "mcp_servers";
const NO_COMMAND_ERROR = "MCP definition has no command for a stdio server";
const NO_URL_ERROR = "MCP definition has no url for a remote server";

/**
 * Parse MCP server definition from registry item content.
 * Expected format is JSON with name and config.
 */
export function parseMcpDefinition(content: string): McpDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Invalid MCP definition: must be valid JSON");
  }
  const definition = parsed as Partial<McpDefinition> | null;
  if (!definition || typeof definition.name !== "string" || definition.name === "" || typeof definition.config !== "object" || definition.config === null) {
    throw new Error('Invalid MCP definition: expected { "name": string, "config": object }');
  }
  return definition as McpDefinition;
}

function transportOf(config: McpServerConfig): "stdio" | "http" | "sse" {
  if (config.type === "http" || config.type === "sse") return config.type;
  if (config.type === undefined && config.url && !config.command) return "http";
  return "stdio";
}

function definedEntries<T extends object>(object: T): Partial<T> {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as Partial<T>;
}

// ---------------------------------------------------------------------------
// Translations into each agent's schema
// ---------------------------------------------------------------------------

/** Gemini CLI `settings.json` → `mcpServers.<name>`: `httpUrl` for http, `url` for sse. */
export function toGeminiServer(config: McpServerConfig): Record<string, unknown> {
  const transport = transportOf(config);
  if (transport === "http") {
    return definedEntries({ httpUrl: config.url, headers: config.headers, timeout: config.timeout, trust: config.trust });
  }
  if (transport === "sse") {
    return definedEntries({ url: config.url, headers: config.headers, timeout: config.timeout, trust: config.trust });
  }
  return definedEntries({
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: config.cwd,
    timeout: config.timeout,
    trust: config.trust,
  });
}

/** OpenCode `opencode.json` → `mcp.<name>`: `local` with a command array, or `remote`. */
export function toOpenCodeServer(config: McpServerConfig): Record<string, unknown> {
  if (transportOf(config) === "stdio") {
    if (!config.command) throw new Error(NO_COMMAND_ERROR);
    return definedEntries({
      type: "local",
      command: [config.command, ...(config.args ?? [])],
      environment: config.env,
      enabled: true,
    });
  }
  if (!config.url) throw new Error(NO_URL_ERROR);
  return definedEntries({ type: "remote", url: config.url, headers: config.headers, enabled: true });
}

/** The scalar entries of a Codex `[mcp_servers.<name>]` table. */
function codexMainEntries(config: McpServerConfig): Record<string, TomlValue> {
  if (transportOf(config) === "stdio") {
    if (!config.command) throw new Error(NO_COMMAND_ERROR);
    return definedEntries({
      command: config.command,
      args: config.args && config.args.length > 0 ? config.args : undefined,
      cwd: config.cwd || undefined,
    }) as Record<string, TomlValue>;
  }
  if (!config.url) throw new Error(NO_URL_ERROR);
  return definedEntries({
    url: config.url,
    bearer_token_env_var: config.bearer_token_env_var || undefined,
  }) as Record<string, TomlValue>;
}

function hasEntries(record: Record<string, string> | undefined): record is Record<string, string> {
  return record !== undefined && Object.keys(record).length > 0;
}

/** Codex `config.toml` → `[mcp_servers.<name>]` plus `.env` / `.http_headers` sub-tables. */
export function toCodexTables(name: string, config: McpServerConfig): TomlTableSpec[] {
  const base = [CODEX_TABLE, name];
  const tables: TomlTableSpec[] = [{ keyPath: base, entries: codexMainEntries(config) }];
  if (hasEntries(config.env)) {
    tables.push({ keyPath: [...base, "env"], entries: { ...config.env } });
  }
  if (hasEntries(config.headers)) {
    tables.push({ keyPath: [...base, "http_headers"], entries: { ...config.headers } });
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Adapters: one per agent, each owning its file format
// ---------------------------------------------------------------------------

interface McpAdapter {
  configPath(scope: InstallScope, cwd: string): string;
  /** Where the entry lives inside the file, for plans and messages. */
  describeEntry(name: string): string;
  has(path: string, name: string): Promise<boolean>;
  write(path: string, name: string, config: McpServerConfig): Promise<void>;
  remove(path: string, name: string): Promise<boolean>;
  list(path: string): Promise<string[]>;
}

type JsonDocument = Record<string, unknown>;

/** The server map under `key`, or an empty one when absent or malformed. */
function serverMapOf(doc: JsonDocument, key: string): Record<string, unknown> {
  const servers = doc[key];
  return servers !== null && typeof servers === "object" && !Array.isArray(servers)
    ? (servers as Record<string, unknown>)
    : {};
}

/** Read a JSON config file, or `null` when it does not exist. */
async function readDocument(path: string): Promise<JsonDocument | null> {
  return (await exists(path)) ? readJson<JsonDocument>(path) : null;
}

function jsonAdapter(
  agent: CodingAgent,
  key: string,
  translate: (config: McpServerConfig) => Record<string, unknown>,
  defaults: JsonDocument = {}
): McpAdapter {
  return {
    configPath: (scope, cwd) => getMcpConfigPath(agent, scope, cwd),
    describeEntry: (name) => `${key}.${name}`,
    async has(path, name) {
      const doc = await readDocument(path);
      return doc !== null && name in serverMapOf(doc, key);
    },
    async write(path, name, config) {
      const doc = (await readDocument(path)) ?? { ...defaults };
      const servers = serverMapOf(doc, key);
      servers[name] = translate(config);
      doc[key] = servers;
      await writeJson(path, doc);
    },
    async remove(path, name) {
      const doc = await readDocument(path);
      if (doc === null) return false;
      const servers = serverMapOf(doc, key);
      if (!(name in servers)) return false;
      delete servers[name];
      doc[key] = servers;
      await writeJson(path, doc);
      return true;
    },
    async list(path) {
      const doc = await readDocument(path);
      return doc === null ? [] : Object.keys(serverMapOf(doc, key));
    },
  };
}

async function readTextOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

const codexAdapter: McpAdapter = {
  configPath: (scope, cwd) => getMcpConfigPath("codex", scope, cwd),
  describeEntry: (name) => `[${CODEX_TABLE}.${name}]`,
  async has(path, name) {
    return hasTomlTable(await readTextOrEmpty(path), [CODEX_TABLE, name]);
  },
  async write(path, name, config) {
    const text = await readTextOrEmpty(path);
    await ensureDir(dirname(path));
    await writeFileAtomic(path, upsertTomlTables(text, [CODEX_TABLE, name], toCodexTables(name, config)));
  },
  async remove(path, name) {
    if (!(await exists(path))) return false;
    const { text, removed } = removeTomlTables(await readTextOrEmpty(path), [CODEX_TABLE, name]);
    if (removed) await writeFileAtomic(path, text);
    return removed;
  },
  async list(path) {
    return listTomlChildTables(await readTextOrEmpty(path), [CODEX_TABLE]);
  },
};

const ADAPTERS: Partial<Record<CodingAgent, McpAdapter>> = {
  claude: jsonAdapter("claude", MCP_SERVERS_KEY, (config) => ({ ...config })),
  gemini: jsonAdapter("gemini", MCP_SERVERS_KEY, toGeminiServer),
  opencode: jsonAdapter("opencode", "mcp", toOpenCodeServer, { $schema: "https://opencode.ai/config.json" }),
  codex: codexAdapter,
};

function adapterFor(agent: CodingAgent): McpAdapter {
  const adapter = ADAPTERS[agent];
  if (!adapter || !isTypeSupported("mcp", agent)) {
    throw new Error(`MCP servers are not supported for ${CODING_AGENTS[agent].name}`);
  }
  return adapter;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function installMcpForAgent(
  item: RegistryItem,
  agent: CodingAgent,
  scope: InstallScope,
  _method: InstallMethod,
  force: boolean,
  cwd: string
): Promise<InstallResult> {
  const spinner = ora(
    `Installing ${item.name} for ${CODING_AGENTS[agent].name}...`
  ).start();

  try {
    const adapter = adapterFor(agent);
    const mcpDef = parseMcpDefinition(await getItemContent(item));
    const configPath = adapter.configPath(scope, cwd);

    if (!force && (await adapter.has(configPath, mcpDef.name))) {
      throw new Error(
        `MCP server "${mcpDef.name}" already exists in ${configPath}; pass --force to overwrite`
      );
    }

    await adapter.write(configPath, mcpDef.name, mcpDef.config);

    spinner.succeed(
      brand(`Installed ${item.name} for ${CODING_AGENTS[agent].name}`)
    );
    return { agent, success: true, path: configPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(
      chalk.red(`Failed to install for ${CODING_AGENTS[agent].name}: ${errorMsg}`)
    );
    return { agent, success: false, path: "", error: errorMsg };
  }
}

export async function installMcp(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  method: InstallMethod,
  force: boolean,
  cwd: string = process.cwd()
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  for (const agent of agents) {
    const result = await installMcpForAgent(item, agent, scope, method, force, cwd);
    results.push(result);
  }

  return results;
}

/**
 * The key an installed server is stored under is the `name` of its registry
 * definition. Resolve it from the registry when possible and fall back to the
 * slug (the two coincide for every registry item today).
 */
async function resolveServerName(slug: string): Promise<string> {
  try {
    const item = await getItem(slug, "mcp");
    if (!item) return slug;
    return parseMcpDefinition(await getItemContent(item)).name;
  } catch {
    return slug;
  }
}

export async function uninstallMcp(
  slug: string,
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<boolean> {
  assertValidSlug(slug);
  if (!isTypeSupported("mcp", agent)) return false;

  const adapter = adapterFor(agent);
  const configPath = adapter.configPath(scope, cwd);
  if (!(await exists(configPath))) return false;

  const name = await resolveServerName(slug);
  return adapter.remove(configPath, name);
}

export async function getInstalledMcpServers(
  agent: CodingAgent,
  scope: InstallScope,
  cwd: string = process.cwd()
): Promise<string[]> {
  if (!isTypeSupported("mcp", agent)) return [];
  const adapter = adapterFor(agent);
  return adapter.list(adapter.configPath(scope, cwd));
}

export async function planMcp(
  item: RegistryItem,
  agents: CodingAgent[],
  scope: InstallScope,
  _method: InstallMethod,
  cwd: string
): Promise<PlannedChange[]> {
  const mcpDef = parseMcpDefinition(await getItemContent(item));
  const changes: PlannedChange[] = [];
  for (const agent of agents) {
    const adapter = adapterFor(agent);
    const path = adapter.configPath(scope, cwd);
    const fileExists = await exists(path);
    const replaces = fileExists && (await adapter.has(path, mcpDef.name));
    changes.push({
      agent,
      kind: fileExists ? "modify" : "create",
      path,
      detail: `${adapter.describeEntry(mcpDef.name)}${replaces ? " (replaces existing entry)" : ""}`,
    });
  }
  return changes;
}

/**
 * MCP content handler implementing the ContentHandler interface.
 */
export const mcpHandler: ContentHandler = {
  type: "mcp",

  async install(
    item: RegistryItem,
    agents: CodingAgent[],
    scope: InstallScope,
    method: InstallMethod,
    force: boolean,
    cwd?: string
  ): Promise<InstallResult[]> {
    return installMcp(item, agents, scope, method, force, cwd);
  },

  async uninstall(
    slug: string,
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<boolean> {
    return uninstallMcp(slug, agent, scope, cwd);
  },

  async listInstalled(
    agent: CodingAgent,
    scope: InstallScope,
    cwd?: string
  ): Promise<string[]> {
    return getInstalledMcpServers(agent, scope, cwd);
  },

  plan: planMcp,
};
