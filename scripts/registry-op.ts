#!/usr/bin/env npx tsx
/**
 * The operations CLI — the one front door the skills (and anything else without
 * a Studio) use to change the registry. Every mutation runs through
 * @seedr/registry-ops' transaction: preconditions, apply, compile, verify,
 * rollback. Nothing here copies or deletes on its own.
 *
 *   tsx scripts/registry-op.ts run --op <file.json | ->   apply one operation transactionally
 *   tsx scripts/registry-op.ts list [type]               items as JSON: type, slug, sourceType, name, hash
 *   tsx scripts/registry-op.ts hash <type> <slug>        the expectedHash an update/remove must present
 *   tsx scripts/registry-op.ts validate <type> <slug>    validation errors for one item
 *   tsx scripts/registry-op.ts identity                  owner/repo/branch/author derived from git
 *   tsx scripts/registry-op.ts pin <github-url>          pinned commit, digest, file tree and plugin source for an add-remote
 *   tsx scripts/registry-op.ts upstream-status         which synced items the next sync would change, without writing anything
 *
 * `--repo <path>` acts on another checkout instead of this one, which is how a
 * registry whose own tooling predates this CLI can still be changed safely.
 *
 * Results go to stdout as JSON; failures to stderr with exit code 1. Operations
 * are read from a file (or stdin with `-`) rather than argv — Windows caps a
 * command line near 32 K and a longDescription alone can be a few KB.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveRepoIdentity, isComponentType, itemExternalUrl, itemStateHash, listItemsChecked, readItem, readLocalSources, resolveRegistryDir, runRegistryTransaction, sourceDiff, sourceStatus, typeDirName, validateItem } from "@seedr/registry-ops";
import type { ComponentType } from "@seedr/shared";
import { cloneUrl, treeUrl } from "./sync/anthropic.js";
import { collectContent } from "./sync/content.js";
import { GitHubClient } from "./sync/github.js";
import type { ManifestItem } from "./sync/types.js";
import { checkUpstream } from "./sync/upstream.js";
import { parseGitHubTreeUrl } from "./sync/utils.js";

/**
 * Which checkout to act on. It defaults to the one this script lives in, and
 * `--repo <path>` points it at another — a fork that predates this CLI, or any
 * registry whose own tooling is older. The transaction already takes a repoRoot
 * and runs git inside it, so the only thing that was ever fixed here was this
 * constant.
 */
export function repoRootFrom(argv: string[]): string {
  const flag = argv.indexOf("--repo");
  const named = flag >= 0 ? argv[flag + 1] : undefined;
  return named ? resolve(named) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

const out = (value: unknown) => console.log(JSON.stringify(value, null, 2));

/**
 * A GitHub client for the read-only network commands, authenticated the way
 * `pnpm sync` is: GITHUB_TOKEN if set, else the gh CLI's login — which is what
 * a Studio launch has — else unauthenticated at sixty requests an hour. Its
 * chatter goes to stderr so stdout stays JSON.
 */
function githubClient(): GitHubClient {
  const env = { ...process.env };
  if (!env.GITHUB_TOKEN) {
    try {
      env.GITHUB_TOKEN = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
    } catch {
      // No gh login on this machine: the client says so and runs unauthenticated.
    }
  }
  return new GitHubClient({ env, log: (line) => console.error(line) });
}
const fail = (message: string): never => {
  console.error(`registry-op: ${message}`);
  process.exit(1);
};

function requireType(value: string | undefined): ComponentType {
  if (!isComponentType(value)) fail(`unknown type "${value ?? ""}"`);
  return value;
}

async function main(argv: string[]): Promise<void> {
  const repoRoot = repoRootFrom(argv);
  const registryDir = resolveRegistryDir(repoRoot);
  // `--repo <path>` is global, so it must not be read as a command's own argument.
  const flag = argv.indexOf("--repo");
  const [command, ...rest] = flag >= 0 ? [...argv.slice(0, flag), ...argv.slice(flag + 2)] : argv;
  switch (command) {
    case "run": {
      const opFlag = rest.indexOf("--op");
      const source = opFlag >= 0 ? rest[opFlag + 1] : undefined;
      if (!source) fail("run needs --op <file> (or - for stdin)");
      const raw = source === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(source), "utf8");
      const { result, changedPaths, headBefore } = await runRegistryTransaction(JSON.parse(raw), { repoRoot });
      out({ ok: true, ...result, changedPaths, headBefore });
      return;
    }
    case "list": {
      const only = rest[0] ? requireType(rest[0]) : undefined;
      // One item a newer validator refuses — a fork's legacy `externalUrl`, say —
      // must not hide every other item. The violations are reported beside the
      // list; the transaction is still strict about the item it touches.
      const { items, violations } = listItemsChecked(registryDir);
      const listed = items
        .filter(({ type }) => !only || type === only)
        .map(({ type, slug, item }) => ({ type, slug, sourceType: item.sourceType, name: item.name, hash: itemStateHash(registryDir, type, slug) }));
      out(violations.length > 0 ? { items: listed, violations } : listed);
      return;
    }
    case "hash": {
      const type = requireType(rest[0]);
      const hash = rest[1] ? itemStateHash(registryDir, type, rest[1]) : null;
      if (!hash) fail(`no ${type} item "${rest[1] ?? ""}"`);
      out({ type, slug: rest[1], hash });
      return;
    }
    case "source-status": {
      // Where an item stands against the folder it was copied from. Read-only,
      // and deliberately here rather than in Studio: the folder is outside the
      // checkout, which the app's own filesystem bridge refuses to read.
      //
      // Without arguments it answers for every item that records an origin, in
      // one run: the explorer marks a whole list at once, and starting a process
      // per item to do it would be slower than reading the folders is.
      if (!rest[0]) {
        const items = Object.keys(readLocalSources(repoRoot)).map((key) => {
          const [type, slug] = key.split("/");
          return { type, slug, ...sourceStatus(repoRoot, registryDir, requireType(type), slug ?? "") };
        });
        out({ items });
        return;
      }
      const type = requireType(rest[0]);
      if (!rest[1]) fail("source-status needs <type> <slug>, or nothing for every recorded item");
      out({ type, slug: rest[1], ...sourceStatus(repoRoot, registryDir, type, rest[1]) });
      return;
    }
    case "source-diff": {
      // What changed between the folder an item was copied from and the copy
      // here, as a unified diff. Read-only, and here for the same reason
      // `source-status` is: the folder is outside the checkout.
      const type = requireType(rest[0]);
      if (!rest[1]) fail("source-diff needs <type> <slug>");
      out({ type, slug: rest[1], diff: sourceDiff(repoRoot, registryDir, type, rest[1]) });
      return;
    }
    case "validate": {
      const type = requireType(rest[0]);
      if (!rest[1]) fail("validate needs <type> <slug>");
      const errors = validateItem(readItem(registryDir, type, rest[1]), { expectedType: type, expectedSlug: rest[1] });
      out({ type, slug: rest[1], ok: errors.length === 0, errors });
      return;
    }
    case "identity": {
      const identity = await deriveRepoIdentity(repoRoot);
      const sample = itemExternalUrl(identity, `registry/${typeDirName("skill")}/<slug>`);
      out({ ...identity, externalUrlTemplate: sample });
      return;
    }
    case "pin": {
      // Provenance for an add-remote, computed the way the sync computes it:
      // the commit the content is read at, its digest, the file tree and the
      // plugin source the daily re-sync will follow. Read-only, but it talks
      // to GitHub, so the client's chatter goes to stderr and stdout stays JSON.
      const parsed = parseGitHubTreeUrl(rest[0] ?? "");
      if (!parsed) fail(`pin needs a GitHub repository or tree URL, got "${rest[0] ?? ""}"`);
      const client = githubClient();
      const branch = await client.getDefaultBranch(parsed.repo);
      const { sha } = await client.getCommit(parsed.repo, parsed.ref ?? branch);
      const tree = await client.getTree(parsed.repo, sha);
      const content = await collectContent(client, { repo: parsed.repo, sha, path: parsed.path }, tree);
      const updatedAt = await client.getLastCommitDate(parsed.repo, sha, parsed.path);
      out({
        repo: parsed.repo,
        branch,
        path: parsed.path,
        sourceRevision: sha,
        externalUrl: treeUrl(parsed.repo, sha, parsed.path),
        ...(content.contentDigest && { contentDigest: content.contentDigest }),
        license: content.license,
        ...(updatedAt && { updatedAt }),
        pluginSource:
          parsed.path === ""
            ? { kind: "url", url: cloneUrl(parsed.repo), ref: branch, sha }
            : { kind: "git-subdir", path: parsed.path, url: cloneUrl(parsed.repo), ref: branch, sha },
        contents: { files: content.files },
        skipped: content.skipped,
      });
      return;
    }
    case "upstream-status": {
      // The daily sync's question asked by hand — which items would its next
      // run change — for Studio's explorer button, or a shell. Reads only.
      const items = listItemsChecked(registryDir).items.map((located) => located.item as ManifestItem);
      out({ checkedAt: new Date().toISOString(), items: await checkUpstream(githubClient(), items) });
      return;
    }
    default:
      fail("usage: run --op <file|->, list [type], hash <type> <slug>, validate <type> <slug>, identity, pin <github-url>, upstream-status");
  }
}

main(process.argv.slice(2)).catch((error: Error) => fail(error.message));
