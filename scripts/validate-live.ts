#!/usr/bin/env npx tsx
/**
 * Live validation of the registry against the real network.
 *
 * Usage: pnpm validate:live [--all] [--sample N] [--only <type>/<slug>]
 *
 * For every item:
 *   - toolr: every declared file exists on disk and the digest recomputes (always).
 *   - synced: the pinned commit is reachable, every file in `contents.files` exists in the
 *     tree at that commit, the license file exists when one is recorded, the marketplace file
 *     at `marketplaceRef.sha` still names that marketplace, and — for plugins — a
 *     `.claude-plugin/plugin.json` with a `name` exists unless `strict` is false, in which case
 *     the inline definition (`lspServers` / `skills`) is checked instead.
 *   - digest: recomputed from the bytes at the pinned commit for a deterministic sample of
 *     synced items (default 12, spread over the sorted list), or for all with `--all`.
 *
 * Transient failures (network, 5xx, 429, rate limit) are retried with backoff by the client
 * and reported as such; 404s, schema and digest mismatches are deterministic failures.
 * Exits non-zero on any failure.
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, join, sep } from "node:path";
import { typeDirName } from "@seedr/registry-ops";
import { DEFAULT_REGISTRY_DIR, readAllItems } from "./compile-manifest.js";
import { flattenFileTree } from "./lib/validate-item.js";
import { MARKETPLACE_FILE, PLUGIN_JSON } from "./sync/anthropic.js";
import { computeContentDigest } from "./sync/digest.js";
import { GitHubClient, isTransientError } from "./sync/github.js";
import { parseMarketplace } from "./sync/marketplace.js";
import type { GitTreeItem, ManifestItem } from "./sync/types.js";
import { itemKey } from "./sync/types.js";
import { listTreeFiles, mapConcurrent, parseGitHubRepoUrl, parseGitHubTreeUrl } from "./sync/utils.js";

export interface LiveOptions {
  registryDir?: string;
  client?: GitHubClient;
  /** Recompute the digest for every synced item. */
  all?: boolean;
  /** Number of synced items whose digest is recomputed when `all` is false. */
  sample?: number;
  /** Restrict to these item keys ("type/slug"). */
  only?: string[];
  log?: (line: string) => void;
}

export interface LiveFailure {
  key: string;
  message: string;
  transient: boolean;
}

export interface LiveReport {
  checked: number;
  digestsVerified: number;
  failures: LiveFailure[];
}

interface ContentPin {
  repo: string;
  sha: string;
  path: string;
}

/** Where the CLI would fetch this item from: pluginSource/marketplaceRef for plugins, externalUrl otherwise. */
export function locateContent(item: ManifestItem): ContentPin {
  if (!item.sourceRevision) throw new Error("no sourceRevision");
  const source = item.pluginSource;
  if (source) {
    if (source.kind === "marketplace-path") {
      if (!item.marketplaceRef) throw new Error("marketplace-path source without marketplaceRef");
      const repo = parseGitHubRepoUrl(item.marketplaceRef.url);
      if (!repo) throw new Error(`marketplaceRef.url ${item.marketplaceRef.url} is not a GitHub repository`);
      return { repo: repo.repo, sha: source.sha, path: source.path ?? "" };
    }
    const repo = parseGitHubRepoUrl(source.url ?? "");
    if (!repo) throw new Error(`pluginSource.url ${source.url} is not a GitHub repository`);
    return { repo: repo.repo, sha: source.sha, path: source.kind === "git-subdir" ? (source.path ?? "") : "" };
  }
  const tree = item.externalUrl ? parseGitHubTreeUrl(item.externalUrl) : null;
  if (!tree) throw new Error(`externalUrl ${item.externalUrl} is not a GitHub tree URL`);
  if (tree.ref !== item.sourceRevision) throw new Error(`externalUrl is pinned to ${tree.ref}, sourceRevision is ${item.sourceRevision}`);
  return { repo: tree.repo, sha: item.sourceRevision, path: tree.path };
}

function collectDiskFiles(dir: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...collectDiskFiles(join(dir, entry.name), rel));
    else if (rel !== "item.json") files.push(rel);
  }
  return files;
}

function checkToolr(registryDir: string, item: ManifestItem): void {
  const dir = join(registryDir, typeDirName(item.type), item.slug);
  const onDisk = collectDiskFiles(dir).sort();
  const declared = flattenFileTree(item.contents?.files ?? []);
  if (JSON.stringify(onDisk) !== JSON.stringify(declared)) {
    throw new Error(`declared files ${JSON.stringify(declared)} differ from disk ${JSON.stringify(onDisk)}`);
  }
  const digest = computeContentDigest(onDisk.map((path) => ({ path, bytes: readFileSync(join(dir, path.split("/").join(sep))) })));
  if (digest !== (item.contentDigest ?? null)) {
    throw new Error(`digest mismatch: manifest ${item.contentDigest}, disk ${digest}`);
  }
}

async function checkSynced(client: GitHubClient, item: ManifestItem, verifyDigest: boolean): Promise<boolean> {
  const pin = locateContent(item);
  const tree = await client.getTree(pin.repo, pin.sha);
  const blobs = new Map<string, GitTreeItem>(tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry]));
  const fullPath = (path: string): string => (pin.path ? `${pin.path}/${path}` : path);

  const declared = flattenFileTree(item.contents?.files ?? []);
  if (declared.length === 0) throw new Error("contents.files is empty");
  const missing = declared.filter((path) => !blobs.has(fullPath(path)));
  if (missing.length > 0) throw new Error(`${missing.length} declared file(s) missing at ${pin.sha}: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}`);

  const actual = listTreeFiles(tree, pin.path).files.map((file) => file.path).sort();
  const undeclared = actual.filter((path) => !declared.includes(path));
  if (undeclared.length > 0) {
    throw new Error(`${undeclared.length} file(s) at ${pin.sha} are not declared in contents.files: ${undeclared.slice(0, 5).join(", ")}${undeclared.length > 5 ? ", …" : ""}`);
  }

  if (item.license?.file && !blobs.has(item.license.file)) throw new Error(`license file ${item.license.file} missing at ${pin.sha}`);
  if (item.license?.installAs && !item.license.file) throw new Error("license.installAs without license.file");

  if (item.type === "plugin") {
    if (item.strict === false) {
      const hasLsp = item.lspServers && Object.keys(item.lspServers).length > 0;
      const hasSkills = item.skills && item.skills.length > 0;
      if (!hasLsp && !hasSkills) throw new Error("strict:false plugin without an inline lspServers or skills definition");
    } else {
      if (!declared.includes(PLUGIN_JSON)) throw new Error(`strict plugin does not declare ${PLUGIN_JSON}`);
      const pluginJson = JSON.parse(await client.getRawText(pin.repo, pin.sha, fullPath(PLUGIN_JSON), blobs.get(fullPath(PLUGIN_JSON))!.sha)) as { name?: unknown };
      if (typeof pluginJson.name !== "string" || pluginJson.name.length === 0) throw new Error(`${PLUGIN_JSON} at ${pin.sha} has no "name"`);
    }
    if (item.marketplaceRef) {
      const repo = parseGitHubRepoUrl(item.marketplaceRef.url);
      if (!repo) throw new Error(`marketplaceRef.url ${item.marketplaceRef.url} is not a GitHub repository`);
      const marketplace = parseMarketplace(JSON.parse(await client.getRawText(repo.repo, item.marketplaceRef.sha, MARKETPLACE_FILE)), `${repo.repo}@${item.marketplaceRef.sha}`);
      if (marketplace.name !== item.marketplaceRef.name) {
        throw new Error(`marketplace at ${item.marketplaceRef.sha} is named "${marketplace.name}", item records "${item.marketplaceRef.name}"`);
      }
    }
  }

  if (!verifyDigest) return false;
  const entries = await mapConcurrent(declared, 8, async (path) => ({
    path,
    bytes: await client.getRawBytes(pin.repo, pin.sha, fullPath(path), blobs.get(fullPath(path))!.sha),
  }));
  if (item.license?.installAs && !declared.includes(item.license.installAs)) {
    entries.push({ path: item.license.installAs, bytes: await client.getRawBytes(pin.repo, pin.sha, item.license.file!, blobs.get(item.license.file!)!.sha) });
  }
  const digest = computeContentDigest(entries);
  if (digest !== item.contentDigest) throw new Error(`digest mismatch: manifest ${item.contentDigest}, upstream ${digest}`);
  return true;
}

/** Every k-th synced item, so the sample is stable between runs and spreads over all sources. */
export function pickSample(keys: string[], size: number): Set<string> {
  if (size <= 0 || keys.length === 0) return new Set();
  if (size >= keys.length) return new Set(keys);
  const step = keys.length / size;
  const picked = new Set<string>();
  for (let i = 0; i < size; i++) picked.add(keys[Math.floor(i * step)]!);
  return picked;
}

export async function validateLive(options: LiveOptions = {}): Promise<LiveReport> {
  const registryDir = options.registryDir ?? DEFAULT_REGISTRY_DIR;
  const log = options.log ?? ((line: string) => console.log(line));
  const client = options.client ?? new GitHubClient({ log });
  const items = readAllItems({ registryDir })
    .filter((item) => !options.only || options.only.includes(itemKey(item)))
    .sort((a, b) => itemKey(a).localeCompare(itemKey(b), "en"));
  const syncedKeys = items.filter((item) => item.sourceType !== "toolr").map(itemKey);
  const digestKeys = options.all ? new Set(syncedKeys) : pickSample(syncedKeys, options.sample ?? 12);

  const report: LiveReport = { checked: 0, digestsVerified: 0, failures: [] };
  log(`Validating ${items.length} item(s) live; digest recomputed for ${digestKeys.size} synced item(s)${options.all ? " (--all)" : ""}`);

  await mapConcurrent(items, 4, async (item) => {
    const key = itemKey(item);
    report.checked++;
    try {
      if (item.sourceType === "toolr") {
        checkToolr(registryDir, item);
        report.digestsVerified++;
        log(`  ✓ ${key} (disk, digest ok)`);
      } else {
        const verified = await checkSynced(client, item, digestKeys.has(key));
        if (verified) report.digestsVerified++;
        log(`  ✓ ${key} @ ${item.sourceRevision!.slice(0, 7)}${verified ? " (digest ok)" : ""}`);
      }
    } catch (error) {
      const transient = isTransientError(error);
      const message = error instanceof Error ? error.message : String(error);
      report.failures.push({ key, message, transient });
      log(`  ✗ ${key}: ${message}${transient ? " [transient]" : ""}`);
    }
  });

  report.failures.sort((a, b) => a.key.localeCompare(b.key, "en"));
  log(`\n${report.checked} checked, ${report.digestsVerified} digest(s) verified, ${report.failures.length} failure(s)`);
  for (const failure of report.failures) log(`  - ${failure.key}: ${failure.message}${failure.transient ? " [transient]" : " [deterministic]"}`);
  log(`GitHub requests: ${client.stats.requests} (retries ${client.stats.retries})`);
  return report;
}

function parseArgs(argv: string[]): LiveOptions {
  const options: LiveOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--all") options.all = true;
    else if (arg === "--sample") options.sample = Number(argv[++i]);
    else if (arg === "--only") (options.only ??= []).push(argv[++i]!);
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (options.sample !== undefined && (!Number.isInteger(options.sample) || options.sample < 0)) throw new Error("--sample needs a non-negative integer");
  return options;
}

if (process.argv[1] && basename(process.argv[1]).startsWith("validate-live")) {
  validateLive(parseArgs(process.argv.slice(2)))
    .then((report) => process.exit(report.failures.length > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}
