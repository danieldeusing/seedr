import { addLocal } from "./addLocal.js";
import { addRemote } from "./addRemote.js";
import { remove } from "./remove.js";
import { setLabels } from "./setLabels.js";
import type { OpResult, RegistryOp } from "./types.js";
import { update } from "./update.js";

/** Dispatch one parsed operation against the registry on disk. No transaction — see tx.ts. */
export function applyOp(registryDir: string, op: RegistryOp): OpResult {
  switch (op.kind) {
    case "add-local":
      return addLocal(registryDir, op);
    case "add-remote":
      return addRemote(registryDir, op);
    case "update":
      return update(registryDir, op);
    case "remove":
      return remove(registryDir, op);
    case "set-labels":
      return setLabels(registryDir, op);
  }
}
