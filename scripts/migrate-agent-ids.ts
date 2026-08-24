#!/usr/bin/env tsx
/**
 * Workstream B2: rewrite `gemini` to `antigravity` in every item.json and
 * recompile the manifests. Run once, after a CLI that understands `antigravity`
 * has been published; empty STORAGE_ALIASES in packages/registry-ops/src/agents.ts
 * in the same change so the writers stop downgrading, then review the diff and
 * commit it.
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
