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
   * Which paths are dirty, when that is why the operation was refused.
   *
   * The refusal is not fussiness and the message cannot say why in one line: a
   * rollback is `git checkout` plus `git clean -fdqx` over the registry
   * directory, so uncommitted work there would be destroyed by an operation
   * that failed — and the verify step asserts only the item's own paths
   * changed, which pre-existing edits break. Naming them turns "go and find
   * out" into "these three files".
   */
  blockedBy: string[];
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
  outcome: RegistryOpOutcome | null;
  /** The state hash captured when the user armed the button, keyed to that item. */
  armed: { type: string; slug: string; expectedHash: string } | null;
  arm(item: StudioItem): Promise<void>;
  /** Finish a removal a dirty worktree blocked, if the worktree is clean now. */
  resumeBlocked(): Promise<void>;
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
  blockedBy: [],
  blocked: null,
  outcome: null,
  armed: null,

  async arm(item) {
    // The hash is read the moment the user arms the remove: an item that changes
    // on disk between arming and confirming is refused by the transaction.
    set({ armed: null, error: null, blockedBy: [], blocked: null });
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
    set({ phase: "removing", error: null, outcome: null, blockedBy: [], blocked: null });
    try {
      const op: RemoveOp = { v: 1, kind: "remove", type: item.type, slug: item.slug, sourceType: item.item.sourceType ?? "seedr", expectedHash: armed.expectedHash };
      const outcome = await runRegistryOp(parseOp(op));
      set({ phase: "done", outcome, armed: null });
    } catch (error) {
      const message = (error as Error).message;
      // Asked for only when that is the refusal — a git call on every failure
      // would spend a process to answer a question nobody asked.
      const dirty = message.includes(DIRTY_WORKTREE);
      const blockedBy = dirty ? await dirtyPaths() : [];
      set({ phase: "idle", error: message, blockedBy, blocked: dirty ? item : null });
    }
  },

  async resumeBlocked() {
    const item = get().blocked;
    // Only when the worktree is actually clean now: closing git without
    // committing must leave the removal refused rather than retry it into the
    // same wall.
    if (!item || (await dirtyPaths()).length > 0) return;
    set({ blocked: null, blockedBy: [], error: null });
    await get().remove(item);
  },

  reset() {
    set({ phase: "idle", error: null, outcome: null, armed: null, blockedBy: [], blocked: null });
  },
}));
