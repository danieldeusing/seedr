import { mkdirSync, writeFileSync } from "node:fs";
import type { RegistryItem } from "@seedr/shared";
import { itemDir, itemJsonPath } from "../fsPaths.js";
import { itemExists } from "../read.js";
import { omit } from "../util.js";
import { formatErrors, validateItem } from "../validate.js";
import { today } from "./addLocal.js";
import type { AddRemoteOp, OpResult } from "./types.js";

/**
 * Register a GitHub-hosted item by metadata alone — no content is copied; the
 * CLI fetches the pinned revision at install time and verifies the digest.
 * Fetching the metadata AND computing the pin (`sourceRevision`,
 * `contentDigest`, `pluginSource` for plugins) is the caller's job (the skill
 * via `gh`, or Studio, both of which read the repository tree anyway); an
 * unpinned item is refused rather than written, because nothing downstream —
 * compile, the CLI, the sync — accepts it.
 */
export function addRemote(registryDir: string, op: AddRemoteOp): OpResult {
  if (itemExists(registryDir, op.type, op.slug)) {
    throw new Error(`A ${op.type} item "${op.slug}" already exists — use update, or remove it first`);
  }
  const item: RegistryItem = {
    ...omit(op, "v", "kind"),
    sourceType: "community",
    updatedAt: op.updatedAt ?? today(),
  };
  const errors = validateItem(item, { expectedType: op.type, expectedSlug: op.slug });
  if (errors.length > 0) throw new Error(`Item would be invalid: ${formatErrors(errors)}`);

  mkdirSync(itemDir(registryDir, op.type, op.slug), { recursive: true });
  writeFileSync(itemJsonPath(registryDir, op.type, op.slug), JSON.stringify(item, null, 2) + "\n");
  return { kind: op.kind, type: op.type, slug: op.slug, item };
}
