import { create } from "zustand";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { runProcess } from "@/api/agent";
import { invoke } from "@/core/lib/tauriInvoke";

/**
 * Which binary each coding agent answers to, and where the maintainer may point
 * it instead (Settings → coding agents). Overrides live in localStorage and are
 * pushed to the host, which resolves them wherever a run names the bare program
 * — the probe, the drafts, the git jobs, all of it.
 */
export const AGENT_PROGRAMS: Record<CanonicalCodingAgent, string> = {
  claude: "claude",
  copilot: "copilot",
  antigravity: "agy",
  codex: "codex",
  opencode: "opencode",
};

/**
 * Every agent here has a non-interactive mode Studio knows how to drive, so
 * every agent can do every job. What is certified is the *spelling* of the run
 * (see features/author/adapters.ts), not the model behind it — an agent that is
 * not installed says so through its probe instead of being hidden.
 */
export const DRAFT_CERTIFIED: readonly CanonicalCodingAgent[] = CANONICAL_AGENTS;
export const GIT_CERTIFIED: readonly CanonicalCodingAgent[] = CANONICAL_AGENTS;

const PREFERRED_KEY = "studio-preferred-agent";

const loadPreferred = (): CanonicalCodingAgent => {
  const stored = localStorage.getItem(PREFERRED_KEY);
  return CANONICAL_AGENTS.find((agent) => agent === stored) ?? "claude";
};

export type AgentProbe =
  | { state: "unprobed" | "probing" | "missing" }
  | { state: "ok"; version: string }
  | { state: "error"; detail: string };

const STORAGE_KEY = "studio-agent-paths";

const loadOverrides = (): Partial<Record<CanonicalCodingAgent, string>> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return {};
    const overrides: Partial<Record<CanonicalCodingAgent, string>> = {};
    for (const agent of CANONICAL_AGENTS) {
      const value = (parsed as Record<string, unknown>)[agent];
      if (typeof value === "string" && value) overrides[agent] = value;
    }
    return overrides;
  } catch {
    return {};
  }
};

const setHostOverride = (agent: CanonicalCodingAgent, path: string | null): Promise<void> =>
  invoke<void>("set_program_override", { program: AGENT_PROGRAMS[agent], path });

interface AgentSettingsState {
  overrides: Partial<Record<CanonicalCodingAgent, string>>;
  probes: Record<CanonicalCodingAgent, AgentProbe>;
  /** The agent the dialogs run, remembered between sessions. */
  preferred: CanonicalCodingAgent;
  setPreferred(agent: CanonicalCodingAgent): void;
  /** Push the stored overrides to the host (dropping any whose file is gone), then probe. */
  init(): Promise<void>;
  probe(agent: CanonicalCodingAgent): Promise<void>;
  probeAll(): Promise<void>;
  /** Empty or null clears. Resolves to an error message, or null when applied. */
  setOverride(agent: CanonicalCodingAgent, path: string | null): Promise<string | null>;
}

export const useAgentSettings = create<AgentSettingsState>((set, get) => ({
  overrides: loadOverrides(),
  probes: Object.fromEntries(CANONICAL_AGENTS.map((agent) => [agent, { state: "unprobed" }])) as Record<CanonicalCodingAgent, AgentProbe>,
  preferred: loadPreferred(),

  setPreferred(agent) {
    localStorage.setItem(PREFERRED_KEY, agent);
    set({ preferred: agent });
  },

  async init() {
    const overrides = { ...get().overrides };
    for (const agent of CANONICAL_AGENTS) {
      const path = overrides[agent];
      if (!path) continue;
      try {
        await setHostOverride(agent, path);
      } catch {
        delete overrides[agent];
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    set({ overrides });
    await get().probeAll();
  },

  async probe(agent) {
    set((state) => ({ probes: { ...state.probes, [agent]: { state: "probing" } } }));
    const put = (probe: AgentProbe) => set((state) => ({ probes: { ...state.probes, [agent]: probe } }));
    try {
      const outcome = await runProcess({ taskId: `probe-${agent}`, program: AGENT_PROGRAMS[agent], args: ["--version"], timeoutMs: 15_000 });
      if (outcome.status === "not-found") return put({ state: "missing" });
      if (outcome.status !== "ok") return put({ state: "error", detail: outcome.stderr.trim() || outcome.stdout.trim() || outcome.status });
      const version = /(\d+\.\d+\.\d+)/.exec(outcome.stdout)?.[1] ?? outcome.stdout.trim().split("\n")[0] ?? "";
      put(version ? { state: "ok", version } : { state: "error", detail: "no version in the output" });
    } catch (error) {
      put({ state: "error", detail: (error as Error).message });
    }
  },

  async probeAll() {
    await Promise.all(CANONICAL_AGENTS.map((agent) => get().probe(agent)));
  },

  async setOverride(agent, path) {
    const next = path?.trim() || null;
    try {
      await setHostOverride(agent, next);
    } catch (error) {
      return (error as Error).message ?? String(error);
    }
    const overrides = { ...get().overrides };
    if (next) overrides[agent] = next;
    else delete overrides[agent];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    set({ overrides });
    void get().probe(agent);
    return null;
  },
}));
