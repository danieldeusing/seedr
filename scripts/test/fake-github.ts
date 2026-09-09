/**
 * An in-memory GitHub for tests: serves the handful of REST endpoints and the raw host
 * the sync uses, from repositories described as plain file maps. Tests install it with
 * `vi.stubGlobal("fetch", fake.fetch)` and inject failures per URL.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { typeDirName } from "@seedr/registry-ops";
import type { GitTreeItem, ManifestItem } from "../sync/types.js";

export type FakeFile = string | Buffer | { symlink: string };

export interface FakeCommit {
  files: Record<string, FakeFile>;
  date?: string;
}

export interface FakeRepo {
  defaultBranch?: string;
  branches: Record<string, string>;
  commits: Record<string, FakeCommit>;
}

export interface InjectedFailure {
  match: string | RegExp;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  /** Throw a network error instead of answering. */
  network?: boolean;
  /** How many matching requests fail; Infinity for all of them. */
  times: number;
}

export const SHA_A = "a".repeat(40);
export const SHA_B = "b".repeat(40);
export const SHA_C = "c".repeat(40);
export const SHA_D = "d".repeat(40);

export function gitBlobSha(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function toBytes(file: FakeFile): Buffer {
  if (Buffer.isBuffer(file)) return file;
  if (typeof file === "string") return Buffer.from(file, "utf-8");
  return Buffer.from(file.symlink, "utf-8");
}

function buildTree(commit: FakeCommit): GitTreeItem[] {
  const entries: GitTreeItem[] = [];
  const dirs = new Set<string>();
  for (const path of Object.keys(commit.files)) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  for (const dir of [...dirs].sort()) {
    entries.push({ path: dir, mode: "040000", type: "tree", sha: createHash("sha1").update(dir).digest("hex") });
  }
  for (const [path, file] of Object.entries(commit.files).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const bytes = toBytes(file);
    const isSymlink = typeof file === "object" && !Buffer.isBuffer(file);
    entries.push({ path, mode: isSymlink ? "120000" : "100644", type: "blob", sha: gitBlobSha(bytes), size: bytes.length });
  }
  return entries;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const TAR_BLOCK = 512;

function tarHeader(name: string, size: number, type: string): Buffer {
  const header = Buffer.alloc(TAR_BLOCK);
  header.write(name, 0, 100, "utf-8");
  header.write("0000644\0", 100, "ascii");
  header.write("0000000\0", 108, "ascii");
  header.write("0000000\0", 116, "ascii");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  header.write("00000000000\0", 136, "ascii");
  header.write("        ", 148, "ascii");
  header.write(type, 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return header;
}

function tarEntry(name: string, data: Buffer, type: string): Buffer[] {
  const padding = Buffer.alloc((TAR_BLOCK - (data.length % TAR_BLOCK)) % TAR_BLOCK);
  return [tarHeader(name, data.length, type), data, padding];
}

/** `<length> key=value\n`, the length counting itself. */
function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 1;
  while (Buffer.byteLength(`${length}${body}`) !== length) length = Buffer.byteLength(`${length}${body}`);
  return Buffer.from(`${length}${body}`, "utf-8");
}

/**
 * A tar the way `git archive` writes one: a pax global header, every path under `prefix/`,
 * a pax extended header before any name longer than the ustar field, symlinks as links.
 */
export function writeTar(files: Record<string, FakeFile>, prefix: string): Buffer {
  const blocks: Buffer[] = tarEntry("pax_global_header", paxRecord("comment", "0".repeat(40)), "g");
  for (const [path, file] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const name = `${prefix}/${path}`;
    if (name.length > 100) blocks.push(...tarEntry(`${prefix}/PaxHeaders/${path.slice(-40)}`, paxRecord("path", name), "x"));
    const isSymlink = typeof file === "object" && !Buffer.isBuffer(file);
    blocks.push(...tarEntry(name.slice(0, 100), isSymlink ? Buffer.alloc(0) : toBytes(file), isSymlink ? "2" : "0"));
  }
  blocks.push(Buffer.alloc(TAR_BLOCK * 2));
  return Buffer.concat(blocks);
}

export class FakeGitHub {
  readonly requests: string[] = [];
  private readonly failures: InjectedFailure[] = [];

  constructor(readonly repos: Record<string, FakeRepo>) {}

  fail(failure: Omit<InjectedFailure, "times"> & { times?: number }): void {
    this.failures.push({ times: 1, ...failure });
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    this.requests.push(`${init?.method ?? "GET"} ${url}`);

    const failure = this.failures.find((f) => f.times > 0 && (typeof f.match === "string" ? url.includes(f.match) : f.match.test(url)));
    if (failure) {
      failure.times--;
      if (failure.network) throw new TypeError("fetch failed");
      return new Response(failure.body ?? "", { status: failure.status ?? 500, headers: failure.headers ?? {} });
    }

    const api = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)(?:\/(.*))?$/.exec(url);
    if (api) return this.handleApi(api[1]!, api[2] ?? "");
    const raw = /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)\/(.*)$/.exec(url);
    if (raw) return this.handleRaw(raw[1]!, raw[2]!, raw[3]!);
    return new Response("unknown route", { status: 404 });
  };

  private handleApi(repoName: string, rest: string): Response {
    const repo = this.repos[repoName];
    if (!repo) return json({ message: "Not Found" }, 404);
    const [route, query = ""] = rest.split("?") as [string, string?];
    const params = new URLSearchParams(query);

    if (route === "") return json({ full_name: repoName, default_branch: repo.defaultBranch ?? "main" });

    const commitsRef = /^commits\/(.+)$/.exec(route);
    if (commitsRef) {
      const ref = decodeURIComponent(commitsRef[1]!);
      const sha = repo.branches[ref] ?? (repo.commits[ref] ? ref : null);
      if (!sha) return json({ message: "No commit found for SHA: " + ref }, 422);
      return json({ sha, commit: { committer: { date: repo.commits[sha]!.date ?? "2026-01-01T00:00:00Z" } } });
    }

    if (route === "commits") {
      const sha = params.get("sha") ?? repo.branches[repo.defaultBranch ?? "main"]!;
      const commit = repo.commits[sha];
      if (!commit) return json([], 200);
      const path = params.get("path");
      if (path && !Object.keys(commit.files).some((file) => file === path || file.startsWith(path + "/"))) return json([], 200);
      return json([{ sha, commit: { committer: { date: commit.date ?? "2026-01-01T00:00:00Z" } } }]);
    }

    const tree = /^git\/trees\/([^/]+)$/.exec(route);
    if (tree) {
      const commit = repo.commits[tree[1]!];
      if (!commit) return json({ message: "Not Found" }, 404);
      return json({ sha: tree[1], tree: buildTree(commit), truncated: false });
    }

    const tarball = /^tarball\/([^/]+)$/.exec(route);
    if (tarball) {
      const commit = repo.commits[tarball[1]!];
      if (!commit) return json({ message: "Not Found" }, 404);
      const [owner, name] = repoName.split("/");
      return new Response(gzipSync(writeTar(commit.files, `${owner}-${name}-${tarball[1]!.slice(0, 7)}`)), { status: 200 });
    }

    return json({ message: "Not Found" }, 404);
  }

  private handleRaw(repoName: string, sha: string, path: string): Response {
    const commit = this.repos[repoName]?.commits[sha];
    const decoded = path.split("/").map(decodeURIComponent).join("/");
    const file = commit?.files[decoded];
    if (file === undefined) return new Response("404: Not Found", { status: 404 });
    return new Response(toBytes(file), { status: 200 });
  }
}

// ---- registry fixtures -----------------------------------------------------------------

export function writeItem(registryDir: string, item: ManifestItem, files: Record<string, string> = {}): string {
  const dir = join(registryDir, typeDirName(item.type), item.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "item.json"), JSON.stringify(item, null, 2) + "\n");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

export function emptyRegistry(registryDir: string): void {
  for (const type of ["skills", "plugins", "hooks", "agents", "mcp", "settings", "commands"]) {
    mkdirSync(join(registryDir, type), { recursive: true });
  }
}
