import { invoke, listen, type UnlistenFn } from "@/core/lib/tauriInvoke";

/**
 * Bounded child-process execution on the host. Every run has a task id that is
 * also the key its process is registered under, so a cancel can never no-op.
 * The host kills the whole process tree (Unix process group, Windows Job
 * Object), drains both streams, caps the captured output and enforces a
 * watchdog timeout.
 */
export interface RunRequest {
  taskId: string;
  program: string;
  args: string[];
  /** Written to the child's stdin, then closed — prompts never travel on argv. */
  stdin?: string;
  /** Repo-relative working directory; the host resolves it inside the repo. */
  cwd?: string;
  /** Run in the recorded default checkout — how a registry without its own operations CLI is changed. */
  inDefaultRepo?: boolean;
  timeoutMs: number;
}

export type RunStatus = "ok" | "failed" | "cancelled" | "timeout" | "not-found";

export interface RunOutcome {
  taskId: string;
  status: RunStatus;
  exitCode: number | null;
  /** Capped: the head and tail of each stream, with a marker where bytes were dropped. */
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface OutputEvent {
  taskId: string;
  stream: "stdout" | "stderr";
  line: string;
}

export const runProcess = (request: RunRequest): Promise<RunOutcome> => invoke<RunOutcome>("run_process", { request });

export const cancelProcess = (taskId: string): Promise<boolean> => invoke<boolean>("cancel_process", { taskId });

/** Streamed output lines for a task, for the live log. */
export const onProcessOutput = (taskId: string, callback: (event: OutputEvent) => void): Promise<UnlistenFn> =>
  listen<OutputEvent>("process-output", (event) => {
    if (event.payload.taskId === taskId) callback(event.payload);
  });

/** A native file-or-folder picker; `null` when cancelled. Returns an absolute path. */
export const pickPath = (kind: "file" | "folder"): Promise<string | null> => invoke<string | null>("pick_path", { kind });
