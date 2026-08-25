import { create } from "zustand";
import type { LabelDefinition } from "@seedr/shared";
import { parseLabels } from "@seedr/registry-ops/pure";
import { fs } from "@/api/fs";
import { runRegistryOp } from "@/api/registryCli";

/**
 * The label catalogue, read from the checkout it belongs to. Labels group items
 * by what they are for — one registry serving several projects — so they live in
 * the registry, not in this machine's settings: everyone working on the checkout
 * sees the same list, and the CLI and the web app read the same file.
 */
export const LABELS_PATH = "registry/labels.json";

interface LabelsState {
  labels: LabelDefinition[];
  loading: boolean;
  error: string | null;
  load(): Promise<void>;
  /** Replaces the catalogue in one transaction. Resolves to an error, or null. */
  save(labels: LabelDefinition[]): Promise<string | null>;
}

export const useLabels = create<LabelsState>((set) => ({
  labels: [],
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      // A checkout from before labels existed simply has none.
      const raw: unknown = (await fs.pathExists(LABELS_PATH)) ? JSON.parse(await fs.readText(LABELS_PATH)) : { version: 1, labels: [] };
      set({ labels: parseLabels(raw), loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  async save(labels) {
    set({ error: null });
    try {
      await runRegistryOp({ v: 1, kind: "set-labels", labels });
      set({ labels });
      return null;
    } catch (error) {
      // The transaction refuses to drop a label items still carry, and says
      // which ones — that message is the useful part, so it is shown verbatim.
      const message = (error as Error).message;
      set({ error: message });
      return message;
    }
  },
}));
