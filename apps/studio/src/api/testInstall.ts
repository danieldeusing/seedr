import { invoke } from "@/core/lib/tauriInvoke";
import type { RunOutcome } from "./agent";
import type { SourceFiles } from "./source";

/**
 * The Test action (plan §6.5): the host installs one item for real with the
 * checkout's own CLI into a scratch directory it creates and removes, and
 * reports the command, the process outcome and every file that was written.
 */
export interface TestInstallRequest {
  taskId: string;
  type: string;
  slug: string;
  timeoutMs: number;
}

export interface TestInstallOutcome {
  command: string[];
  scratchDir: string;
  run: RunOutcome;
  files: SourceFiles;
  cleanupError: string | null;
}

export const testInstall = (request: TestInstallRequest): Promise<TestInstallOutcome> => invoke<TestInstallOutcome>("test_install", { request });
