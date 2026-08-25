#!/usr/bin/env tsx
/**
 * Rewrite `sourceType: "toolr"` to `"seedr"` in every item.json and recompile
 * the manifests.
 *
 * PRECONDITION — check this first, it is the whole reason for the staging:
 *
 *     npm view @danieldeusing/seedr version
 *
 * The published CLI reads the registry on `main` live. Versions up to and
 * including 0.1.87 branch on `item.sourceType === "toolr"` to decide whether an
 * item's content comes from the registry itself or from a pinned upstream, so
 * migrating the data before a newer CLI is on npm turns every first-party item
 * into an unresolvable community item and breaks `seedr add` for every installed
 * client. Do not run this while that command still prints 0.1.87.
 *
 * Then, in ONE commit:
 *   1. empty STORAGE_SOURCE_TYPES in packages/registry-ops/src/sourceTypes.ts,
 *      so the writers (add-local) stop downgrading seedr → toolr
 *   2. run `npx tsx scripts/migrate-source-types.ts`
 *   3. verify: `pnpm test && pnpm check-descriptions`, and confirm
 *      `grep -rl '"toolr"' registry` returns nothing
 *   4. review `git diff --stat registry` and commit
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateSourceTypes } from "@seedr/registry-ops";

const registryDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "registry");
const migrated = migrateSourceTypes(registryDir);
if (migrated.length === 0) {
  console.log("No item uses a deprecated source type; nothing to migrate.");
} else {
  for (const { type, slug, before, after } of migrated) {
    console.log(`${type}/${slug}: ${before} → ${after}`);
  }
  console.log(`Migrated ${migrated.length} item(s) and recompiled the manifests. Review with: git diff --stat registry`);
}
