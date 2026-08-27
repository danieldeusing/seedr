#!/usr/bin/env npx tsx
/**
 * The commit gate for registry descriptions: every item.json must pass the
 * validator's description rules (.agents/rules/registry-descriptions.md).
 *
 * Runs from the husky pre-commit hook and standalone (`pnpm check-descriptions`).
 * The rule itself lives in @seedr/registry-ops, so compile, Studio and this gate
 * cannot disagree.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_TYPES, MIN_LONG_DESCRIPTION_WORDS, formatErrors, gateErrors, resolveRegistryDir, typeDirName, validateItem } from "@seedr/registry-ops";

export interface GateReport {
  errors: string[];
  checked: number;
}

/** One error line per failing item; paths are relative to the registry's parent. */
export function checkDescriptions(registryDir: string): GateReport {
  const repoRoot = dirname(registryDir);
  const errors: string[] = [];
  let checked = 0;
  for (const type of ALL_TYPES) {
    const dir = join(registryDir, typeDirName(type));
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(dir, entry.name, "item.json");
      if (!entry.isDirectory() || !existsSync(file)) continue;
      checked++;
      const relPath = relative(repoRoot, file).split("\\").join("/");
      let item: unknown;
      try {
        item = JSON.parse(readFileSync(file, "utf8"));
      } catch (error) {
        errors.push(`${relPath} is not valid JSON: ${(error as Error).message}`);
        continue;
      }
      const problems = gateErrors(validateItem(item, { expectedType: type, expectedSlug: entry.name }));
      const description = validateItem(item).filter((e) => e.field === "description");
      const all = [...description, ...problems];
      if (all.length > 0) errors.push(`${relPath} (${entry.name}): ${formatErrors(all)}`);
    }
  }
  return { errors, checked };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Not a hardcoded `registry`: a fork names its own directory in
  // seedr.config.json, and that directory *replaces* this one. Hardcoded, the
  // gate passed on upstream's items — which are already fine — and never looked
  // at the fork's own, which are the ones it exists to check.
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const registryDir = process.argv[2] ? resolve(process.argv[2]) : resolveRegistryDir(repoRoot);
  const { errors, checked } = checkDescriptions(registryDir);
  for (const error of errors) console.error(`ERROR: ${error}`);
  if (errors.length > 0) {
    console.error(
      `\n${errors.length} description error(s) across ${checked} items. Every item.json needs 'description' and a 'longDescription' of at least ${MIN_LONG_DESCRIPTION_WORDS} words with markdown backticks.\nRun '/audit-descriptions' to generate missing descriptions.`
    );
    process.exit(1);
  }
  console.log(`check-descriptions: ${checked} items ok`);
}
