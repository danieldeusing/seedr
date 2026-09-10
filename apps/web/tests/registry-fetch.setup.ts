/**
 * The app fetches its registry from /registry/ (src/lib/registry.ts). Under vitest
 * those requests are answered from the registry the app is built from — the same
 * directory vite.config.ts emits into dist — read from disk. Every other URL goes to
 * the real fetch. Lives outside src/ because the app's tsconfig has no node types.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveRegistryDir } from "../../../packages/registry-ops/src/fsPaths.js";

// vitest runs from apps/web; the repo root, and seedr.config.json, sit two levels up
const registryDir = resolveRegistryDir(resolve(process.cwd(), "../.."));
const realFetch = globalThis.fetch;

globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("/registry/")) return realFetch(input, init);
  const file = resolve(registryDir, url.slice("/registry/".length));
  if (!file.startsWith(`${registryDir}/`) || !existsSync(file)) return Promise.resolve(new Response("not found", { status: 404 }));
  return Promise.resolve(new Response(readFileSync(file, "utf-8"), { status: 200, headers: { "content-type": "application/json" } }));
};
