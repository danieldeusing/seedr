import { useStudio } from "./store";

/**
 * Whether the open checkout can be changed from here. Every mutation runs
 * `scripts/registry-op.ts` as a transaction — but it does not have to be *this*
 * checkout's copy. A registry whose own tooling predates that CLI borrows the
 * default checkout's, pointed back at itself, so a fork stays editable.
 */
export const useCanMutate = (): boolean => useStudio((state) => (state.repo?.hasOps ?? false) || state.toolingRepo !== null);

/** Why an action is unavailable, in the tip where the action would have been. */
export const NO_OPS =
  "This checkout has no scripts/registry-op.ts, and no default checkout is recorded to borrow one from. Set one in settings → checkout, and this registry becomes editable again.";
