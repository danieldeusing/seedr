import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ComponentType } from "@seedr/shared";
import { DEFAULT_REGISTRY_DIR, assertSlug, registryDirName, typeDirName } from "./paths.js";

/** THE one implementation of where things live on disk. Every path is derived here. */

/** The registry inside a checkout: `registry/`, or what `seedr.config.json` names. */
export const REPO_CONFIG_FILE = "seedr.config.json";

export function resolveRegistryDir(repoRoot: string): string {
  const config = join(repoRoot, REPO_CONFIG_FILE);
  if (!existsSync(config)) return join(repoRoot, DEFAULT_REGISTRY_DIR);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(config, "utf8"));
  } catch (error) {
    throw new Error(`${REPO_CONFIG_FILE} is not readable JSON: ${(error as Error).message}`, { cause: error });
  }
  return join(repoRoot, registryDirName(parsed));
}

/**
 * The checkout a registry directory sits in — the inverse of `resolveRegistryDir`.
 * Exact rather than a guess: `registryDirName` allows one plain segment, so the
 * registry is always exactly one level under the root.
 */
export function repoRootOf(registryDir: string): string {
  return dirname(registryDir);
}

export function typeDir(registryDir: string, type: ComponentType): string {
  return join(registryDir, typeDirName(type));
}

export function itemDir(registryDir: string, type: ComponentType, slug: string): string {
  assertSlug(slug);
  return join(typeDir(registryDir, type), slug);
}

export function itemJsonPath(registryDir: string, type: ComponentType, slug: string): string {
  return join(itemDir(registryDir, type, slug), "item.json");
}

export function typeManifestPath(registryDir: string, type: ComponentType): string {
  return join(typeDir(registryDir, type), "manifest.json");
}

export function indexManifestPath(registryDir: string): string {
  return join(registryDir, "manifest.json");
}

/** The label catalogue — an editable source file, not compile output. */
export function labelsPath(registryDir: string): string {
  return join(registryDir, "labels.json");
}
