import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubClient } from "./sync/github.js";
import { runSync } from "./sync.js";
import { SHA_B } from "./test/fake-github.js";
import { makeWorld, type World } from "./test/sync-world.js";
import { locateContent, pickSample, validateLive } from "./validate-live.js";

describe("validateLive", () => {
  let world: World;
  let logLines: string[];

  const client = (): GitHubClient => new GitHubClient({ env: {}, sleep: async () => {}, log: (line) => logLines.push(line) });
  const live = (options: { all?: boolean; sample?: number; only?: string[] } = {}) =>
    validateLive({ registryDir: world.registryDir, client: client(), log: (line) => logLines.push(line), ...options });

  beforeEach(async () => {
    world = makeWorld();
    logLines = [];
    vi.stubGlobal("fetch", world.fake.fetch);
    const outcome = await runSync({ registryDir: world.registryDir, client: client(), log: () => {} });
    expect(outcome.ok).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(world.registryDir, { recursive: true, force: true });
  });

  it("passes for a freshly synced registry and verifies every digest with --all", async () => {
    const report = await live({ all: true });
    expect(report.failures).toEqual([]);
    expect(report.checked).toBe(13);
    expect(report.digestsVerified).toBe(13);
  });

  it("samples digests deterministically and always verifies toolr items from disk", async () => {
    const report = await live({ sample: 2 });
    expect(report.failures).toEqual([]);
    expect(report.digestsVerified).toBe(3);
    expect(pickSample(["a", "b", "c", "d", "e", "f"], 2)).toEqual(new Set(["a", "d"]));
    expect(pickSample(["a", "b"], 5)).toEqual(new Set(["a", "b"]));
    expect(pickSample([], 5)).toEqual(new Set());
  });

  it("reports a tampered digest and a vanished upstream file as deterministic failures", async () => {
    const path = join(world.registryDir, "plugins", "code-review", "item.json");
    const item = JSON.parse(readFileSync(path, "utf-8")) as { contentDigest: string };
    item.contentDigest = "0".repeat(64);
    writeFileSync(path, JSON.stringify(item, null, 2) + "\n");
    delete world.fake.repos["anthropics/claude-plugins-official"]!.commits[SHA_B]!.files["plugins/new-one/skills/one/SKILL.md"];

    const report = await live({ all: true });
    expect(report.failures).toEqual([
      { key: "plugin/code-review", message: expect.stringMatching(/digest mismatch: manifest 0{64}, upstream [0-9a-f]{64}/), transient: false },
      { key: "plugin/new-one", message: expect.stringMatching(/1 declared file\(s\) missing at .*: skills\/one\/SKILL.md/), transient: false },
    ]);
  });

  it("reports undeclared upstream files, a strict plugin without plugin.json, and a renamed marketplace", async () => {
    const official = world.fake.repos["anthropics/claude-plugins-official"]!.commits[SHA_B]!;
    official.files["plugins/code-review/extra.md"] = "surprise\n";
    official.files[".claude-plugin/marketplace.json"] = official.files[".claude-plugin/marketplace.json"]!.toString().replace("claude-plugins-official", "renamed-marketplace");
    const report = await live({ only: ["plugin/code-review", "plugin/asana"] });
    expect(report.failures.map((f) => f.key)).toEqual(["plugin/asana", "plugin/code-review"]);
    expect(report.failures[1]!.message).toMatch(/1 file\(s\) at .* are not declared in contents.files: extra.md/);
    expect(report.failures[0]!.message).toMatch(/marketplace at .* is named "renamed-marketplace", item records "claude-plugins-official"/);
  });

  it("marks network failures as transient after the retries are exhausted", async () => {
    world.fake.fail({ match: "api.github.com/repos/stripe/ai/git/trees", status: 502, times: Infinity });
    const report = await live({ only: ["plugin/stripe"], sample: 0 });
    expect(report.failures).toEqual([{ key: "plugin/stripe", message: expect.stringMatching(/Gave up on .* after 4 attempt/), transient: true }]);
  });

  it("fails toolr items whose disk content no longer matches the compiled digest", async () => {
    writeFileSync(join(world.registryDir, "hooks", "agentwatch", "agentwatch.sh"), "#!/bin/sh\necho changed\n");
    // compile has not run since the edit, so the manifest digest is stale — but readAllItems recomputes it
    // from disk; the mismatch surfaces when the declared tree no longer matches the directory
    writeFileSync(join(world.registryDir, "hooks", "agentwatch", "extra.sh"), "#!/bin/sh\n");
    const report = await live({ only: ["hook/agentwatch"] }).catch((error: Error) => error);
    expect(report).toBeInstanceOf(Error);
    expect((report as Error).message).toMatch(/not declared: extra.sh/);
  });

  it("derives the fetch location from pluginSource, marketplaceRef or externalUrl", () => {
    const sha = SHA_B;
    expect(locateContent({ sourceRevision: sha, pluginSource: { kind: "marketplace-path", path: "plugins/x", sha }, marketplaceRef: { name: "m", url: "https://github.com/a/b.git", sha } } as never)).toEqual({ repo: "a/b", sha, path: "plugins/x" });
    expect(locateContent({ sourceRevision: sha, pluginSource: { kind: "git-subdir", path: "p/q", url: "https://github.com/c/d.git", sha } } as never)).toEqual({ repo: "c/d", sha, path: "p/q" });
    expect(locateContent({ sourceRevision: sha, pluginSource: { kind: "url", url: "https://github.com/c/d.git", sha } } as never)).toEqual({ repo: "c/d", sha, path: "" });
    expect(locateContent({ sourceRevision: sha, externalUrl: `https://github.com/e/f/tree/${sha}/skills/g` } as never)).toEqual({ repo: "e/f", sha, path: "skills/g" });
    expect(() => locateContent({ sourceRevision: sha, externalUrl: "https://github.com/e/f/tree/main/skills/g" } as never)).toThrow(/pinned to main/);
  });
});
