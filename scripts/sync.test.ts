import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFirstParty } from "@seedr/registry-ops";
import { readAllItems } from "./compile-manifest.js";
import { computeContentDigest } from "./sync/digest.js";
import { GitHubClient } from "./sync/github.js";
import type { ManifestItem } from "./sync/types.js";
import { runSync, readEnvOptions, type SyncOutcome } from "./sync.js";
import { SHA_A, SHA_B, SHA_C, SHA_D } from "./test/fake-github.js";
import { APACHE, MIT, SHA_1, SHA_2, SHA_F, makeWorld, officialMarketplace, type World } from "./test/sync-world.js";

const encode = (text: string): Buffer => Buffer.from(text, "utf-8");

function readItem(registryDir: string, type: string, slug: string): ManifestItem {
  return JSON.parse(readFileSync(join(registryDir, type, slug, "item.json"), "utf-8")) as ManifestItem;
}

function snapshotRegistry(registryDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files[rel] = readFileSync(join(dir, entry.name), "utf-8");
    }
  };
  walk(registryDir, "");
  return files;
}

describe("runSync", () => {
  let world: World;
  let logLines: string[];

  /** One run with a fresh client, as in production (caches live for a single run). */
  const sync = (options: { maxDeletions?: number; allowEmpty?: boolean } = {}): Promise<SyncOutcome> => {
    const client = new GitHubClient({ env: {}, sleep: async () => {}, log: (line) => logLines.push(line) });
    return runSync({ registryDir: world.registryDir, client, log: (line) => logLines.push(line), ...options });
  };

  /** Migrate the pre-integrity fixture first, so later runs exercise steady-state behaviour. */
  const migrate = async (): Promise<void> => {
    expect((await sync()).ok).toBe(true);
    logLines = [];
  };

  beforeEach(() => {
    world = makeWorld();
    logLines = [];
    vi.stubGlobal("fetch", world.fake.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(world.registryDir, { recursive: true, force: true });
  });

  describe("migration of a pre-integrity registry", () => {
    it("pins every synced item, keeps curated fields, adds local-path entries and nothing else", async () => {
      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.failedSources).toEqual([]);
      expect(outcome.added.sort()).toEqual(["plugin/new-one"]);
      expect(outcome.deleted).toEqual(["skill/stale-skill"]);
      expect(outcome.carriedOver).toEqual([]);
      expect(existsSync(join(world.registryDir, "plugins", "not-ours"))).toBe(false);
      expect(existsSync(join(world.registryDir, "plugins", "example-plugin"))).toBe(false);
      expect(existsSync(join(world.registryDir, "skills", "stale-skill"))).toBe(false);

      // every synced item now carries provenance and validates strictly
      const items = readAllItems({ registryDir: world.registryDir });
      for (const item of items.filter((i) => !isFirstParty(i.sourceType))) {
        expect(item.sourceRevision, item.slug).toMatch(/^[0-9a-f]{40}$/);
        expect(item.contentDigest, item.slug).toMatch(/^[0-9a-f]{64}$/);
        expect(item.license, item.slug).toBeDefined();
        if (item.type === "plugin") {
          expect(item.pluginSource, item.slug).toBeDefined();
          expect(item.pluginSource!.sha).toBe(item.sourceRevision);
        }
      }

      // official skill: own license, digest over the full tree, curated fields untouched
      const pdf = readItem(world.registryDir, "skills", "pdf");
      expect(pdf).toMatchObject({
        name: "PDF (curated name)",
        description: "Work with PDF files",
        compatibility: ["claude", "codex"],
        featured: true,
        sourceType: "official",
        externalUrl: `https://github.com/anthropics/skills/tree/${SHA_A}/skills/pdf`,
        sourceRevision: SHA_A,
        license: { spdx: "MIT", file: "skills/pdf/LICENSE.txt" },
        updatedAt: "2026-03-01T00:00:00Z",
      });
      expect(pdf.longDescription).toBe(world.existing.pdf!.longDescription);
      expect(pdf.contents!.files).toEqual([
        { name: "scripts", type: "directory", children: [{ name: "a.py", type: "file" }] },
        { name: "LICENSE.txt", type: "file" },
        { name: "SKILL.md", type: "file" },
      ]);
      expect(pdf.contentDigest).toBe(
        computeContentDigest([
          { path: "SKILL.md", bytes: encode("---\nname: pdf\ndescription: Work with PDF files\n---\n# PDF\n") },
          { path: "LICENSE.txt", bytes: encode(MIT) },
          { path: "scripts/a.py", bytes: encode("print(1)\n") },
        ]),
      );
      expect(Object.keys(pdf)[0]).toBe("slug");
      expect(pdf.contentHash).not.toBe("0000000000000000");

      // skill without any license text
      expect(readItem(world.registryDir, "skills", "docx").license).toEqual({ note: expect.stringMatching(/No license text found upstream/) });

      // marketplace-path plugin: repo-root LICENSE travels with the install and is part of the digest
      const codeReview = readItem(world.registryDir, "plugins", "code-review");
      expect(codeReview).toMatchObject({
        sourceType: "official",
        author: { name: "Anthropic" },
        externalUrl: `https://github.com/anthropics/claude-plugins-official/tree/${SHA_B}/plugins/code-review`,
        marketplace: "claude-plugins-official",
        version: "0.1.0",
        pluginType: "wrapper",
        wrapper: "command",
        sourceRevision: SHA_B,
        pluginSource: { kind: "marketplace-path", path: "plugins/code-review", sha: SHA_B },
        marketplaceRef: { name: "claude-plugins-official", url: "https://github.com/anthropics/claude-plugins-official.git", sha: SHA_B },
        license: { spdx: "MIT", file: "LICENSE", installAs: "LICENSE" },
        description: "Review PRs",
      });
      expect(codeReview.longDescription).toBe(world.existing["code-review"]!.longDescription);
      expect(codeReview.contentDigest).toBe(
        computeContentDigest([
          { path: ".claude-plugin/plugin.json", bytes: encode(JSON.stringify({ name: "code-review", description: "code-review from plugin.json", version: "0.1.0", author: { name: "code-review author" } })) },
          { path: "commands/review.md", bytes: encode("# review\n") },
          { path: "LICENSE", bytes: encode(MIT) },
        ]),
      );

      // strict:false entry: no plugin.json needed, inline definition recorded, classified as an LSP integration
      expect(readItem(world.registryDir, "plugins", "clangd-lsp")).toMatchObject({
        strict: false,
        lspServers: { clangd: { command: "clangd", args: ["--background-index"] } },
        pluginType: "integration",
        integration: "lsp",
        version: "1.0.0",
        license: { spdx: "MIT", file: "plugins/clangd-lsp/LICENSE" },
      });
      expect(readItem(world.registryDir, "plugins", "clangd-lsp").package).toBeUndefined();

      // external_plugins path stays community, author from the entry
      expect(readItem(world.registryDir, "plugins", "asana")).toMatchObject({
        sourceType: "community",
        author: { name: "Asana" },
        pluginType: "wrapper",
        wrapper: "mcp",
        pluginSource: { kind: "marketplace-path", path: "external_plugins/asana", sha: SHA_B },
        license: { spdx: "MIT", file: "LICENSE", installAs: "LICENSE" },
      });

      // url source: content comes from the pinned third-party repo, not from the stale external_plugins folder
      const slack = readItem(world.registryDir, "plugins", "slack");
      expect(slack).toMatchObject({
        sourceType: "community",
        author: { name: "Slack" },
        externalUrl: `https://github.com/slackapi/slack-mcp-plugin/tree/${SHA_C}`,
        sourceRevision: SHA_C,
        pluginSource: { kind: "url", url: "https://github.com/slackapi/slack-mcp-plugin.git", sha: SHA_C },
        marketplaceRef: { name: "claude-plugins-official", url: "https://github.com/anthropics/claude-plugins-official.git", sha: SHA_B },
        marketplace: "claude-plugins-official",
        pluginType: "package",
        package: { skill: 1, mcp: 1 },
        license: { spdx: "MIT", file: "LICENSE" },
        updatedAt: "2026-03-03T00:00:00Z",
      });
      expect(slack.pluginSource!.path).toBeUndefined();
      expect(slack.contents!.files!.map((f) => f.name)).toEqual([".claude-plugin", "skills", ".mcp.json", "LICENSE"]);
      expect(logLines.some((l) => l.includes("skipped non-regular files in slack: AGENTS.md (mode 120000)"))).toBe(true);

      // git-subdir source
      const stripe = readItem(world.registryDir, "plugins", "stripe");
      expect(stripe).toMatchObject({
        externalUrl: `https://github.com/stripe/ai/tree/${SHA_D}/providers/claude/plugin`,
        sourceRevision: SHA_D,
        pluginSource: { kind: "git-subdir", path: "providers/claude/plugin", url: "https://github.com/stripe/ai.git", ref: "main", sha: SHA_D },
        pluginType: "wrapper",
        wrapper: "command",
        license: { spdx: "Apache-2.0", file: "LICENSE", installAs: "LICENSE" },
        author: { name: "stripe author" },
      });
      expect(stripe.contents!.files!.map((f) => f.name)).toEqual([".claude-plugin", "commands"]);
      expect(stripe.contentDigest).toBe(
        computeContentDigest([
          { path: ".claude-plugin/plugin.json", bytes: encode(JSON.stringify({ name: "stripe", description: "stripe from plugin.json", version: "0.1.0", author: { name: "stripe author" } })) },
          { path: "commands/a.md", bytes: encode("# a\n") },
          { path: "commands/b.md", bytes: encode("# b\n") },
          { path: "LICENSE", bytes: encode(APACHE) },
        ]),
      );

      // new local-path entry
      expect(readItem(world.registryDir, "plugins", "new-one")).toMatchObject({ name: "New One", sourceType: "official", pluginType: "wrapper", wrapper: "skill" });

      // community plugin described by its repo's own marketplace (root plugin → url)
      expect(readItem(world.registryDir, "plugins", "superpowers")).toMatchObject({
        sourceType: "community",
        externalUrl: `https://github.com/obra/superpowers/tree/${SHA_F}`,
        marketplace: "superpowers-dev",
        marketplaceRef: { name: "superpowers-dev", url: "https://github.com/obra/superpowers.git", sha: SHA_F },
        pluginSource: { kind: "url", url: "https://github.com/obra/superpowers.git", sha: SHA_F },
        version: "6.0.0",
        pluginType: "package",
        package: { skill: 1, hook: 1 },
      });

      // community plugin whose marketplace has no matching entry: pinned from externalUrl, no marketplaceRef
      const agentReviews = readItem(world.registryDir, "plugins", "agent-reviews");
      expect(agentReviews).toMatchObject({
        marketplace: "agent-reviews",
        pluginSource: { kind: "url", url: "https://github.com/pbakaus/agent-reviews.git", ref: "main", sha: SHA_1 },
        pluginType: "wrapper",
        wrapper: "skill",
        author: { name: "agent-reviews-root author" },
      });
      expect(agentReviews.marketplaceRef).toBeUndefined();

      // community plugin relocated by its repo's marketplace (the old externalUrl path no longer exists)
      expect(readItem(world.registryDir, "plugins", "compound-engineering")).toMatchObject({
        externalUrl: `https://github.com/every/compound/tree/${SHA_2}/plugin`,
        pluginSource: { kind: "marketplace-path", path: "plugin", sha: SHA_2 },
        marketplaceRef: { name: "compound-engineering-plugin", url: "https://github.com/every/compound.git", sha: SHA_2 },
        version: "2.0.0",
        package: { skill: 1, agent: 1 },
        license: { spdx: "MIT", file: "LICENSE", installAs: "LICENSE" },
      });

      // community skill
      expect(readItem(world.registryDir, "skills", "react-best-practices")).toMatchObject({
        description: "React guidelines",
        sourceRevision: SHA_2,
        externalUrl: `https://github.com/vercel-labs/agent-skills/tree/${SHA_2}/skills/react-best-practices`,
        license: { spdx: "MIT", file: "LICENSE", installAs: "LICENSE" },
      });
      expect(readItem(world.registryDir, "skills", "react-best-practices").pluginSource).toBeUndefined();

      // first-party items are never touched; manifests are compiled with their digest
      expect(readItem(world.registryDir, "hooks", "agentwatch")).toEqual(world.existing.agentwatch);
      const hooksManifest = JSON.parse(readFileSync(join(world.registryDir, "hooks", "manifest.json"), "utf-8")) as { items: ManifestItem[] };
      expect(hooksManifest.items[0]!.contentDigest).toBe(computeContentDigest([{ path: "agentwatch.sh", bytes: encode("#!/bin/sh\necho hi\n") }]));
      const index = JSON.parse(readFileSync(join(world.registryDir, "manifest.json"), "utf-8")) as { types: Record<string, { count: number }> };
      expect(index.types.plugin!.count).toBe(9);
      expect(index.types.skill!.count).toBe(3);

      // decision log
      expect(logLines.join("\n")).toMatch(/deleted \(1\): skill\/stale-skill/);
      expect(logLines.join("\n")).toMatch(/added \(1\): plugin\/new-one/);
    });

    it("is idempotent: a second run changes nothing", async () => {
      await sync();
      const before = snapshotRegistry(world.registryDir);
      logLines = [];
      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.added).toEqual([]);
      expect(outcome.changed).toEqual([]);
      expect(outcome.deleted).toEqual([]);
      expect(outcome.unchanged).toHaveLength(12);
      expect(snapshotRegistry(world.registryDir)).toEqual(before);
    });
  });

  describe("fail-closed behaviour", () => {
    it("carries official skills over unchanged when the skills repo is unavailable", async () => {
      await migrate();
      const pdf = readItem(world.registryDir, "skills", "pdf");
      world.fake.repos["anthropics/skills"]!.commits[SHA_A]!.files["skills/pdf/SKILL.md"] = "---\nname: pdf\ndescription: changed upstream\n---\n";
      delete world.fake.repos["anthropics/skills"]!.commits[SHA_A]!.files["skills/docx/SKILL.md"];
      world.fake.fail({ match: "api.github.com/repos/anthropics/skills/commits/main", status: 500, times: Infinity });

      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.failedSources).toEqual([{ name: "official-skills", reason: expect.stringMatching(/Gave up on .*anthropics\/skills\/commits\/main after 4 attempt/) }]);
      expect(outcome.carriedOver.map((c) => c.key).sort()).toEqual(["skill/docx", "skill/pdf"]);
      expect(outcome.deleted).toEqual([]);
      expect(existsSync(join(world.registryDir, "skills", "docx", "item.json"))).toBe(true);
      expect(readItem(world.registryDir, "skills", "pdf")).toEqual(pdf);
      expect(readItem(world.registryDir, "plugins", "slack").sourceRevision).toBe(SHA_C);
    });

    it("carries every marketplace-owned plugin over when the marketplace is unavailable, and still syncs community items", async () => {
      await migrate();
      const slack = readItem(world.registryDir, "plugins", "slack");
      const official = world.fake.repos["anthropics/claude-plugins-official"]!.commits[SHA_B]!;
      official.files[".claude-plugin/marketplace.json"] = officialMarketplace({ plugins: [] }); // would delete everything if it were read
      world.fake.fail({ match: `claude-plugins-official/${SHA_B}/.claude-plugin/marketplace.json`, status: 503, times: Infinity });
      world.fake.repos["obra/superpowers"]!.commits[SHA_F]!.date = "2026-04-01T00:00:00Z";

      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.failedSources.map((s) => s.name)).toEqual(["official-marketplace"]);
      expect(outcome.carriedOver.map((c) => c.key).sort()).toEqual(["plugin/asana", "plugin/clangd-lsp", "plugin/code-review", "plugin/new-one", "plugin/slack", "plugin/stripe"]);
      expect(outcome.deleted).toEqual([]);
      expect(readItem(world.registryDir, "plugins", "slack")).toEqual(slack);
      expect(outcome.changed).toEqual(["plugin/superpowers"]);
      expect(readItem(world.registryDir, "plugins", "superpowers").updatedAt).toBe("2026-04-01T00:00:00Z");
    });

    it("carries a single item over when only its own metadata request fails, and never deletes it", async () => {
      await migrate();
      const codeReview = readItem(world.registryDir, "plugins", "code-review");
      world.fake.fail({ match: `claude-plugins-official/${SHA_B}/plugins/code-review/.claude-plugin/plugin.json`, status: 500, times: Infinity });
      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.failedSources).toEqual([]);
      expect(outcome.carriedOver).toEqual([{ key: "plugin/code-review", reason: expect.stringMatching(/Gave up on/) }]);
      expect(outcome.deleted).toEqual([]);
      expect(readItem(world.registryDir, "plugins", "code-review")).toEqual(codeReview);
      expect(logLines.join("\n")).toMatch(/carried over \(1\):\n\s+- plugin\/code-review: Gave up on/);
    });

    it("builds a plugin without plugin.json from its marketplace entry (plugin.json is optional)", async () => {
      await migrate();
      const repo = world.fake.repos["anthropics/claude-plugins-official"]!.commits[SHA_B]!;
      delete repo.files["plugins/code-review/.claude-plugin/plugin.json"];
      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.carriedOver).toEqual([]);
      const item = readItem(world.registryDir, "plugins", "code-review");
      expect(item.name).toBe("Code Review");
      expect(item.description).toBe("Review PRs");
      expect(item.sourceRevision).toBe(SHA_B);
      expect(item.contentDigest).toMatch(/^[0-9a-f]{64}$/);
      expect((item.contents?.files ?? []).map((f: { name: string }) => f.name)).not.toContain(".claude-plugin");
    });

    it("aborts without writing when the API is rate limited on the first call", async () => {
      const before = snapshotRegistry(world.registryDir);
      world.fake.fail({ match: "api.github.com", status: 403, headers: { "x-ratelimit-remaining": "0" }, times: Infinity });
      const outcome = await sync();
      expect(outcome.ok).toBe(false);
      expect(outcome.abortReason).toMatch(/no source completed/);
      expect(outcome.abortReason).toMatch(/rate limit exhausted/);
      expect(snapshotRegistry(world.registryDir)).toEqual(before);
      // the two official sources start concurrently; once the limit is seen, no further API calls are made
      expect(world.fake.requests.filter((r) => r.includes("api.github.com")).length).toBeLessThanOrEqual(2);
    });

    it("aborts when an existing invalid item would be carried over", async () => {
      world.fake.fail({ match: "api.github.com/repos/anthropics/skills/commits/main", status: 500, times: Infinity });
      const before = snapshotRegistry(world.registryDir);
      const outcome = await sync();
      // docx carried over from the failed source still lacks provenance — that must stop the run
      expect(outcome.ok).toBe(false);
      expect(outcome.abortReason).toMatch(/validation violation/);
      expect(outcome.abortReason).toMatch(/skills\/docx\/item\.json: sourceRevision: synced items must carry "sourceRevision"/);
      expect(snapshotRegistry(world.registryDir)).toEqual(before);
      expect(before["skills/pdf/item.json"]).toBeDefined();
    }, 10_000);

    it("fails an upstream item whose data is invalid instead of writing it", async () => {
      const skills = world.fake.repos["anthropics/skills"]!.commits[SHA_A]!;
      skills.files["skills/docx/SKILL.md"] = "---\nname: docx\n---\nno description\n";
      const outcome = await sync();
      expect(outcome.ok).toBe(false); // docx on disk is pre-migration, so carrying it over is itself invalid
      expect(outcome.abortReason).toMatch(/skills\/docx\/item\.json/);
      expect(logLines.join("\n")).toMatch(/✗ docx: built item is invalid:\s+skill\/docx\/item\.json: description: is missing 'description'/);
    });
  });

  describe("deletions", () => {
    it("applies a legitimate upstream deletion within the threshold and removes only metadata-only directories", async () => {
      await migrate();
      const skills = world.fake.repos["anthropics/skills"]!.commits[SHA_A]!;
      delete skills.files["skills/docx/SKILL.md"];
      writeFileSync(join(world.registryDir, "skills", "docx", "notes.md"), "keep me\n");
      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.deleted).toEqual([]);
      expect(existsSync(join(world.registryDir, "skills", "docx", "item.json"))).toBe(true);
      expect(logLines.join("\n")).toMatch(/not deleting skill\/docx: directory holds content files \(notes.md\)/);
    });

    it("aborts when deletions exceed SYNC_MAX_DELETIONS, writing nothing", async () => {
      const before = snapshotRegistry(world.registryDir);
      const outcome = await sync({ maxDeletions: 0 });
      expect(outcome.ok).toBe(false);
      expect(outcome.abortReason).toMatch(/1 deletion\(s\) proposed, above SYNC_MAX_DELETIONS=0/);
      expect(outcome.abortReason).toMatch(/skill\/stale-skill: no longer listed by official-skills/);
      expect(snapshotRegistry(world.registryDir)).toEqual(before);
    });

    it("treats an explicitly empty marketplace as complete: every marketplace-owned plugin becomes a deletion", async () => {
      world.fake.repos["anthropics/claude-plugins-official"]!.commits[SHA_B]!.files[".claude-plugin/marketplace.json"] = officialMarketplace({ plugins: [] });
      const capped = await sync();
      expect(capped.ok).toBe(false);
      expect(capped.abortReason).toMatch(/6 deletion\(s\) proposed, above SYNC_MAX_DELETIONS=5/);

      const accepted = await sync({ maxDeletions: 10 });
      expect(accepted.ok).toBe(true);
      expect(accepted.deleted.sort()).toEqual(["plugin/asana", "plugin/clangd-lsp", "plugin/code-review", "plugin/slack", "plugin/stripe", "skill/stale-skill"]);
      expect(existsSync(join(world.registryDir, "plugins", "slack"))).toBe(false);
      expect(readItem(world.registryDir, "plugins", "superpowers").sourceRevision).toBe(SHA_F);
    });

    it("treats an empty skills listing as a failed source unless SYNC_ALLOW_EMPTY is set", async () => {
      const skills = world.fake.repos["anthropics/skills"]!.commits[SHA_A]!;
      for (const path of Object.keys(skills.files)) if (path.startsWith("skills/")) delete skills.files[path];

      const suspicious = await sync();
      expect(suspicious.ok).toBe(false); // pre-migration skills carried over are invalid → abort
      expect(suspicious.abortReason).toMatch(/validation violation/);
      expect(logLines.some((l) => l.includes("lists no skills/* directories (set SYNC_ALLOW_EMPTY=1"))).toBe(false);

      const allowed = await sync({ allowEmpty: true, maxDeletions: 3 });
      expect(allowed.ok).toBe(true);
      expect(allowed.deleted.sort()).toEqual(["skill/docx", "skill/pdf", "skill/stale-skill"]);
    });

    it("reports the empty-listing reason as a failed source when the rest of the registry is valid", async () => {
      await migrate();
      const skills = world.fake.repos["anthropics/skills"]!.commits[SHA_A]!;
      for (const path of Object.keys(skills.files)) if (path.startsWith("skills/")) delete skills.files[path];
      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.failedSources).toEqual([{ name: "official-skills", reason: expect.stringMatching(/lists no skills\/\* directories \(set SYNC_ALLOW_EMPTY=1/) }]);
      expect(outcome.carriedOver.map((c) => c.key).sort()).toEqual(["skill/docx", "skill/pdf"]);
    });

    it("applies upstream renames: the new slug is written and the old directory counts as a deletion", async () => {
      const official = world.fake.repos["anthropics/claude-plugins-official"]!.commits[SHA_B]!;
      const base = JSON.parse(officialMarketplace()) as { plugins: { name: string; source: string }[] };
      base.plugins = base.plugins.map((p) => (p.name === "code-review" ? { ...p, name: "code-review-v2", source: "./plugins/code-review-v2" } : p));
      official.files[".claude-plugin/marketplace.json"] = JSON.stringify({ ...base, renames: { "code-review": "code-review-v2" } });
      official.files["plugins/code-review-v2/.claude-plugin/plugin.json"] = official.files["plugins/code-review/.claude-plugin/plugin.json"]!;
      official.files["plugins/code-review-v2/commands/review.md"] = "# review\n";

      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.added.sort()).toEqual(["plugin/code-review-v2", "plugin/new-one"]);
      expect(outcome.deleted.sort()).toEqual(["plugin/code-review", "skill/stale-skill"]);
      const renamed = readItem(world.registryDir, "plugins", "code-review-v2");
      expect(renamed.longDescription).toBe(world.existing["code-review"]!.longDescription);
      expect(renamed.name).toBe("Code Review");
      expect(logLines.join("\n")).toMatch(/plugin\/code-review \(renamed upstream to plugin\/code-review-v2\)/);
    });
  });

  describe("community item failures", () => {
    it("keeps a pinned community item when its repository later disappears", async () => {
      await migrate();
      const pinned = readItem(world.registryDir, "plugins", "compound-engineering");
      delete world.fake.repos["every/compound"];
      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.failedSources).toEqual([{ name: "community:plugin/compound-engineering", reason: expect.stringMatching(/Not found: .*every\/compound/) }]);
      expect(outcome.carriedOver).toEqual([{ key: "plugin/compound-engineering", reason: expect.stringMatching(/source community:plugin\/compound-engineering failed/) }]);
      expect(readItem(world.registryDir, "plugins", "compound-engineering")).toEqual(pinned);
    });

    it("marks a community item failed when its externalUrl path does not exist and no marketplace entry relocates it", async () => {
      await migrate();
      const repo = world.fake.repos["vercel-labs/agent-skills"]!.commits[SHA_2]!;
      for (const path of Object.keys(repo.files)) if (path.startsWith("skills/")) delete repo.files[path];
      const outcome = await sync();
      expect(outcome.ok).toBe(true);
      expect(outcome.failedSources).toEqual([
        { name: "community:skill/react-best-practices", reason: expect.stringMatching(/directory "skills\/react-best-practices" does not exist/) },
      ]);
    });
  });

  it("reads thresholds from the environment and --dry-run from the arguments", () => {
    expect(readEnvOptions({})).toEqual({ maxDeletions: 5, allowEmpty: false, dryRun: false });
    expect(readEnvOptions({ SYNC_MAX_DELETIONS: "12", SYNC_ALLOW_EMPTY: "1", SYNC_DRY_RUN: "1" })).toEqual({ maxDeletions: 12, allowEmpty: true, dryRun: true });
    expect(readEnvOptions({}, ["--dry-run"]).dryRun).toBe(true);
    expect(() => readEnvOptions({ SYNC_MAX_DELETIONS: "lots" })).toThrow(/SYNC_MAX_DELETIONS/);
    expect(() => readEnvOptions({ SYNC_MAX_DELETIONS: "-1" })).toThrow(/SYNC_MAX_DELETIONS/);
    expect(() => readEnvOptions({}, ["--force"])).toThrow(/Unknown argument/);
  });

  it("stages and reports without writing in dry-run mode", async () => {
    const before = snapshotRegistry(world.registryDir);
    const outcome = await runSync({ registryDir: world.registryDir, client: new GitHubClient({ env: {}, sleep: async () => {}, log: () => {} }), log: (line) => logLines.push(line), dryRun: true });
    expect(outcome.ok).toBe(true);
    expect(outcome.added).toEqual(["plugin/new-one"]);
    expect(outcome.deleted).toEqual(["skill/stale-skill"]);
    expect(outcome.changed.length).toBeGreaterThan(5);
    expect(snapshotRegistry(world.registryDir)).toEqual(before);
    expect(logLines.join("\n")).toMatch(/DRY RUN, nothing will be written/);
  });

  it("leaves first-party files untouched on disk (same mtime) across a run", async () => {
    const path = join(world.registryDir, "hooks", "agentwatch", "item.json");
    const before = statSync(path).mtimeMs;
    await sync();
    expect(statSync(path).mtimeMs).toBe(before);
  });
});
