/*
 * Where an item's files can be fetched from.
 *
 *   sourceType "seedr"                              → this site's own /registry/<type>/<slug>/
 *   github.com/<owner>/<repo>/tree/<branch>/<path>  → raw.githubusercontent.com
 *   github.com/<owner>/<repo>                       → raw.githubusercontent.com (main)
 *   local://<dir>                                   → same origin (dev samples)
 *
 * A first-party item is served locally regardless of what its `externalUrl`
 * names or looks like: that field is attribution, not a fetch address. Reading
 * it as one is a live bug, not a hypothetical — a first-party PLUGIN's
 * `externalUrl` is its own repository, which need not be `danieldeusing/seedr`
 * and need not be public, and raw.githubusercontent.com 404s a private repo
 * exactly like a missing file, indistinguishably. The local route is also what
 * makes a first-party item's preview work with no network dependency at all,
 * dev and production alike — vite.config.ts emits the same tree at build time.
 */

import { typeDirName } from "@seedr/registry-ops/pure";
import type { ComponentType } from "./types";

export interface FileSource {
  /** Host the bytes come from, shown to the visitor before anything is fetched. */
  host: string;
  /** URL of the raw file contents. */
  rawUrl: (relativePath: string) => string;
  /** Human-facing page for the file (GitHub's blob view), or null for local sources. */
  pageUrl: (relativePath: string) => string | null;
}

/** The fields resolveFileSource needs off a RegistryItem — kept narrow so a test fixture stays small. */
export interface FileSourceItem {
  sourceType?: string;
  type: ComponentType;
  slug: string;
  externalUrl?: string;
}

const GITHUB_TREE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+?))?\/?$/;
const GITHUB_REPO = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

interface GithubLocation {
  owner: string;
  name: string;
  branch: string;
  basePath?: string;
}

function parseGithubUrl(externalUrl: string): GithubLocation | null {
  const tree = GITHUB_TREE.exec(externalUrl);
  const match = tree ?? GITHUB_REPO.exec(externalUrl);
  if (!match) return null;
  return { owner: match[1]!, name: match[2]!, branch: tree?.[3] ?? "main", basePath: tree?.[4] };
}

function fullPathOf(location: GithubLocation, relativePath: string): string {
  return location.basePath ? `${location.basePath}/${relativePath}` : relativePath;
}

const HERE = () => (typeof window === "undefined" ? "this site" : window.location.host);

export function resolveFileSource(item: FileSourceItem): FileSource | null {
  const github = item.externalUrl ? parseGithubUrl(item.externalUrl) : null;
  const pageUrl = github
    ? (relativePath: string) => `https://github.com/${github.owner}/${github.name}/blob/${github.branch}/${encodePath(fullPathOf(github, relativePath))}`
    : () => null;

  if (item.sourceType === "seedr") {
    const base = `/registry/${typeDirName(item.type)}/${item.slug}`;
    return { host: HERE(), rawUrl: (relativePath) => `${base}/${encodePath(relativePath)}`, pageUrl };
  }

  if (!item.externalUrl) return null;

  if (item.externalUrl.startsWith("local://")) {
    const base = `/${item.externalUrl.slice("local://".length).replace(/\/$/, "")}`;
    return { host: HERE(), rawUrl: (relativePath) => `${base}/${encodePath(relativePath)}`, pageUrl: () => null };
  }

  if (!github) return null;
  return {
    host: "raw.githubusercontent.com",
    rawUrl: (relativePath) => `https://raw.githubusercontent.com/${github.owner}/${github.name}/${github.branch}/${encodePath(fullPathOf(github, relativePath))}`,
    pageUrl,
  };
}
