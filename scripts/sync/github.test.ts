import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGitHub, SHA_A, gitBlobSha } from "../test/fake-github.js";
import { GitHubClient, HttpError, NotFoundError, RateLimitError, TransientError, isTransientError } from "./github.js";

const REPO = "acme/widgets";

function makeFake(): FakeGitHub {
  return new FakeGitHub({
    [REPO]: {
      branches: { main: SHA_A },
      commits: { [SHA_A]: { date: "2026-02-03T04:05:06Z", files: { "README.md": "hello\n", "docs/a b.md": "spaced\n", LICENSE: "MIT License\n" } } },
    },
  });
}

describe("GitHubClient", () => {
  let fake: FakeGitHub;
  let sleeps: number[];
  let client: GitHubClient;

  beforeEach(() => {
    fake = makeFake();
    sleeps = [];
    vi.stubGlobal("fetch", fake.fetch);
    client = new GitHubClient({ env: { GITHUB_TOKEN: "t0ken" }, sleep: async (ms) => void sleeps.push(ms), log: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("resolves branch heads, default branches, trees and raw bytes at a sha", async () => {
    expect(await client.getCommit(REPO, "main")).toEqual({ sha: SHA_A, date: "2026-02-03T04:05:06Z" });
    expect(await client.getDefaultBranch(REPO)).toBe("main");
    const tree = await client.getTree(REPO, SHA_A);
    expect(tree.map((e) => `${e.type}:${e.path}`)).toEqual(["tree:docs", "blob:LICENSE", "blob:README.md", "blob:docs/a b.md"]);
    expect((await client.getRawBytes(REPO, SHA_A, "docs/a b.md")).toString()).toBe("spaced\n");
    expect(fake.requests.at(-1)).toBe(`GET https://raw.githubusercontent.com/${REPO}/${SHA_A}/docs/a%20b.md`);
  });

  it("sends the token and the API version header on API calls only", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return fake.fetch(url, init);
    });
    await client.getCommit(REPO, "main");
    await client.getRawBytes(REPO, SHA_A, "README.md");
    expect(seen[0]!.headers).toMatchObject({ Authorization: "Bearer t0ken", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
    expect(seen[1]!.headers).toMatchObject({ Authorization: "Bearer t0ken" });
    expect(seen[1]!.headers.Accept).toBeUndefined();
  });

  it("caches trees per repo@sha and bytes per blob sha", async () => {
    await client.getTree(REPO, SHA_A);
    await client.getTree(REPO, SHA_A);
    const blob = gitBlobSha(Buffer.from("hello\n"));
    await client.getRawBytes(REPO, SHA_A, "README.md", blob);
    await client.getRawBytes("other/repo-with-same-blob", SHA_A, "any/path.md", blob);
    expect(fake.requests.filter((r) => r.includes("git/trees"))).toHaveLength(1);
    expect(fake.requests.filter((r) => r.includes("raw.githubusercontent"))).toHaveLength(1);
    expect(client.stats.blobCacheHits).toBe(1);
  });

  it("retries 5xx, 429 and network errors with exponential backoff, then succeeds", async () => {
    fake.fail({ match: "commits/main", status: 503 });
    fake.fail({ match: "commits/main", network: true });
    fake.fail({ match: "commits/main", status: 429, headers: { "retry-after": "2" } });
    expect(await client.getCommit(REPO, "main")).toMatchObject({ sha: SHA_A });
    expect(sleeps).toEqual([500, 1000, 2000]);
    expect(client.stats.retries).toBe(3);
  });

  it("gives up after three retries with a TransientError", async () => {
    fake.fail({ match: "commits/main", status: 502, times: Infinity });
    const error = await client.getCommit(REPO, "main").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as TransientError).attempts).toBe(4);
    expect(isTransientError(error)).toBe(true);
    expect(fake.requests.filter((r) => r.includes("commits/main"))).toHaveLength(4);
  });

  it("fails 404 immediately without retrying", async () => {
    const error = await client.getRawBytes(REPO, SHA_A, "missing.md").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(sleeps).toEqual([]);
    expect(fake.requests).toHaveLength(1);
  });

  it("treats an exhausted rate limit as fatal and refuses further API calls until it resets", async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 1800);
    fake.fail({ match: "commits/main", status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset }, body: "rate limited" });
    const first = await client.getCommit(REPO, "main").catch((e: unknown) => e);
    expect(first).toBeInstanceOf(RateLimitError);
    expect((first as RateLimitError).message).toMatch(/rate limit exhausted.*Set GITHUB_TOKEN/);
    const second = await client.getDefaultBranch(REPO).catch((e: unknown) => e);
    expect(second).toBe(first);
    expect(fake.requests.filter((r) => r.includes("api.github.com"))).toHaveLength(1);
    // raw.githubusercontent.com is not subject to the API limit
    expect((await client.getRawBytes(REPO, SHA_A, "README.md")).toString()).toBe("hello\n");
  });

  it("does not retry other 4xx responses", async () => {
    fake.fail({ match: "commits/main", status: 401 });
    const error = await client.getCommit(REPO, "main").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(401);
    expect(isTransientError(error)).toBe(false);
    expect(sleeps).toEqual([]);
  });

  it("refuses truncated trees and malformed JSON", async () => {
    fake.fail({ match: "git/trees", status: 200, body: JSON.stringify({ sha: SHA_A, tree: [], truncated: true }) });
    await expect(client.getTree(REPO, SHA_A)).rejects.toThrow(/truncated/);
    fake.fail({ match: "commits/main", status: 200, body: "<html>" });
    await expect(client.getCommit(REPO, "main")).rejects.toThrow(/Malformed JSON/);
  });

  it("reads the last commit date for a path, and the commit date for the root", async () => {
    expect(await client.getLastCommitDate(REPO, SHA_A, "docs")).toBe("2026-02-03T04:05:06Z");
    expect(await client.getLastCommitDate(REPO, SHA_A, "nope")).toBeNull();
    expect(await client.getLastCommitDate(REPO, SHA_A, "")).toBe("2026-02-03T04:05:06Z");
  });
});
