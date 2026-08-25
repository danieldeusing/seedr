import { useStudio } from "./store";

/**
 * Whether the open checkout can be changed from here. Every mutation runs
 * `scripts/registry-op.ts` as a transaction, so a registry-only checkout — one
 * without that script — is readable and searchable but not editable.
 */
export const useHasOps = (): boolean => useStudio((state) => state.repo?.hasOps ?? false);

/** Why an action is unavailable, in the tip where the action would have been. */
export const NO_OPS = "This checkout has no scripts/registry-op.ts, so nothing here can change it — open it to read, and make changes in a full seedr checkout.";
