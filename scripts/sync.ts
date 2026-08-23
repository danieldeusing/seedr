#!/usr/bin/env npx tsx
/**
 * Registry sync orchestrator — fail-closed (docs/registry-integrity.md §5).
 *
 * Usage: pnpm sync            (GITHUB_TOKEN is picked up from `gh auth token` when unset)
 *
 * Sources:
 *   - official skills        anthropics/skills
 *   - official marketplace   anthropics/claude-plugins-official (marketplace.json is the source of truth)
 *   - community items        one source per item, re-pinned from its repository's default branch
 *
 * The complete proposed registry is staged in memory first. Toolr items are never touched.
 * A source that fails is carried over unchanged; deletions are computed only for sources
 * that completed, and only metadata-only directories are ever removed. The run aborts
 * without writing anything when proposed deletions exceed SYNC_MAX_DELETIONS (default 5),
 * when any proposed item fails validation, or when no source completed at all.
 *
 * Environment:
 *   SYNC_MAX_DELETIONS   abort above this many deletions (default 5)
 *   SYNC_ALLOW_EMPTY=1   accept an empty skills listing (normally treated as a failed source)
 *   SYNC_DRY_RUN=1       stage and report, write nothing (also: pnpm sync -- --dry-run)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DEFAULT_REGISTRY_DIR, compileManifest, readAllItems, typeDirName } from "./compile-manifest.js";
import { findDuplicateItems, validateItem } from "./lib/validate-item.js";
import { syncOfficialPlugins, syncOfficialSkills, type SourceContext } from "./sync/anthropic.js";
import { syncCommunityItem } from "./sync/community.js";
import { GitHubClient } from "./sync/github.js";
import { serializeItem } from "./sync/item.js";
import type { ItemKey, ManifestItem, SourceResult } from "./sync/types.js";
import { itemKey } from "./sync/types.js";
import { mapConcurrent } from "./sync/utils.js";

export const DEFAULT_MAX_DELETIONS = 5;
const COMMUNITY_CONCURRENCY = 3;

export interface SyncOptions {
  registryDir?: string;
  client?: GitHubClient;
  maxDeletions?: number;
  allowEmpty?: boolean;
  /** Stage and report the proposed registry without writing or compiling. */
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface SyncOutcome {
  ok: boolean;
  /** Why the run aborted, when it did. Nothing was written in that case. */
  abortReason?: string;
  added: ItemKey[];
  changed: ItemKey[];
  unchanged: ItemKey[];
  carriedOver: { key: ItemKey; reason: string }[];
  deleted: ItemKey[];
  failedSources: { name: string; reason: string }[];
}

interface NamedSource {
  name: string;
  result: SourceResult;
}

export function readEnvOptions(env: NodeJS.ProcessEnv, argv: string[] = []): { maxDeletions: number; allowEmpty: boolean; dryRun: boolean } {
  const raw = env.SYNC_MAX_DELETIONS;
  const maxDeletions = raw === undefined || raw === "" ? DEFAULT_MAX_DELETIONS : Number(raw);
  if (!Number.isInteger(maxDeletions) || maxDeletions < 0) {
    throw new Error(`SYNC_MAX_DELETIONS must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  const unknown = argv.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);
  return { maxDeletions, allowEmpty: env.SYNC_ALLOW_EMPTY === "1", dryRun: env.SYNC_DRY_RUN === "1" || argv.includes("--dry-run") };
}

function itemPath(registryDir: string, item: Pick<ManifestItem, "type" | "slug">): string {
  return join(registryDir, typeDirName(item.type), item.slug, "item.json");
}

/** Remove an item directory, but only when it holds nothing besides item.json. */
function deleteMetadataOnlyDir(registryDir: string, item: ManifestItem, log: (line: string) => void): boolean {
  const dir = join(registryDir, typeDirName(item.type), item.slug);
  if (!existsSync(dir)) return true;
  const contents = readdirSync(dir);
  if (contents.length === 1 && contents[0] === "item.json") {
    rmSync(dir, { recursive: true });
    return true;
  }
  log(`  ! not deleting ${itemKey(item)}: directory holds content files (${contents.filter((f) => f !== "item.json").join(", ")})`);
  return false;
}

export async function runSync(options: SyncOptions = {}): Promise<SyncOutcome> {
  const registryDir = options.registryDir ?? DEFAULT_REGISTRY_DIR;
  const log = options.log ?? ((line: string) => console.log(line));
  const client = options.client ?? new GitHubClient({ log });
  const maxDeletions = options.maxDeletions ?? DEFAULT_MAX_DELETIONS;
  const allowEmpty = options.allowEmpty ?? false;
  const dryRun = options.dryRun ?? false;

  const outcome: SyncOutcome = { ok: false, added: [], changed: [], unchanged: [], carriedOver: [], deleted: [], failedSources: [] };
  const abort = (reason: string): SyncOutcome => {
    log(`\n✗ Sync aborted, nothing written: ${reason}`);
    return { ...outcome, ok: false, abortReason: reason };
  };

  log(`Starting registry sync (fail-closed)${dryRun ? " — DRY RUN, nothing will be written" : ""}`);
  log(`  registry: ${registryDir}`);
  log(`  max deletions: ${maxDeletions}${allowEmpty ? ", empty listings allowed" : ""}`);

  // 1. The registry as it is. Not validated here: a broken item on disk must still be carried over.
  const existingItems = readAllItems({ registryDir, validate: false });
  const existing = new Map<ItemKey, ManifestItem>(existingItems.map((item) => [itemKey(item), item]));
  const ctx: SourceContext = { client, existing, log, allowEmpty };

  // 2. Official sources first — the marketplace decides which plugins it owns.
  const sources: NamedSource[] = [];
  const [skills, plugins] = await Promise.all([syncOfficialSkills(ctx), syncOfficialPlugins(ctx)]);
  sources.push({ name: "official-skills", result: skills }, { name: "official-marketplace", result: plugins });

  // 3. Everything synced that no official source owns is a community item with its own source.
  const officiallyOwned = new Set<ItemKey>([...skills.owned, ...plugins.owned]);
  const communityItems = existingItems.filter((item) => item.sourceType !== "toolr" && !officiallyOwned.has(itemKey(item)));
  if (communityItems.length > 0) log(`\n=== Community items (${communityItems.length}) ===`);
  const communityResults = await mapConcurrent(communityItems, COMMUNITY_CONCURRENCY, (item) => syncCommunityItem(ctx, item));
  communityItems.forEach((item, index) => sources.push({ name: `community:${itemKey(item)}`, result: communityResults[index]! }));

  // 4. Stage the proposed registry.
  const proposed = new Map<ItemKey, ManifestItem>();
  for (const item of existingItems) if (item.sourceType === "toolr") proposed.set(itemKey(item), item);

  const deletions: { key: ItemKey; reason: string }[] = [];
  for (const { name, result } of sources) {
    if (result.status === "failed") {
      outcome.failedSources.push({ name, reason: result.reason });
      for (const key of result.owned) {
        const item = existing.get(key);
        if (!item) continue;
        proposed.set(key, item);
        outcome.carriedOver.push({ key, reason: `source ${name} failed: ${result.reason}` });
      }
      continue;
    }
    const produced = new Set<ItemKey>();
    for (const item of result.items) {
      proposed.set(itemKey(item), item);
      produced.add(itemKey(item));
    }
    const failed = new Map(result.failedItems.map((failure) => [failure.key, failure.reason]));
    for (const [key, reason] of failed) {
      const item = existing.get(key);
      if (item) {
        proposed.set(key, item);
        outcome.carriedOver.push({ key, reason });
      } else {
        log(`  ! new item ${key} skipped: ${reason}`);
      }
    }
    const renamedFrom = new Map(result.renamed.map((rename) => [rename.from, rename.to]));
    for (const key of result.owned) {
      if (produced.has(key) || failed.has(key)) continue;
      const renamedTo = renamedFrom.get(key);
      deletions.push({ key, reason: renamedTo ? `renamed upstream to ${renamedTo}` : `no longer listed by ${name}` });
    }
  }

  if (sources.every((source) => source.result.status === "failed")) {
    return abort(`no source completed (${outcome.failedSources.map((s) => `${s.name}: ${s.reason}`).join("; ")})`);
  }
  if (deletions.length > maxDeletions) {
    return abort(
      `${deletions.length} deletion(s) proposed, above SYNC_MAX_DELETIONS=${maxDeletions}:\n` +
        deletions.map((d) => `    - ${d.key}: ${d.reason}`).join("\n") +
        `\n  Review upstream, then re-run with a higher SYNC_MAX_DELETIONS if the deletions are legitimate.`,
    );
  }

  // 5. Validate the whole proposed registry (carried-over and toolr items included).
  const violations: string[] = [];
  for (const item of proposed.values()) {
    violations.push(...validateItem(item, { file: `${typeDirName(item.type)}/${item.slug}/item.json` }));
  }
  violations.push(...findDuplicateItems([...proposed.values()]));
  if (violations.length > 0) {
    return abort(`${violations.length} validation violation(s):\n    ${violations.join("\n    ")}`);
  }

  // 6. Write. Only synced items are written; toolr items are never touched.
  log(dryRun ? "\n=== Proposed writes (dry run) ===" : "\n=== Writing ===");
  for (const [key, item] of proposed) {
    if (item.sourceType === "toolr") continue;
    const path = itemPath(registryDir, item);
    const serialized = serializeItem(item);
    const previous = existsSync(path) ? readFileSync(path, "utf-8") : null;
    if (previous === serialized) {
      outcome.unchanged.push(key);
      continue;
    }
    if (!dryRun) {
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, serialized);
    }
    if (previous === null) outcome.added.push(key);
    else outcome.changed.push(key);
  }
  for (const deletion of deletions) {
    const item = existing.get(deletion.key);
    if (!item) continue;
    if (dryRun || deleteMetadataOnlyDir(registryDir, item, log)) {
      outcome.deleted.push(deletion.key);
      log(`  - ${deletion.key} (${deletion.reason})`);
    }
  }

  // 7. Decision log.
  log("\n=== Decision log ===");
  log(`  added (${outcome.added.length}): ${outcome.added.join(", ") || "-"}`);
  log(`  changed (${outcome.changed.length}): ${outcome.changed.join(", ") || "-"}`);
  log(`  unchanged (${outcome.unchanged.length})`);
  log(`  deleted (${outcome.deleted.length}): ${outcome.deleted.join(", ") || "-"}`);
  log(`  carried over (${outcome.carriedOver.length}):${outcome.carriedOver.length ? "" : " -"}`);
  for (const entry of outcome.carriedOver) log(`    - ${entry.key}: ${entry.reason}`);
  log(`  failed sources (${outcome.failedSources.length}):${outcome.failedSources.length ? "" : " -"}`);
  for (const source of outcome.failedSources) log(`    - ${source.name}: ${source.reason}`);
  log(`  toolr items untouched: ${existingItems.filter((item) => item.sourceType === "toolr").length}`);
  log(`  GitHub requests: ${client.stats.requests} (retries ${client.stats.retries}, blob cache hits ${client.stats.blobCacheHits})`);

  if (dryRun) {
    log("\nDry run: nothing written, manifests not compiled.");
    return { ...outcome, ok: true };
  }

  // 8. Compile the manifests from the written item.json files (validates again, strictly).
  log("");
  compileManifest({ registryDir });
  return { ...outcome, ok: true };
}

async function main(): Promise<void> {
  const { maxDeletions, allowEmpty, dryRun } = readEnvOptions(process.env, process.argv.slice(2));
  const outcome = await runSync({ maxDeletions, allowEmpty, dryRun });
  if (!outcome.ok) process.exit(1);
  if (outcome.failedSources.length > 0) {
    console.warn(`\n⚠ ${outcome.failedSources.length} source(s) failed and were carried over unchanged; see the decision log above.`);
  }
}

if (process.argv[1] && basename(process.argv[1]).startsWith("sync")) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
