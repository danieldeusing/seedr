import { create } from "zustand";
import { parseOp, type RemoveOp } from "@seedr/registry-ops/pure";
import { itemHash, runRegistryOp, type RegistryOpOutcome } from "@/api/registryCli";
import type { StudioItem } from "./registry";

/**
 * Removing an item: the CLI reads the item's state hash at that moment and the
 * transaction refuses to delete anything that changed since, or any official
 * item — the daily sync would restore it (plan §6.1).
 */
interface MutationState {
  phase: "idle" | "removing" | "done";
  error: string | null;
  outcome: RegistryOpOutcome | null;
  remove(item: StudioItem): Promise<void>;
  reset(): void;
}

export const removalRefusal = (item: StudioItem): string | null =>
  item.item.sourceType === "official" ? "official items cannot be removed — the daily sync would restore them" : null;

export const useMutations = create<MutationState>((set) => ({
  phase: "idle",
  error: null,
  outcome: null,

  async remove(item) {
    const refusal = removalRefusal(item);
    if (refusal) {
      set({ error: refusal });
      return;
    }
    set({ phase: "removing", error: null, outcome: null });
    try {
      const expectedHash = await itemHash(item.type, item.slug);
      const op: RemoveOp = { v: 1, kind: "remove", type: item.type, slug: item.slug, sourceType: item.item.sourceType ?? "toolr", expectedHash };
      const outcome = await runRegistryOp(parseOp(op));
      set({ phase: "done", outcome });
    } catch (error) {
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  reset() {
    set({ phase: "idle", error: null, outcome: null });
  },
}));
