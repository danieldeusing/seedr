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
 *
 * `--repo <path>` acts on another checkout instead of this one, which is how a
 * registry whose own tooling predates this CLI can still be changed safely.
 *
 * Results go to stdout as JSON; failures to stderr with exit code 1. Operations
 * are read from a file (or stdin with `-`) rather than argv — Windows caps a
 * command line near 32 K and a longDescription alone can be a few KB.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveRepoIdentity,
  isComponentType,
  itemExternalUrl,
  itemStateHash,
  listItemsChecked,
  readItem,
  runRegistryTransaction,
  typeDirName,
  validateItem,
} from "@seedr/registry-ops";
import type { ComponentType } from "@seedr/shared";

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
  const registryDir = join(repoRoot, "registry");
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
    default:
      fail("usage: run --op <file|->, list [type], hash <type> <slug>, validate <type> <slug>, identity");
  }
}

main(process.argv.slice(2)).catch((error: Error) => fail(error.message));
