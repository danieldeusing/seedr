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
  /** The state hash captured when the user armed the button, keyed to that item. */
  armed: { type: string; slug: string; expectedHash: string } | null;
  arm(item: StudioItem): Promise<void>;
  remove(item: StudioItem): Promise<void>;
  reset(): void;
}

export const removalRefusal = (item: StudioItem): string | null =>
  item.item.sourceType === "official" ? "official items cannot be removed — the daily sync would restore them" : null;

export const useMutations = create<MutationState>((set, get) => ({
  phase: "idle",
  error: null,
  outcome: null,
  armed: null,

  async arm(item) {
    // The hash is read the moment the user arms the remove: an item that changes
    // on disk between arming and confirming is refused by the transaction.
    set({ armed: null, error: null });
    try {
      set({ armed: { type: item.type, slug: item.slug, expectedHash: await itemHash(item.type, item.slug) } });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async remove(item) {
    const refusal = removalRefusal(item);
    if (refusal) {
      set({ error: refusal });
      return;
    }
    const { armed } = get();
    if (armed?.type !== item.type || armed.slug !== item.slug) {
      set({ error: "arm the remove first" });
      return;
    }
    set({ phase: "removing", error: null, outcome: null });
    try {
      const op: RemoveOp = { v: 1, kind: "remove", type: item.type, slug: item.slug, sourceType: item.item.sourceType ?? "toolr", expectedHash: armed.expectedHash };
      const outcome = await runRegistryOp(parseOp(op));
      set({ phase: "done", outcome, armed: null });
    } catch (error) {
      set({ phase: "idle", error: (error as Error).message });
    }
  },

  reset() {
    set({ phase: "idle", error: null, outcome: null, armed: null });
  },
}));
