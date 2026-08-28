import { create } from "zustand";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { runProcess } from "@/api/agent";
import { AGENT_PROGRAMS, useAgentSettings } from "./agentSettings";

/**
 * Which models each coding agent can actually be given, asked of the agent
 * itself.
 *
 * Never a hardcoded list. The catalogue moves — a model ships, an org policy
 * removes one, an account has a different set — and a list written here would be
 * wrong within weeks and wrong silently. The same rule cockpit states for its own
 * probes (`bin/ci-worker`): when a probe has not answered, the list is empty and
 * the caller says so rather than inventing a value.
 *
 * Each CLI answers differently, and none of them agree:
 *
 * - `claude models`          a markdown table; the id is the backticked column
 * - `codex debug models`     JSON, but 354 KB of it for nine models — the
 *                            executor caps output and splices in an ellipsis
 *                            marker, so the JSON arrived unparseable. Reduced
 *                            in a node child, like copilot, so what crosses the
 *                            IPC boundary is the slugs and nothing else.
 * - `agy models`             tab-separated, id first, after a progress line
 * - `opencode models`        one id per line
 * - copilot                  no subcommand exists. The CLI bundles the SDK its
 *                            own `/model` picker uses, so the probe asks that.
 */

/** Where the copilot CLI keeps the SDK its own model picker talks to. */
const COPILOT_SDK = "/usr/local/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot-sdk/index.js";

/**
 * `client.start()` spawns the CLI's own server as a child process. Stopping it
 * belongs in a `finally`, or every probe leaves one behind — cockpit measured
 * 490 orphaned processes from exactly this, and the symptom was an
 * auth-looking failure days later, not a leak.
 */
const COPILOT_PROBE = `
const { CopilotClient } = require(${JSON.stringify(COPILOT_SDK)});
(async () => {
  const client = new CopilotClient();
  let out = { models: [] };
  try {
    await client.start();
    const res = await client.rpc.models.list();
    out = { models: (res.models || []).map((m) => m.id) };
  } catch (e) {
    out = { models: [], error: String((e && e.message) || e) };
  } finally {
    try { await client.stop(); } catch (e) { try { client.forceStop(); } catch (e2) {} }
  }
  console.log(JSON.stringify(out));
  process.exit(0);
})();
`;

/**
 * `codex debug models` prints the whole catalogue — every model's description
 * and reasoning levels — which is 354 KB for the nine models it knows. That is
 * far past the executor's output cap, and a capped stream arrives with an
 * ellipsis marker spliced into the middle of it, so parsing it as JSON failed on
 * the marker rather than on anything codex did wrong. Reading it in a child and
 * printing only the slugs keeps the answer at a couple of hundred bytes.
 *
 * `maxBuffer` is raised for the same reason the cap exists: the whole catalogue
 * has to fit somewhere, and here it is a short-lived child that exits with it.
 */
const codexProbe = (bin: string) => `
const { execFileSync } = require("node:child_process");
try {
  const raw = execFileSync(${JSON.stringify(bin)}, ["debug", "models"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Projection only, no policy: which models to offer is decided in read(),
  // where the suite can reach it. This child exists to drop the descriptions
  // and reasoning levels that make the answer 354 KB, nothing more.
  const models = (JSON.parse(raw).models || []).map((m) => ({
    slug: m.slug,
    visibility: m.visibility,
    efforts: (m.supported_reasoning_levels || []).map((l) => l.effort).filter(Boolean),
  }));
  console.log(JSON.stringify({ models }));
} catch (e) {
  console.log(JSON.stringify({ models: [], error: String((e && e.message) || e) }));
}
process.exit(0);
`;

interface Probe {
  program: string;
  /**
   * Resolved when the probe runs, not when this module loads. The codex one
   * has to read the program override itself: the host substitutes an override
   * for the program it is given, and it is given `node` here, so a codex
   * pointed at by hand would otherwise be quietly ignored.
   */
  args(): string[];
  read(stdout: string): string[];
  /**
   * Which reasoning efforts each model accepts, where that is a property of the
   * model rather than of the CLI. Only codex answers this: its levels differ
   * model by model — `ultra` exists on two of the seven and `max` on three — so
   * a single list per agent would offer `gpt-5.4` an effort it refuses.
   */
  readEfforts?(stdout: string): Record<string, string[]>;
}

/** The visible entries of a codex probe. `hide` are the CLI's own internal models. */
const codexModels = (out: string): { slug?: string; visibility?: string; efforts?: string[] }[] => {
  const parsed: unknown = JSON.parse(out.trim().split("\n").at(-1) ?? "{}");
  const models = (parsed as { models?: { slug?: string; visibility?: string; efforts?: string[] }[] }).models ?? [];
  return models.filter((model) => model.visibility !== "hide" && model.slug);
};

const PROBES: Record<CanonicalCodingAgent, Probe> = {
  claude: {
    program: AGENT_PROGRAMS.claude,
    args: () => ["models"],
    // | Claude Opus 5 | `claude-opus-5` | 1M | … — the id is the backticked cell.
    read: (out) => [...out.matchAll(/\|\s*`([^`]+)`\s*\|/g)].map((match) => match[1]!),
  },
  copilot: {
    program: "node",
    args: () => ["-e", COPILOT_PROBE],
    read: (out) => {
      const parsed: unknown = JSON.parse(out.trim().split("\n").at(-1) ?? "{}");
      return (parsed as { models?: string[] }).models ?? [];
    },
  },
  antigravity: {
    program: AGENT_PROGRAMS.antigravity,
    args: () => ["models"],
    // "Fetching available models..." then `<id>\t<display name>` per line.
    read: (out) =>
      out
        .split("\n")
        .map((line) => line.split("\t")[0]?.trim() ?? "")
        .filter((id) => id.length > 0 && !id.includes(" ")),
  },
  codex: {
    program: "node",
    args: () => ["-e", codexProbe(useAgentSettings.getState().overrides.codex || AGENT_PROGRAMS.codex)],
    read: (out) => codexModels(out).map((model) => model.slug!),
    readEfforts: (out) => Object.fromEntries(codexModels(out).map((model) => [model.slug!, model.efforts ?? []])),
  },
  opencode: {
    program: AGENT_PROGRAMS.opencode,
    args: () => ["models"],
    read: (out) => out.split(/\s+/).map((id) => id.trim()).filter(Boolean),
  },
};

export interface ModelCatalogue {
  models: string[];
  /** Per model, where the CLI says efforts belong to the model — codex only. */
  efforts?: Record<string, string[]>;
  /** Why the list is empty, when it is. Never an empty list with no reason. */
  error: string | null;
  /** ISO date of the answer, so a stale catalogue can say how stale. */
  probedAt: string | null;
}

const EMPTY: ModelCatalogue = { models: [], error: null, probedAt: null };
const STORAGE_KEY = "studio-model-catalogue";

/** The catalogue is the machine's, not the checkout's: it follows the CLI and the account. */
const load = (): Record<string, ModelCatalogue> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, ModelCatalogue>) : {};
  } catch {
    return {};
  }
};

interface ModelsState {
  byAgent: Record<string, ModelCatalogue>;
  probing: string | null;
  /** Ask one agent what it can run. */
  probe(agent: CanonicalCodingAgent, run?: typeof runProcess): Promise<void>;
  probeAll(run?: typeof runProcess): Promise<void>;
}

export const useModels = create<ModelsState>((set, get) => ({
  byAgent: load(),
  probing: null,

  async probe(agent, run = runProcess) {
    const probe = PROBES[agent];
    set({ probing: agent });
    let answer: ModelCatalogue;
    try {
      const outcome = await run({ taskId: `models-${agent}`, program: probe.program, args: probe.args(), cwd: "", timeoutMs: 60_000 });
      answer =
        outcome.status === "ok" && outcome.exitCode === 0
          ? { models: probe.read(outcome.stdout), ...(probe.readEfforts ? { efforts: probe.readEfforts(outcome.stdout) } : {}), error: null, probedAt: new Date().toISOString().slice(0, 10) }
          : { models: [], error: outcome.stderr.trim() || `${probe.program} exited ${outcome.exitCode}`, probedAt: null };
    } catch (error) {
      answer = { models: [], error: (error as Error).message, probedAt: null };
    }
    const byAgent = { ...get().byAgent, [agent]: answer };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(byAgent));
    } catch {
      // A full store is not worth losing the answer that is already in hand.
    }
    set({ byAgent, probing: null });
  },

  async probeAll(run = runProcess) {
    // One at a time: each starts a CLI, and copilot's starts a server of its own.
    for (const agent of CANONICAL_AGENTS) await get().probe(agent, run);
  },
}));

/** What this agent can be given, for code outside React. */
export const modelsFor = (agent: CanonicalCodingAgent): ModelCatalogue => useModels.getState().byAgent[agent] ?? EMPTY;

/**
 * The reasoning efforts each CLI accepts, in its own vocabulary.
 *
 * Read off each `--help` and verified by running it, because they do not agree
 * and no two lists are the same length: claude stops at `max`, copilot starts
 * below `low` with `none` and `minimal`, antigravity has only three.
 * opencode has no such flag at all and is absent here rather than given an
 * empty list that would render a dropdown with nothing in it.
 *
 * codex is absent for the opposite reason: its levels are a property of the
 * MODEL, not the CLI, and come from the catalogue — see `effortsFor`.
 */
const FIXED_EFFORTS: Partial<Record<CanonicalCodingAgent, string[]>> = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  copilot: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
  antigravity: ["low", "medium", "high"],
};

/**
 * What may be offered for this agent, given the model chosen — `[]` means no
 * effort dropdown at all.
 *
 * With no model named, codex falls back to the efforts every one of its models
 * accepts. Whichever model the CLI then picks by itself, the level is one it
 * takes; offering the union instead would let a run fail on a level that only
 * two of seven models have.
 */
export function effortsFor(agent: CanonicalCodingAgent, model: string): string[] {
  if (agent !== "codex") return FIXED_EFFORTS[agent] ?? [];
  const efforts = modelsFor(agent).efforts ?? {};
  if (model) return efforts[model] ?? [];
  const lists = Object.values(efforts);
  if (lists.length === 0) return [];
  return (lists[0] ?? []).filter((effort) => lists.every((list) => list.includes(effort)));
}
