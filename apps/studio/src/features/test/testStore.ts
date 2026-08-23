import { create } from "zustand";
import type { FileTreeNode } from "@seedr/shared";
import { fs } from "@/api/fs";
import { testInstall, type TestInstallOutcome } from "@/api/testInstall";
import { loadFileTree, type StudioItem } from "@/features/explorer/registry";

/**
 * Test = a real install (plan §6.5): the real handler, the real local content,
 * into a scratch directory, with the written files compared against the item's
 * own. Synced items install from their upstream repository, so they are not
 * offered here — that would be the network check, a separate action.
 */
export const TEST_TIMEOUT_MS = 120_000;

export interface Verdict {
  ok: boolean;
  /** Agent roots the install wrote into, e.g. `.claude`, `.agents`. */
  roots: string[];
  problems: string[];
}

interface TestState {
  target: StudioItem | null;
  phase: "idle" | "running" | "done";
  outcome: TestInstallOutcome | null;
  verdict: Verdict | null;
  error: string | null;
  run(item: StudioItem): Promise<void>;
  reset(): void;
}

export const testRefusal = (item: StudioItem): string | null =>
  item.item.sourceType === "toolr" ? null : `${item.item.sourceType ?? "synced"} items install from their upstream repository — test them with the CLI online`;

/** Every file path in a tree, relative, with forward slashes. */
const flatten = (nodes: FileTreeNode[], prefix = ""): string[] =>
  nodes.flatMap((node) => (node.type === "directory" ? flatten(node.children ?? [], `${prefix}${node.name}/`) : [`${prefix}${node.name}`]));

const rootOf = (rel: string): string => rel.split("/")[0] ?? rel;

/**
 * Did the install do what an install of this item must do? Exit 0 and something
 * written, always; for a skill, every file of the item under `skills/<slug>/` of
 * at least one agent root, byte for byte when the file is text.
 */
export function judge(item: StudioItem, outcome: TestInstallOutcome, sources: Record<string, string | null>): Verdict {
  const problems: string[] = [];
  const { run, files } = outcome;
  if (run.status !== "ok") problems.push(`the CLI ${run.status === "failed" ? `failed with exit code ${run.exitCode}` : run.status}`);
  const written = [...Object.keys(files.files), ...files.skipped];
  if (written.length === 0) problems.push("nothing was written");
  if (outcome.cleanupError) problems.push(`scratch directory not removed: ${outcome.cleanupError}`);

  if (item.type === "skill") {
    for (const [rel, text] of Object.entries(sources)) {
      const suffix = `/skills/${item.slug}/${rel}`;
      const installed = written.filter((path) => path.endsWith(suffix));
      if (installed.length === 0) {
        problems.push(`${rel} was not installed`);
      } else if (text !== null && !installed.some((path) => files.files[path] === text)) {
        problems.push(`${rel} was installed with different content`);
      }
    }
  }
  return { ok: problems.length === 0, roots: [...new Set(written.map(rootOf))].sort(), problems };
}

/** The item's own files, text when the host can read them as text, else null (compare presence only). */
async function readSources(item: StudioItem): Promise<Record<string, string | null>> {
  const sources: Record<string, string | null> = {};
  for (const rel of flatten(await loadFileTree(fs, item.dir))) {
    try {
      sources[rel] = await fs.readText(`${item.dir}/${rel}`);
    } catch {
      sources[rel] = null;
    }
  }
  return sources;
}

export const useTest = create<TestState>((set) => ({
  target: null,
  phase: "idle",
  outcome: null,
  verdict: null,
  error: null,

  async run(item) {
    const refusal = testRefusal(item);
    if (refusal) {
      set({ target: item, phase: "idle", outcome: null, verdict: null, error: refusal });
      return;
    }
    set({ target: item, phase: "running", outcome: null, verdict: null, error: null });
    try {
      const [outcome, sources] = await Promise.all([
        testInstall({ taskId: `test-${item.type}-${item.slug}`, type: item.type, slug: item.slug, timeoutMs: TEST_TIMEOUT_MS }),
        readSources(item),
      ]);
      set({ phase: "done", outcome, verdict: judge(item, outcome, sources) });
    } catch (error) {
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  reset() {
    set({ target: null, phase: "idle", outcome: null, verdict: null, error: null });
  },
}));
