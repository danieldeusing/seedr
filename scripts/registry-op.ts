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
  listItems,
  readItem,
  runRegistryTransaction,
  typeDirName,
  validateItem,
} from "@seedr/registry-ops";
import type { ComponentType } from "@seedr/shared";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryDir = join(repoRoot, "registry");

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
  const [command, ...rest] = argv;
  switch (command) {
    case "run": {
      const flag = rest.indexOf("--op");
      const source = flag >= 0 ? rest[flag + 1] : undefined;
      if (!source) fail("run needs --op <file> (or - for stdin)");
      const raw = source === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(source), "utf8");
      const { result, changedPaths, headBefore } = await runRegistryTransaction(JSON.parse(raw), { repoRoot });
      out({ ok: true, ...result, changedPaths, headBefore });
      return;
    }
    case "list": {
      const only = rest[0] ? requireType(rest[0]) : undefined;
      out(
        listItems(registryDir)
          .filter(({ type }) => !only || type === only)
          .map(({ type, slug, item }) => ({ type, slug, sourceType: item.sourceType, name: item.name, hash: itemStateHash(registryDir, type, slug) }))
      );
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
