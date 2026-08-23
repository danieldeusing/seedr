import { join } from "node:path";
import type { ComponentType } from "@seedr/shared";
import { assertSlug, typeDirName } from "./paths.js";

/** THE one implementation of where things live on disk. Every path is derived here. */

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
