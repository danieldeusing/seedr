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

/**
 * Agents whose CLI cannot be told to refuse a command. Everyone else takes a
 * deny-rule for `git`, so a job cannot commit, push or rewrite history whatever
 * its prompt says. These two can: agy has no deny flag at all, and opencode's
 * `run` ignored `OPENCODE_PERMISSION` under both the `bash` and the `shell` key
 * — `git status` ran regardless. So a job there is bounded by its prompt and by
 * the transaction that follows it, not by the tool itself, and the settings page
 * says so rather than implying a boundary that is not there.
 */
export const NO_TOOL_DENIAL: readonly CanonicalCodingAgent[] = ["antigravity", "opencode"];

const PREFERRED_KEY = "studio-preferred-agent";

const loadPreferred = (): CanonicalCodingAgent => {
  const stored = localStorage.getItem(PREFERRED_KEY);
  return CANONICAL_AGENTS.find((agent) => agent === stored) ?? "claude";
};

export type AgentProbe =
  | { state: "unprobed" | "probing" | "missing" }
  | { state: "ok"; version: string }
  | { state: "error"; detail: string };

/**
 * How each CLI is asked whether it is signed in, and how it is told to sign in.
 * Verified by running them: only Claude Code answers in JSON, codex answers in
 * a sentence **on stderr**, opencode counts the credentials in its own file,
 * and the other two cannot be asked at all.
 *
 * `read` returns the state rather than a boolean, because "no credential
 * stored" and "cannot run" are not the same claim and one CLI here proves it.
 * Both streams are handed over: they disagree about which one status goes on.
 */
export interface AuthCommands {
  status?: string[];
  login?: string[];
  /** What the status output means, when there is one. */
  read?(stdout: string, stderr: string): AuthState;
}

export const AGENT_AUTH: Record<CanonicalCodingAgent, AuthCommands> = {
  claude: {
    status: ["auth", "status"],
    login: ["auth", "login"],
    read: (stdout) => {
      try {
        const parsed = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string; email?: string; account?: string };
        if (parsed.loggedIn !== true) return { state: "out" };
        return { state: "in", account: parsed.email ?? parsed.account ?? (parsed.authMethod && parsed.authMethod !== "none" ? parsed.authMethod : null) };
      } catch {
        // Output this command was not supposed to produce says nothing either way.
        return { state: "unknown" };
      }
    },
  },
  codex: {
    status: ["login", "status"],
    login: ["login"],
    // It prints "Not logged in" or "Logged in using ChatGPT" on stderr, and
    // nothing at all on stdout. The negative is conclusive here: asked to run
    // while it says that, codex answers 401 Unauthorized.
    read: (_stdout, stderr) => {
      if (/not logged in/i.test(stderr)) return { state: "out" };
      const method = /logged in using (.+)/i.exec(stderr)?.[1]?.trim();
      return method ? { state: "in", account: method } : { state: "unknown" };
    },
  },
  opencode: {
    status: ["auth", "list"],
    login: ["auth", "login"],
    // A stored credential proves it is signed in. Zero proves nothing: opencode
    // also runs on a provider it did not store, and was observed finishing jobs
    // while its own `auth list` reported "0 credentials".
    read: (stdout) => {
      const count = /(\d+) credentials?/i.exec(stdout)?.[1];
      return count !== undefined && count !== "0" ? { state: "in", account: `${count} provider(s)` } : { state: "unknown" };
    },
  },
  copilot: { login: ["login"] },
  antigravity: {},
};

/** Whether a CLI is signed in: unknown when it cannot be asked. */
export type AuthState = { state: "unknown" | "checking" } | { state: "in"; account: string | null } | { state: "out" };

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
  auth: Record<CanonicalCodingAgent, AuthState>;
  /** Ask a CLI whether it is signed in, where it can be asked. */
  checkAuth(agent: CanonicalCodingAgent): Promise<void>;
  /** Remember that a run just failed for want of a sign-in. */
  markSignedOut(agent: CanonicalCodingAgent): void;
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
  auth: Object.fromEntries(CANONICAL_AGENTS.map((agent) => [agent, { state: "unknown" }])) as Record<CanonicalCodingAgent, AuthState>,
  preferred: loadPreferred(),

  markSignedOut(agent) {
    set((state) => ({ auth: { ...state.auth, [agent]: { state: "out" } } }));
  },

  async checkAuth(agent) {
    const commands = AGENT_AUTH[agent];
    // A CLI with nothing to ask stays unknown rather than being guessed at.
    if (!commands.status || !commands.read) return;
    const put = (auth: AuthState) => set((state) => ({ auth: { ...state.auth, [agent]: auth } }));
    put({ state: "checking" });
    try {
      const outcome = await runProcess({ taskId: `auth-status-${agent}`, program: AGENT_PROGRAMS[agent], args: commands.status, timeoutMs: 20_000 });
      if (outcome.status === "not-found") return put({ state: "unknown" });
      put(commands.read(outcome.stdout, outcome.stderr));
    } catch {
      put({ state: "unknown" });
    }
  },

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
      // Being installed and being usable are different questions.
      if (version) void get().checkAuth(agent);
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
