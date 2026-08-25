#!/usr/bin/env tsx
/**
 * Workstream B2: rewrite `gemini` to `antigravity` in every item.json and
 * recompile the manifests.
 *
 * PRECONDITION — check this first, it is the whole reason for the staging:
 *
 *     npm view @danieldeusing/seedr version
 *
 * The published CLI reads the registry on `main` live. Versions up to and
 * including 0.1.87 crash on an agent id they do not know, so migrating the data
 * before a newer CLI is on npm breaks `seedr list` for every installed client.
 * Do not run this while that command still prints 0.1.87.
 *
 * Then, in ONE commit:
 *   1. empty STORAGE_ALIASES in packages/registry-ops/src/agents.ts, so the
 *      writers (sync, add-local, update) stop downgrading antigravity → gemini
 *   2. run `npx tsx scripts/migrate-agent-ids.ts`
 *   3. verify: `pnpm test && pnpm check-descriptions`, and confirm
 *      `grep -rl '"gemini"' registry` returns nothing
 *   4. review `git diff --stat registry` and commit
 *
 * Rehearsed on a copy of the registry on 2026-08-25: 33 items migrated, no
 * `gemini` left in item.json files or manifests, validator accepted all 111.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateAgentIds } from "@seedr/registry-ops";

const registryDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "registry");
const migrated = migrateAgentIds(registryDir);
if (migrated.length === 0) {
  console.log("No item uses a deprecated agent id; nothing to migrate.");
} else {
  for (const { type, slug, before, after } of migrated) {
    console.log(`${type}/${slug}: ${before.join(",")} → ${after.join(",")}`);
  }
  console.log(`Migrated ${migrated.length} item(s) and recompiled the manifests. Review with: git diff --stat registry`);
}
