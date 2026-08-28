import { create } from "zustand";
import { gitSummary } from "@/api/git";
import { parseOp, type RemoveOp } from "@seedr/registry-ops/pure";
import { itemHash, runRegistryOp, type RegistryOpOutcome } from "@/api/registryCli";
import type { StudioItem } from "./registry";

/**
 * Removing an item: the CLI reads the item's state hash at that moment and the
 * transaction refuses to delete anything that changed since, or any official
 * item — the daily sync would restore it (plan §6.1).
 */
/**
 * The transaction's own words for a worktree it will not touch. Matched rather
 * than re-worded, so the two stay in step: if `tx.ts` changes the sentence, the
 * paths simply stop being listed instead of the wrong advice being given.
 */
const DIRTY_WORKTREE = "The worktree has uncommitted changes";

interface MutationState {
  phase: "idle" | "removing" | "done";
  error: string | null;
  /**
   * The removal a dirty worktree got in the way of, kept so it can be finished
   * once the worktree is clean.
   *
   * The user already armed and confirmed it; being sent to git to commit
   * something unrelated should not cost them that decision, or leave them
   * wondering whether the removal still needs doing. `armed` survives alongside
   * it, so the hash captured before the refusal is the one that is presented —
   * committing does not change the item's files, so it is still valid.
   */
  blocked: StudioItem | null;
  /**
   * Bumped by every `reset`, so a component holding its own arming state can
   * follow one. The button arms optimistically — the press must show before the
   * hash comes back — so it cannot simply mirror `armed`, which is null for the
   * moment in between. Counting the resets says "start over" without saying
   * anything about that moment.
   */
  resets: number;
  outcome: RegistryOpOutcome | null;
  /** The state hash captured when the user armed the button, keyed to that item. */
  armed: { type: string; slug: string; expectedHash: string } | null;
  arm(item: StudioItem): Promise<void>;
  /**
   * Settle a removal a dirty worktree blocked, when the git dialog closes.
   *
   * Clean worktree: finish it — the user armed and confirmed before being sent
   * to commit something unrelated. Still dirty: forget the whole thing, so
   * closing without acting returns to a plain item with an unarmed button
   * rather than to a stale refusal the user has to clear by hand.
   */
  settleBlocked(): Promise<void>;
  remove(item: StudioItem): Promise<void>;
  reset(): void;
}

export const removalRefusal = (item: StudioItem): string | null =>
  item.item.sourceType === "official" ? "official items cannot be removed — the daily sync would restore them" : null;

/** The worktree's changed paths, or none if git cannot say. */
const dirtyPaths = async (): Promise<string[]> => {
  try {
    return (await gitSummary()).changes.map((change) => change.path);
  } catch {
    // The operation's own message still stands; this only adds detail to it.
    return [];
  }
};

export const useMutations = create<MutationState>((set, get) => ({
  phase: "idle",
  error: null,
  blocked: null,
  resets: 0,
  outcome: null,
  armed: null,

  async arm(item) {
    // The hash is read the moment the user arms the remove: an item that changes
    // on disk between arming and confirming is refused by the transaction.
    set({ armed: null, error: null, blocked: null });
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
    set({ phase: "removing", error: null, outcome: null, blocked: null });
    try {
      const op: RemoveOp = { v: 1, kind: "remove", type: item.type, slug: item.slug, sourceType: item.item.sourceType ?? "seedr", expectedHash: armed.expectedHash };
      const outcome = await runRegistryOp(parseOp(op));
      set({ phase: "done", outcome, armed: null });
    } catch (error) {
      const message = (error as Error).message;
      // Asked for only when that is the refusal — a git call on every failure
      // would spend a process to answer a question nobody asked.
      set({ phase: "idle", error: message, blocked: message.includes(DIRTY_WORKTREE) ? item : null });
    }
  },

  async settleBlocked() {
    const item = get().blocked;
    if (!item) return;
    // Asked of git, not assumed from what the dialog last showed: the commit
    // happened in another process and the store has no other way to know.
    if ((await dirtyPaths()).length > 0) {
      get().reset();
      return;
    }
    set({ blocked: null, error: null });
    await get().remove(item);
  },

  reset() {
    set({ phase: "idle", error: null, outcome: null, armed: null, blocked: null, resets: get().resets + 1 });
  },
}));
