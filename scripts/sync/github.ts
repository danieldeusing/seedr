/**
 * GitHub access for the sync and the live validator.
 *
 * One client per run holds the auth header, the rate-limit state and two caches:
 * git trees by `repo@sha` and file bytes by git blob sha (identical blobs across
 * repositories and items are fetched once).
 *
 * Failure policy (docs/registry-integrity.md §5): network errors, 5xx and 429 are retried
 * with exponential backoff, at most `maxRetries` times. 404 and an exhausted primary rate
 * limit (403 with X-RateLimit-Remaining: 0) fail immediately — retrying cannot help, and a
 * rate-limited client refuses further API calls until the limit resets instead of burning
 * through the remaining items one failure at a time.
 *
 * Authentication (checked in order):
 *   1. GITHUB_TOKEN          — PAT or fine-grained token (5,000 req/hr)
 *   2. GitHub App env vars   — generates an installation token (5,000+ req/hr)
 *        GITHUB_APP_ID
 *        GITHUB_APP_PRIVATE_KEY      (PEM string) or
 *        GITHUB_APP_PRIVATE_KEY_PATH (path to .pem file)
 *        GITHUB_APP_INSTALLATION_ID
 *   3. Unauthenticated       — 60 req/hr
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { GitTreeItem, GitTreeResponse } from "./types.js";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_RAW = "https://raw.githubusercontent.com";

export class HttpError extends Error {
  /** Server-requested wait before retrying (from a Retry-After header), when given. */
  retryAfterMs: number | null = null;

  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(url: string) {
    super(404, url, `Not found: ${url}`);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends HttpError {
  constructor(
    url: string,
    public readonly resetAt: Date | null,
  ) {
    super(
      403,
      url,
      `GitHub API rate limit exhausted${resetAt ? ` (resets at ${resetAt.toISOString()})` : ""}. Set GITHUB_TOKEN for 5,000 req/hr.`,
    );
    this.name = "RateLimitError";
  }
}

/** A request that failed for reasons that may not repeat (network, 5xx, 429) even after retries. */
export class TransientError extends Error {
  constructor(
    public readonly url: string,
    public readonly attempts: number,
    cause: unknown,
  ) {
    super(`Gave up on ${url} after ${attempts} attempt(s): ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "TransientError";
  }
}

export function isTransientError(error: unknown): boolean {
  return error instanceof TransientError || error instanceof RateLimitError;
}

export interface GitHubClientOptions {
  /** Environment to read credentials from (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  sleep?: (ms: number) => Promise<void>;
  /** Retries after the first attempt for transient failures. Default 3. */
  maxRetries?: number;
  /** First backoff delay; doubles per retry. Default 500 ms. */
  baseDelayMs?: number;
  log?: (line: string) => void;
}

const MAX_RETRY_AFTER_MS = 60_000;

function createGitHubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: appId, iat: now - 60, exp: now + 600 })).toString("base64url");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, "base64url");
  return `${header}.${payload}.${signature}`;
}

export class GitHubClient {
  private readonly env: NodeJS.ProcessEnv;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly log: (line: string) => void;

  private authorizationPromise: Promise<string | null> | null = null;
  private rateLimit: RateLimitError | null = null;
  private readonly treeCache = new Map<string, Promise<GitTreeItem[]>>();
  private readonly blobCache = new Map<string, Promise<Buffer>>();
  private readonly defaultBranchCache = new Map<string, Promise<string>>();

  readonly stats = { requests: 0, retries: 0, blobCacheHits: 0 };

  constructor(options: GitHubClientOptions = {}) {
    this.env = options.env ?? process.env;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.log = options.log ?? ((line) => console.log(line));
  }

  // ---- auth -------------------------------------------------------------------------

  private authorization(): Promise<string | null> {
    if (!this.authorizationPromise) this.authorizationPromise = this.resolveAuthorization();
    return this.authorizationPromise;
  }

  private async resolveAuthorization(): Promise<string | null> {
    if (this.env.GITHUB_TOKEN) {
      this.log("Using GITHUB_TOKEN for authentication (5,000 req/hr)");
      return `Bearer ${this.env.GITHUB_TOKEN}`;
    }
    const appId = this.env.GITHUB_APP_ID;
    const installationId = this.env.GITHUB_APP_INSTALLATION_ID;
    const privateKey =
      this.env.GITHUB_APP_PRIVATE_KEY ||
      (this.env.GITHUB_APP_PRIVATE_KEY_PATH ? readFileSync(this.env.GITHUB_APP_PRIVATE_KEY_PATH, "utf-8") : undefined);
    if (appId && privateKey && installationId) {
      const jwt = createGitHubAppJwt(appId, privateKey);
      const response = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
        method: "POST",
        headers: { "User-Agent": "seedr-sync", Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
      });
      if (!response.ok) {
        throw new HttpError(response.status, response.url, `GitHub App installation token request failed: ${response.status}`);
      }
      const data = (await response.json()) as { token: string };
      this.log("Using GitHub App installation token (5,000+ req/hr)");
      return `Bearer ${data.token}`;
    }
    this.log("No GitHub auth configured (60 req/hr). Set GITHUB_TOKEN or GITHUB_APP_* env vars for higher limits.");
    return null;
  }

  // ---- transport --------------------------------------------------------------------

  /**
   * Perform one request with the retry policy. Resolves only with a 2xx response.
   */
  async request(url: string, init: { accept?: string; method?: "GET" | "HEAD" } = {}): Promise<Response> {
    const isApi = url.startsWith(GITHUB_API);
    if (isApi && this.rateLimit && (!this.rateLimit.resetAt || this.rateLimit.resetAt.getTime() > Date.now())) {
      throw this.rateLimit;
    }
    const authorization = await this.authorization();
    const headers: Record<string, string> = { "User-Agent": "seedr-sync" };
    if (authorization) headers.Authorization = authorization;
    if (isApi) {
      headers.Accept = init.accept ?? "application/vnd.github+json";
      headers["X-GitHub-Api-Version"] = "2022-11-28";
    }

    let lastFailure: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        this.stats.retries++;
        await this.sleep(this.retryDelay(attempt, lastFailure));
      }
      this.stats.requests++;
      let response: Response;
      try {
        response = await fetch(url, { method: init.method ?? "GET", headers, redirect: "follow" });
      } catch (error) {
        lastFailure = error;
        continue;
      }
      if (response.ok) return response;

      const status = response.status;
      if (status === 404) throw new NotFoundError(url);
      if (status === 403 && isApi && response.headers.get("x-ratelimit-remaining") === "0") {
        const reset = response.headers.get("x-ratelimit-reset");
        this.rateLimit = new RateLimitError(url, reset ? new Date(Number(reset) * 1000) : null);
        throw this.rateLimit;
      }
      if (status === 429 || status >= 500 || (status === 403 && response.headers.has("retry-after"))) {
        const failure = new HttpError(status, url);
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter && /^\d+$/.test(retryAfter)) failure.retryAfterMs = Number(retryAfter) * 1000;
        lastFailure = failure;
        continue;
      }
      throw new HttpError(status, url);
    }
    throw new TransientError(url, this.maxRetries + 1, lastFailure);
  }

  private retryDelay(attempt: number, failure: unknown): number {
    const retryAfter = failure instanceof HttpError ? failure.retryAfterMs : null;
    const backoff = this.baseDelayMs * 2 ** (attempt - 1);
    return retryAfter !== null ? Math.min(Math.max(retryAfter, backoff), MAX_RETRY_AFTER_MS) : backoff;
  }

  async getJson<T>(url: string): Promise<T> {
    const response = await this.request(url);
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new Error(`Malformed JSON from ${url}: ${(error as Error).message}`, { cause: error });
    }
  }

  // ---- repository metadata ------------------------------------------------------------

  /** Commit SHA and committer date of `ref` (branch, tag or SHA). */
  async getCommit(repo: string, ref: string): Promise<{ sha: string; date: string }> {
    const data = await this.getJson<{ sha?: string; commit?: { committer?: { date?: string } } }>(
      `${GITHUB_API}/repos/${repo}/commits/${encodeURIComponent(ref)}`,
    );
    if (typeof data.sha !== "string" || !/^[0-9a-f]{40}$/.test(data.sha)) {
      throw new Error(`No commit SHA in response for ${repo}@${ref}`);
    }
    return { sha: data.sha, date: data.commit?.committer?.date ?? "" };
  }

  getDefaultBranch(repo: string): Promise<string> {
    let cached = this.defaultBranchCache.get(repo);
    if (!cached) {
      cached = this.getJson<{ default_branch?: string }>(`${GITHUB_API}/repos/${repo}`).then((data) => {
        if (typeof data.default_branch !== "string" || data.default_branch.length === 0) {
          throw new Error(`No default branch reported for ${repo}`);
        }
        return data.default_branch;
      });
      this.defaultBranchCache.set(repo, cached);
    }
    return cached;
  }

  /** The full recursive tree at a commit. Truncated trees are refused: a digest over a partial tree would be wrong. */
  getTree(repo: string, sha: string): Promise<GitTreeItem[]> {
    const key = `${repo}@${sha}`;
    let cached = this.treeCache.get(key);
    if (!cached) {
      cached = this.getJson<GitTreeResponse>(`${GITHUB_API}/repos/${repo}/git/trees/${sha}?recursive=1`).then((data) => {
        if (!Array.isArray(data.tree)) throw new Error(`Malformed tree response for ${key}`);
        if (data.truncated) throw new Error(`Git tree for ${key} is truncated by the API; refusing to sync a partial tree`);
        return data.tree;
      });
      this.treeCache.set(key, cached);
    }
    return cached;
  }

  /** Date of the last commit touching `path` at or before `sha`; null when the API lists none. */
  async getLastCommitDate(repo: string, sha: string, path: string): Promise<string | null> {
    if (path === "") return (await this.getCommit(repo, sha)).date || null;
    const query = `sha=${sha}&path=${encodeURIComponent(path)}&per_page=1`;
    const commits = await this.getJson<{ commit?: { committer?: { date?: string } } }[]>(`${GITHUB_API}/repos/${repo}/commits?${query}`);
    return commits[0]?.commit?.committer?.date ?? null;
  }

  // ---- content ----------------------------------------------------------------------

  /** Raw bytes of `path` at `sha`. With `blobSha`, identical blobs are served from the run cache. */
  getRawBytes(repo: string, sha: string, path: string, blobSha?: string): Promise<Buffer> {
    const url = `${GITHUB_RAW}/${repo}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
    if (!blobSha) return this.fetchBytes(url);
    let cached = this.blobCache.get(blobSha);
    if (cached) {
      this.stats.blobCacheHits++;
      return cached;
    }
    cached = this.fetchBytes(url);
    this.blobCache.set(blobSha, cached);
    return cached;
  }

  private async fetchBytes(url: string): Promise<Buffer> {
    const response = await this.request(url);
    return Buffer.from(await response.arrayBuffer());
  }

  async getRawText(repo: string, sha: string, path: string, blobSha?: string): Promise<string> {
    return (await this.getRawBytes(repo, sha, path, blobSha)).toString("utf-8");
  }
}
