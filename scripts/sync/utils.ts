/**
 * Pure helpers shared by the sync sources: git-tree shaping, plugin classification,
 * frontmatter parsing, repository URL parsing and a bounded-concurrency map.
 * Nothing here touches the network — see github.ts for that.
 */

import { createHash } from "node:crypto";
import type { FileTreeNode, GitTreeItem, ParsedPluginContents } from "./types.js";

/** Regular files only: symlinks (120000) and submodules (160000) carry no installable bytes. */
const REGULAR_FILE_MODES = new Set(["100644", "100755"]);

export interface TreeFile {
  /** Path relative to the item directory. */
  path: string;
  blobSha: string;
  size: number;
}

/**
 * The regular files of `prefix` ("" for the repository root) at full depth. Entries under a
 * `.git` segment are skipped; symlinks and submodules are returned separately so the caller
 * can report them instead of silently dropping them.
 */
export function listTreeFiles(tree: readonly GitTreeItem[], prefix: string): { files: TreeFile[]; skipped: string[] } {
  const normalized = prefix === "" ? "" : prefix.replace(/\/+$/, "") + "/";
  const files: TreeFile[] = [];
  const skipped: string[] = [];
  for (const item of tree) {
    if (normalized && !item.path.startsWith(normalized)) continue;
    const relativePath = item.path.slice(normalized.length);
    if (relativePath === "") continue;
    if (relativePath.split("/").includes(".git")) continue;
    if (item.type === "blob" && REGULAR_FILE_MODES.has(item.mode)) {
      files.push({ path: relativePath, blobSha: item.sha, size: item.size ?? 0 });
    } else if (item.type === "blob" || item.type === "commit") {
      skipped.push(`${relativePath} (mode ${item.mode})`);
    }
  }
  return { files, skipped };
}

/** True when `prefix` exists as a directory in the tree (or is the root). */
export function treeHasDirectory(tree: readonly GitTreeItem[], prefix: string): boolean {
  if (prefix === "") return true;
  const clean = prefix.replace(/\/+$/, "");
  return tree.some((item) => item.type === "tree" && item.path === clean);
}

/** Immediate child directory names under `path`, sorted. */
export function listDirectoryFromTree(tree: readonly GitTreeItem[], path: string): string[] {
  const prefix = path.endsWith("/") ? path : path + "/";
  const dirs = new Set<string>();
  for (const item of tree) {
    if (item.type !== "tree" || !item.path.startsWith(prefix)) continue;
    const relative = item.path.slice(prefix.length);
    if (relative && !relative.includes("/")) dirs.add(relative);
  }
  return [...dirs].sort();
}

/** Deterministic display order: directories first, then by name in the `en` locale. */
function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
  return a.name.localeCompare(b.name, "en");
}

/** Nest flat file paths into the `contents.files` tree shape. Directories are implied by their files. */
export function buildFileTree(paths: readonly string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  for (const path of paths) {
    const parts = path.split("/");
    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const isFile = i === parts.length - 1;
      let node = level.find((candidate) => candidate.name === name);
      if (!node) {
        node = isFile ? { name, type: "file" } : { name, type: "directory", children: [] };
        level.push(node);
      }
      if (!isFile) {
        node.children ??= [];
        level = node.children;
      }
    }
  }
  const sortLevel = (nodes: FileTreeNode[]): void => {
    nodes.sort(compareNodes);
    for (const node of nodes) if (node.children) sortLevel(node.children);
  };
  sortLevel(root);
  return root;
}

/**
 * Legacy 16-hex content hash over "path:blobSha" pairs. Kept so older manifest consumers
 * see a stable field; `contentDigest` is the integrity value.
 */
export function computeLegacyContentHash(files: readonly TreeFile[]): string | null {
  if (files.length === 0) return null;
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256");
  for (const file of sorted) hash.update(`${file.path}:${file.blobSha}\n`);
  return hash.digest("hex").slice(0, 16);
}

export function formatName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Read scalar fields from a YAML frontmatter block. Handles `key: value`, quoted values,
 * block scalars (`|`, `>`) and plain scalars continued on indented lines, which is all
 * SKILL.md files use. Returns null without frontmatter.
 */
export function parseFrontmatter(markdown: string): Record<string, string> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) return null;
  const lines = match[1]!.split(/\r?\n/);
  const fields: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const field = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (!field) continue;
    const key = field[1]!;
    let value = field[2]!.trim();
    const isBlockScalar = value === "|" || value === ">" || value === "|-" || value === ">-";
    const continuation: string[] = [];
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]!) || (isBlockScalar && lines[i + 1] === ""))) {
      continuation.push(lines[i + 1]!.trim());
      i++;
    }
    if (isBlockScalar) {
      value = continuation.join(value.startsWith(">") ? " " : "\n").trim();
    } else if (continuation.length > 0) {
      // plain scalar continued on indented lines: YAML folds the line breaks into spaces
      value = [value, ...continuation].filter((part) => part.length > 0).join(" ");
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

export interface GitHubRepoRef {
  /** "owner/repo" */
  repo: string;
  /** Canonical clone URL. */
  cloneUrl: string;
}

/** Accepts https://github.com/o/r(.git)(/…), http, and git@github.com:o/r.git forms. */
export function parseGitHubRepoUrl(url: string): GitHubRepoRef | null {
  const match = /^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/.exec(url.trim());
  if (!match) return null;
  const repo = `${match[1]}/${match[2]}`;
  return { repo, cloneUrl: `https://github.com/${repo}.git` };
}

/** Splits `https://github.com/o/r/tree/<ref>/<path>` into repo, ref and path. */
export function parseGitHubTreeUrl(url: string): { repo: string; ref: string | null; path: string } | null {
  const base = parseGitHubRepoUrl(url);
  if (!base) return null;
  const tree = /github\.com\/[^/]+\/[^/]+\/tree\/([^/]+)\/?(.*)$/.exec(url.trim());
  if (!tree) return { repo: base.repo, ref: null, path: "" };
  return { repo: base.repo, ref: tree[1]!, path: tree[2]!.replace(/\/+$/, "") };
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. Errors propagate. */
export async function mapConcurrent<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Parse plugin contents from file tree.
 * Plugins can have their content in:
 * - Root-level directories (skills/, agents/, hooks/, commands/)
 * - Or under .claude/ directory
 */
export function parsePluginContents(files: FileTreeNode[]): ParsedPluginContents {
  const contents: ParsedPluginContents = { files };

  const extractMdItems = (dir: FileTreeNode | undefined): string[] => {
    if (!dir?.children) return [];
    // Match .md files (e.g. commands/foo.md) or directories (e.g. skills/foo/SKILL.md)
    const mdFiles = dir.children
      .filter((f) => f.type === "file" && f.name.endsWith(".md"))
      .map((f) => f.name.replace(/\.md$/, ""));
    const dirs = dir.children.filter((f) => f.type === "directory").map((f) => f.name);
    return mdFiles.length > 0 ? mdFiles : dirs;
  };

  // Hooks are counted by trigger keys in hooks.json, not by file count.
  // This just detects presence — the sync replaces it with the actual trigger names.
  const detectHooks = (dir: FileTreeNode | undefined): boolean => {
    if (!dir?.children) return false;
    return dir.children.some((f) => f.type === "file" && f.name === "hooks.json");
  };

  const extractMcpItems = (dir: FileTreeNode | undefined): string[] => {
    if (!dir?.children) return [];
    return dir.children.map((f) => f.name.replace(/\.[^.]+$/, ""));
  };

  const processDir = (dir: FileTreeNode, merge: boolean) => {
    switch (dir.name) {
      case "skills": {
        const items = extractMdItems(dir);
        if (items.length > 0) contents.skills = merge ? contents.skills || items : items;
        break;
      }
      case "agents": {
        const items = extractMdItems(dir);
        if (items.length > 0) contents.agents = merge ? contents.agents || items : items;
        break;
      }
      case "commands": {
        const items = extractMdItems(dir);
        if (items.length > 0) contents.commands = merge ? contents.commands || items : items;
        break;
      }
      case "hooks": {
        if (detectHooks(dir) && !contents.hooks) contents.hooks = ["hooks.json"];
        break;
      }
      case "mcp-servers": {
        const items = extractMcpItems(dir);
        if (items.length > 0) contents.mcpServers = merge ? contents.mcpServers || items : items;
        break;
      }
    }
  };

  for (const dir of files.filter((f) => f.type === "directory")) {
    processDir(dir, false);
  }

  // Detect .mcp.json at root level (most MCP plugins use this pattern)
  if (files.some((f) => f.type === "file" && f.name === ".mcp.json")) {
    contents.mcpServers = [".mcp.json"];
  }

  const claudeDir = files.find((f) => f.name === ".claude" && f.type === "directory");
  if (claudeDir?.children) {
    for (const subdir of claudeDir.children.filter((f) => f.type === "directory")) {
      processDir(subdir, true);
    }
  }

  return contents;
}

export interface PluginJson {
  name?: string;
  description?: string;
  version?: string;
  author?: { name?: string; email?: string; url?: string };
  homepage?: string;
  keywords?: string[];
  license?: string;
  /** Inline server map, a path to an .mcp.json inside the plugin, or a list of such paths. */
  mcpServers?: Record<string, unknown> | string | string[];
}
