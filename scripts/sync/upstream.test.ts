import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeGitHub, SHA_A, SHA_B, SHA_C, SHA_D, gitBlobSha } from "../test/fake-github.js";
import { officialMarketplace } from "../test/sync-world.js";
import { GitHubClient } from "./github.js";
import type { ManifestItem } from "./types.js";
import { checkUpstream } from "./upstream.js";
import { computeLegacyContentHash } from "./utils.js";

/** The hash the sync records for an item whose files are exactly these. */
const hashOf = (files: Record<string, string>): string =>
  computeLegacyContentHash(Object.entries(files).map(([path, text]) => ({ path, blobSha: gitBlobSha(Buffer.from(text)), size: text.length })))!;

const item = (fields: Partial<ManifestItem> & Pick<ManifestItem, "type" | "slug" | "sourceType">): ManifestItem =>
  ({ name: fields.slug, description: "d", compatibility: ["claude"], ...fields }) as ManifestItem;

const OFFICIAL = { name: "claude-plugins-official", url: "https://github.com/anthropics/claude-plugins-official.git", sha: SHA_B };

function world() {
  const fake = new FakeGitHub({
    "anthropics/skills": { branches: { main: SHA_A }, commits: { [SHA_A]: { files: { "skills/pdf/SKILL.md": "v1", "skills/docx/SKILL.md": "d2" }, date: "2026-03-04T05:06:07Z" } } },
    "anthropics/claude-plugins-official": {
      branches: { main: SHA_B },
      commits: {
        [SHA_B]: {
          files: {
            ".claude-plugin/marketplace.json": officialMarketplace({
              plugins: [
                { name: "foo", source: "./plugins/foo" },
                { name: "bar", source: { source: "url", url: "https://github.com/o/bar.git", sha: SHA_C } },
              ],
            }),
            "plugins/foo/x.md": "x1",
          },
        },
      },
    },
    "o/bar": { branches: { main: SHA_D }, commits: { [SHA_C]: { files: { "README.md": "bar" } }, [SHA_D]: { files: { "README.md": "bar moved on" } } } },
    "o/solo": { branches: { main: SHA_D }, commits: { [SHA_D]: { files: { "skills/x/SKILL.md": "s1" } } } },
    "o/mp": {
      branches: { main: SHA_A },
      commits: {
        [SHA_A]: {
          files: {
            ".claude-plugin/marketplace.json": JSON.stringify({ name: "mp", plugins: [{ name: "impec", source: "./plugin" }] }),
            "plugin/.claude-plugin/plugin.json": "{}",
            "plugin/skills/a/SKILL.md": "a",
          },
        },
      },
    },
  });
  vi.stubGlobal("fetch", fake.fetch);
  return { fake, client: new GitHubClient({ env: {}, log: () => {}, sleep: async () => {} }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("checkUpstream", () => {
  it("hashes the tree the way contentHash was recorded, and names when a behind item changed", async () => {
    const { client } = world();
    const result = await checkUpstream(client, [
      item({ type: "skill", slug: "pdf", sourceType: "official", contentHash: hashOf({ "SKILL.md": "v1" }) }),
      item({ type: "skill", slug: "docx", sourceType: "official", contentHash: hashOf({ "SKILL.md": "d1" }) }),
    ]);
    expect(result).toEqual([
      { type: "skill", slug: "pdf", state: "current", upstream: { repo: "anthropics/skills", sha: SHA_A, path: "skills/pdf" } },
      { type: "skill", slug: "docx", state: "behind", upstream: { repo: "anthropics/skills", sha: SHA_A, path: "skills/docx" }, upstreamUpdatedAt: "2026-03-04T05:06:07Z" },
    ]);
  });

  it("follows the official marketplace's pin for its plugins, even when the third-party repository moved on", async () => {
    const { client } = world();
    const [foo, bar, gone] = await checkUpstream(client, [
      item({ type: "plugin", slug: "foo", sourceType: "official", marketplaceRef: OFFICIAL, contentHash: hashOf({ "x.md": "x1" }) }),
      item({ type: "plugin", slug: "bar", sourceType: "community", marketplace: "claude-plugins-official", contentHash: hashOf({ "README.md": "bar" }) }),
      item({ type: "plugin", slug: "vanished", sourceType: "official", marketplaceRef: OFFICIAL, contentHash: "0".repeat(16) }),
    ]);
    expect(foo).toMatchObject({ state: "current", upstream: { repo: "anthropics/claude-plugins-official", sha: SHA_B, path: "plugins/foo" } });
    expect(bar).toMatchObject({ state: "current", upstream: { repo: "o/bar", sha: SHA_C, path: "" } });
    expect(gone).toEqual({ type: "plugin", slug: "vanished", state: "unknown", reason: "no longer listed in claude-plugins-official" });
  });

  it("reads a community item at its repository's head, through the repository's own marketplace when it has one", async () => {
    const { client } = world();
    const [solo, impec] = await checkUpstream(client, [
      item({ type: "skill", slug: "x", sourceType: "community", externalUrl: `https://github.com/o/solo/tree/${SHA_A}/skills/x`, contentHash: hashOf({ "SKILL.md": "s1" }) }),
      item({ type: "plugin", slug: "impec", sourceType: "community", externalUrl: `https://github.com/o/mp/tree/${SHA_A}/plugin`, contentHash: hashOf({ ".claude-plugin/plugin.json": "{}", "skills/a/SKILL.md": "a" }) }),
    ]);
    expect(solo).toMatchObject({ state: "current", upstream: { repo: "o/solo", sha: SHA_D, path: "skills/x" } });
    expect(impec).toMatchObject({ state: "current", upstream: { repo: "o/mp", sha: SHA_A, path: "plugin" } });
  });

  it("falls back to the commit for an item that has no content hash yet, and says so", async () => {
    const { client } = world();
    const url = `https://github.com/o/solo/tree/${SHA_A}/skills/x`;
    const [stale, fresh] = await checkUpstream(client, [
      item({ type: "skill", slug: "x", sourceType: "community", externalUrl: url, sourceRevision: SHA_A }),
      item({ type: "skill", slug: "x", sourceType: "community", externalUrl: url, sourceRevision: SHA_D }),
    ]);
    expect(stale).toMatchObject({ state: "behind", reason: expect.stringContaining("compared by commit") });
    expect(fresh).toMatchObject({ state: "current", reason: expect.stringContaining("compared by commit") });
  });

  it("leaves first-party items out, and explains an item it cannot check", async () => {
    const { client, fake } = world();
    fake.fail({ match: "repos/o/solo", status: 503, times: Infinity });
    const result = await checkUpstream(client, [
      item({ type: "skill", slug: "mine", sourceType: "seedr" }),
      item({ type: "hook", slug: "loose", sourceType: "community" }),
      item({ type: "skill", slug: "x", sourceType: "community", externalUrl: `https://github.com/o/solo/tree/${SHA_A}/skills/x`, contentHash: "0".repeat(16) }),
    ]);
    expect(result.map((entry) => entry.slug)).toEqual(["loose", "x"]);
    expect(result[0]).toMatchObject({ state: "unknown", reason: "no externalUrl to check against" });
    expect(result[1]).toMatchObject({ state: "unknown", reason: expect.stringMatching(/503|o\/solo/) });
  });
});
