/*
 * Where an item's files can be fetched from, derived from its `externalUrl`.
 *
 *   github.com/<owner>/<repo>/tree/<branch>/<path>  → raw.githubusercontent.com
 *   github.com/<owner>/<repo>                       → raw.githubusercontent.com (main)
 *   local://<dir>                                   → same origin (dev samples)
 *
 * In development, first-party items (danieldeusing/seedr) read from the local
 * registry the dev server exposes, so no request leaves the machine.
 */

export interface FileSource {
  /** Host the bytes come from, shown to the visitor before anything is fetched. */
  host: string;
  /** URL of the raw file contents. */
  rawUrl: (relativePath: string) => string;
  /** Human-facing page for the file (GitHub's blob view), or null for local sources. */
  pageUrl: (relativePath: string) => string | null;
}

const GITHUB_TREE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+?))?\/?$/;
const GITHUB_REPO = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function resolveFileSource(externalUrl: string | undefined, isDev = false): FileSource | null {
  if (!externalUrl) return null;

  if (externalUrl.startsWith("local://")) {
    const base = `/${externalUrl.slice("local://".length).replace(/\/$/, "")}`;
    return {
      host: typeof window === "undefined" ? "this site" : window.location.host,
      rawUrl: (relativePath) => `${base}/${encodePath(relativePath)}`,
      pageUrl: () => null,
    };
  }

  const tree = GITHUB_TREE.exec(externalUrl);
  const repo = tree ? null : GITHUB_REPO.exec(externalUrl);
  const match = tree ?? repo;
  if (!match) return null;

  const owner = match[1]!;
  const name = match[2]!;
  const branch = tree?.[3] ?? "main";
  const basePath = tree?.[4];
  const fullPath = (relativePath: string) => (basePath ? `${basePath}/${relativePath}` : relativePath);

  if (isDev && owner === "danieldeusing" && name === "seedr" && basePath) {
    return {
      host: typeof window === "undefined" ? "this site" : window.location.host,
      rawUrl: (relativePath) => `/${encodePath(fullPath(relativePath))}`,
      pageUrl: (relativePath) => `https://github.com/${owner}/${name}/blob/${branch}/${encodePath(fullPath(relativePath))}`,
    };
  }

  return {
    host: "raw.githubusercontent.com",
    rawUrl: (relativePath) => `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${encodePath(fullPath(relativePath))}`,
    pageUrl: (relativePath) => `https://github.com/${owner}/${name}/blob/${branch}/${encodePath(fullPath(relativePath))}`,
  };
}
