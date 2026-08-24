import { runProcess } from "@/api/agent";
import { probeClaude, type AdapterProbe } from "./claudeAdapter";

/**
 * Agent adapters, capability-probed (plan §6.2 / P6). Only Claude is certified:
 * it has a recorded envelope and a conformance suite. The others are probed so
 * the UI can say what is installed, and are offered for nothing until each
 * passes the same fixture-driven tests — "do not advertise five agents until
 * five pass".
 */
export type AgentId = "claude" | "copilot" | "codex" | "antigravity" | "opencode";

export interface AdapterStatus extends AdapterProbe {
  id: AgentId;
  label: string;
  certified: boolean;
}

/** Binary name and the version flag each CLI answers, as installed on 2026-08-22. */
const UNCERTIFIED: { id: AgentId; label: string; program: string }[] = [
  { id: "copilot", label: "GitHub Copilot", program: "copilot" },
  { id: "codex", label: "OpenAI Codex", program: "codex" },
  { id: "antigravity", label: "Google Antigravity", program: "agy" },
  { id: "opencode", label: "OpenCode", program: "opencode" },
];

async function probeVersionOnly(program: string, label: string, run: typeof runProcess): Promise<AdapterProbe> {
  const outcome = await run({ taskId: `probe-${program}`, program, args: ["--version"], timeoutMs: 15_000 });
  if (outcome.status === "not-found") return { available: false, version: null, diagnostic: `${label} is not installed or not on PATH` };
  const version = /(\d+\.\d+\.\d+)/.exec(outcome.stdout + outcome.stderr)?.[1] ?? null;
  return { available: false, version, diagnostic: `${label}${version ? ` ${version}` : ""} is installed but not certified for Studio yet` };
}

export async function probeAdapters(run: typeof runProcess = runProcess): Promise<AdapterStatus[]> {
  const claude = await probeClaude(run);
  const others = await Promise.all(UNCERTIFIED.map(async ({ id, label, program }) => ({ id, label, certified: false, ...(await probeVersionOnly(program, label, run)) })));
  return [{ id: "claude", label: "Claude Code", certified: true, ...claude }, ...others];
}
