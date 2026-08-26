import { create } from "zustand";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { cancelProcess, onProcessOutput, runProcess, sendProcessInput } from "@/api/agent";
import { AGENT_AUTH, AGENT_PROGRAMS, useAgentSettings } from "./agentSettings";

/**
 * Signing an agent's CLI in, from inside Studio. `claude auth login` opens a
 * browser and then waits — for the callback, or for a code pasted back — so the
 * run keeps its stdin open and the dialog can answer it. Nothing typed here is
 * stored or read by Studio: it goes straight to the CLI, which owns the
 * credentials.
 */
export const SIGN_IN_TIMEOUT_MS = 600_000;

const LOG_CAP = 200;
const taskFor = (agent: CanonicalCodingAgent) => `auth-login-${agent}`;

interface SignInState {
  agent: CanonicalCodingAgent | null;
  phase: "idle" | "running" | "done";
  log: string[];
  error: string | null;
  /** True when the CLI reported itself signed in afterwards. */
  signedIn: boolean;
  start(agent: CanonicalCodingAgent): Promise<void>;
  answer(text: string): Promise<boolean>;
  cancel(): Promise<void>;
  reset(): void;
}

export const useSignIn = create<SignInState>((set, get) => ({
  agent: null,
  phase: "idle",
  log: [],
  error: null,
  signedIn: false,

  async start(agent) {
    const login = AGENT_AUTH[agent].login;
    if (!login) {
      set({ agent, phase: "idle", error: `${AGENT_PROGRAMS[agent]} has no sign-in command Studio knows — sign in the way that CLI documents.` });
      return;
    }
    const taskId = taskFor(agent);
    set({ agent, phase: "running", log: [], error: null, signedIn: false });
    const unlisten = await onProcessOutput(taskId, ({ line }) => set({ log: [...get().log.slice(-LOG_CAP + 1), line] }));
    try {
      const outcome = await runProcess({
        taskId,
        program: AGENT_PROGRAMS[agent],
        args: login,
        keepStdin: true,
        timeoutMs: SIGN_IN_TIMEOUT_MS,
      });
      set({
        phase: "done",
        signedIn: outcome.status === "ok",
        error: outcome.status === "ok" ? null : outcome.stderr.trim() || outcome.stdout.trim() || `sign-in ${outcome.status}`,
      });
      // Ask the CLI itself rather than believing the exit code.
      if (outcome.status === "ok") void useAgentSettings.getState().checkAuth(agent);
    } catch (error) {
      set({ phase: "idle", error: (error as Error).message });
    } finally {
      unlisten();
    }
  },

  async answer(text) {
    const { agent, phase } = get();
    if (!agent || phase !== "running") return false;
    const delivered = await sendProcessInput(taskFor(agent), text);
    // Echo that something was sent, never what: a code is a credential.
    if (delivered) set({ log: [...get().log.slice(-LOG_CAP + 1), "· answered"] });
    return delivered;
  },

  async cancel() {
    const { agent } = get();
    if (agent) await cancelProcess(taskFor(agent));
    set({ phase: "idle" });
  },

  reset() {
    set({ agent: null, phase: "idle", log: [], error: null, signedIn: false });
  },
}));
