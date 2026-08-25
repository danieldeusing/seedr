import { execFileSync } from "node:child_process";
import { makeTempDir } from "../test/tempDir.js";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { itemStateHash } from "../hash.js";
import { readItem } from "../read.js";
import { LONG, makeRegistry, FIXTURE_SHA, FIXTURE_DIGEST } from "../test/fixtures.js";
import { applyOp } from "./apply.js";
import { parseOp } from "./parse.js";
import type { AddLocalOp, AddRemoteOp, RemoveOp, UpdateOp } from "./types.js";

function makeSource(): string {
  const dir = makeTempDir("seedr-source-");
  mkdirSync(join(dir, "references"));
  writeFileSync(join(dir, "SKILL.md"), "# New skill\n");
  writeFileSync(join(dir, "references", "guide.md"), "guide\n");
  return dir;
}

const addLocalOp = (overrides: Partial<AddLocalOp> = {}): AddLocalOp => ({
  v: 1,
  kind: "add-local",
  type: "skill",
  slug: "new-skill",
  sourcePath: makeSource(),
  name: "New Skill",
  description: "Adds new things.",
  longDescription: LONG,
  compatibility: ["claude", "copilot"],
  author: { name: "Fork Owner", url: "https://github.com/fork-owner" },
  ...overrides,
});

describe("parseOp", () => {
  test("accepts every kind and refuses anything else by shape", () => {
    expect(parseOp(addLocalOp()).kind).toBe("add-local");
    expect(() => parseOp(null)).toThrow(/JSON object/);
    expect(() => parseOp({ ...addLocalOp(), v: 2 })).toThrow(/unsupported version 2/);
    expect(() => parseOp({ ...addLocalOp(), kind: "nuke" })).toThrow(/unknown kind "nuke"/);
    expect(() => parseOp({ ...addLocalOp(), type: "mcps" })).toThrow(/unknown type "mcps"/);
    expect(() => parseOp({ ...addLocalOp(), slug: "../x" })).toThrow(/invalid slug/);
    expect(() => parseOp({ ...addLocalOp(), sourcePath: "" })).toThrow(/"sourcePath" must be a non-empty string/);
  });

  test("an update may not retarget identity fields", () => {
    const base = { v: 1, kind: "update", type: "skill", slug: "alpha", expectedHash: "x", patch: {} };
    expect(parseOp(base).kind).toBe("update");
    for (const locked of ["slug", "type", "sourceType", "contentHash"]) {
      expect(() => parseOp({ ...base, patch: { [locked]: "y" } })).toThrow(new RegExp(`may not change "${locked}"`));
    }
    expect(() => parseOp({ ...base, contentEdits: [{ path: "a" }] })).toThrow(/content edit needs/);
  });
});

describe("add-local", () => {
  test("copies the source tree, derives the file tree and writes a first-party item", () => {
    const registry = makeRegistry();
    const result = applyOp(registry, addLocalOp({ targetScope: "project", externalUrl: "https://github.com/fork-owner/seedr/tree/main/registry/skills/new-skill" }));

    // The B1 storage value (STORAGE_SOURCE_TYPES), not the canonical `seedr`.
    expect(result.item?.sourceType).toBe("seedr");
    expect(result.item?.targetScope).toBe("project");
    expect(result.item?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.item?.contents?.files).toEqual([
      { name: "references", type: "directory", children: [{ name: "guide.md", type: "file" }] },
      { name: "SKILL.md", type: "file" },
    ]);
    expect(readFileSync(join(registry, "skills", "new-skill", "SKILL.md"), "utf8")).toBe("# New skill\n");
    expect(readItem(registry, "skill", "new-skill")).toEqual(result.item);
  });

  test("places a single source file inside the item directory, keeping hook triggers", () => {
    const registry = makeRegistry();
    const script = join(makeTempDir("seedr-hook-"), "guard.sh");
    writeFileSync(script, "#!/bin/sh\n");
    const result = applyOp(registry, addLocalOp({ type: "hook", slug: "guard", sourcePath: script, triggers: [{ event: "PreToolUse", matcher: "Bash" }] }));
    expect(existsSync(join(registry, "hooks", "guard", "guard.sh"))).toBe(true);
    expect(result.item?.contents).toEqual({ files: [{ name: "guard.sh", type: "file" }], triggers: [{ event: "PreToolUse", matcher: "Bash" }] });
  });

  test("refuses a colliding (type, slug) and a missing source, writing nothing", () => {
    const registry = makeRegistry();
    expect(() => applyOp(registry, addLocalOp({ slug: "alpha" }))).toThrow(/already exists/);
    expect(() => applyOp(registry, addLocalOp({ sourcePath: "/definitely/not/here" }))).toThrow(/does not exist/);
    expect(existsSync(join(registry, "skills", "new-skill"))).toBe(false);
  });

  test("the same slug under another type is a different item", () => {
    const registry = makeRegistry();
    expect(applyOp(registry, addLocalOp({ type: "plugin", slug: "alpha" })).item?.type).toBe("plugin");
  });

  test("validates the full item — including the description gate — before copying anything", () => {
    const registry = makeRegistry();
    expect(() => applyOp(registry, addLocalOp({ longDescription: "too short" }))).toThrow(/longDescription too short/);
    expect(() => applyOp(registry, addLocalOp({ compatibility: ["bard" as never] }))).toThrow(/unknown coding agent/);
    expect(existsSync(join(registry, "skills", "new-skill"))).toBe(false);
  });
});

const REMOTE_SLUG = "remote-plugin";

describe("add-remote", () => {
  const remoteOp: AddRemoteOp = {
    v: 1,
    kind: "add-remote",
    type: "plugin",
    slug: REMOTE_SLUG,
    name: "Remote Plugin",
    description: "Remote things.",
    longDescription: LONG,
    compatibility: ["claude"],
    author: { name: "Them", url: "https://github.com/them" },
    externalUrl: "https://github.com/them/remote-plugin/tree/main",
    sourceRevision: FIXTURE_SHA,
    contentDigest: FIXTURE_DIGEST,
    pluginSource: { kind: "url", url: "https://github.com/them/remote-plugin.git", sha: FIXTURE_SHA },
    pluginType: "package",
    package: { skill: 2, agent: 1 },
    updatedAt: "2026-01-02",
  };

  test("writes a metadata-only community item and nothing else", () => {
    const registry = makeRegistry();
    const result = applyOp(registry, remoteOp);
    expect(result.item).toMatchObject({ sourceType: "community", pluginType: "package", package: { skill: 2, agent: 1 }, updatedAt: "2026-01-02" });
    expect(readItem(registry, "plugin", REMOTE_SLUG)).toEqual(result.item);
    expect(existsSync(join(registry, "plugins", REMOTE_SLUG, "README.md"))).toBe(false);
  });

  test("refuses collisions and invalid metadata", () => {
    const registry = makeRegistry();
    expect(() => applyOp(registry, { ...remoteOp, slug: "beta" })).toThrow(/already exists/);
    expect(() => applyOp(registry, { ...remoteOp, externalUrl: "not-a-url" })).toThrow(/externalUrl/);
  });
});

describe("update", () => {
  const updateOp = (registry: string, overrides: Partial<UpdateOp> = {}): UpdateOp => ({
    v: 1,
    kind: "update",
    type: "skill",
    slug: "alpha",
    expectedHash: itemStateHash(registry, "skill", "alpha") as string,
    patch: { description: "Does alpha things, better." },
    ...overrides,
  });

  test("patches metadata and content, refreshing the file tree", () => {
    const registry = makeRegistry();
    const result = applyOp(registry, updateOp(registry, { contentEdits: [{ path: "references/extra.md", content: "extra\n" }] }));
    expect(result.item?.description).toBe("Does alpha things, better.");
    expect(result.item?.contents?.files).toEqual([
      { name: "references", type: "directory", children: [{ name: "extra.md", type: "file" }, { name: "notes.md", type: "file" }] },
      { name: "SKILL.md", type: "file" },
    ]);
    expect(readFileSync(join(registry, "skills", "alpha", "references", "extra.md"), "utf8")).toBe("extra\n");
  });

  test("refuses a stale hash, a synced item, an escaping edit path and an invalid patch", () => {
    const registry = makeRegistry();
    expect(() => applyOp(registry, updateOp(registry, { expectedHash: "0000000000000000" }))).toThrow(/changed since it was read/);
    expect(() => applyOp(registry, updateOp(registry, { slug: "gamma", expectedHash: itemStateHash(registry, "skill", "gamma") as string }))).toThrow(/Only first-party items/);
    expect(() => applyOp(registry, updateOp(registry, { contentEdits: [{ path: "../../escape.md", content: "x" }] }))).toThrow(/escapes the item directory/);
    expect(() => applyOp(registry, updateOp(registry, { patch: { compatibility: [] } }))).toThrow(/compatibility/);
    expect(readItem(registry, "skill", "alpha").description).toBe("Does alpha things.");
  });
});

describe("remove", () => {
  const removeOp = (registry: string, overrides: Partial<RemoveOp> = {}): RemoveOp => ({
    v: 1,
    kind: "remove",
    type: "skill",
    slug: "alpha",
    sourceType: "seedr",
    expectedHash: itemStateHash(registry, "skill", "alpha") as string,
    ...overrides,
  });

  test("deletes the item directory when key, source type and hash all match", () => {
    const registry = makeRegistry();
    expect(applyOp(registry, removeOp(registry)).item).toBeNull();
    expect(existsSync(join(registry, "skills", "alpha"))).toBe(false);
  });

  test("refuses a stale hash, a source-type mismatch, an official item and an unknown item", () => {
    const registry = makeRegistry();
    expect(() => applyOp(registry, removeOp(registry, { expectedHash: "0000000000000000" }))).toThrow(/changed since it was read/);
    expect(() => applyOp(registry, removeOp(registry, { sourceType: "community" }))).toThrow(/is seedr, not community/);
    expect(() => applyOp(registry, removeOp(registry, { slug: "gamma", sourceType: "official", expectedHash: itemStateHash(registry, "skill", "gamma") as string }))).toThrow(/Official items cannot be removed/);
    expect(() => applyOp(registry, removeOp(registry, { slug: "nope", expectedHash: "x" }))).toThrow(/No skill item "nope"/);
    expect(existsSync(join(registry, "skills", "alpha"))).toBe(true);
  });

  test("copies symlinked sources as real files and writes canonical agent ids", () => {
    const registry = makeRegistry();
    const source = makeSource();
    writeFileSync(join(source, "real.md"), "real\n");
    symlinkSync(join(source, "real.md"), join(source, "linked.md"));

    const result = applyOp(registry, addLocalOp({ slug: "deref", sourcePath: source, compatibility: ["gemini", "claude", "gemini"] }));

    const copied = join(registry, "skills", "deref", "linked.md");
    expect(lstatSync(copied).isSymbolicLink()).toBe(false);
    expect(readFileSync(copied, "utf8")).toBe("real\n");
    // A stored `gemini` resolves on the way in; what is written is canonical.
    expect((result.item as { compatibility: string[] }).compatibility).toEqual(["claude", "antigravity"]);
  });

  test("drops files git ignores from the copy, the tree and the hash", () => {
    const repo = makeTempDir("seedr-ignore-");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, ".gitignore"), ".DS_Store\nnode_modules/\n");
    const registry = join(repo, "registry");
    mkdirSync(join(registry, "skills"), { recursive: true });

    const source = makeSource();
    writeFileSync(join(source, ".DS_Store"), "finder noise");
    mkdirSync(join(source, "node_modules", "x"), { recursive: true });
    writeFileSync(join(source, "node_modules", "x", "index.js"), "noise");

    const result = applyOp(registry, addLocalOp({ slug: "tidy", sourcePath: source }));

    expect(existsSync(join(registry, "skills", "tidy", "SKILL.md"))).toBe(true);
    expect(existsSync(join(registry, "skills", "tidy", ".DS_Store"))).toBe(false);
    expect(existsSync(join(registry, "skills", "tidy", "node_modules"))).toBe(false);
    const names = JSON.stringify((result.item as { contents: { files: unknown } }).contents.files);
    expect(names).not.toContain("DS_Store");
    expect(names).not.toContain("node_modules");
  });

  test("update refuses drive letters, backslashes and symlinked edit paths", () => {
    const registry = makeRegistry();
    const hash = () => itemStateHash(registry, "skill", "alpha") as string;
    const edit = (path: string) => ({ v: 1, kind: "update", type: "skill", slug: "alpha", expectedHash: hash(), patch: {}, contentEdits: [{ path, content: "x" }] }) as UpdateOp;

    expect(() => applyOp(registry, edit("C:/evil.md"))).toThrow(/escapes the item directory/);
    expect(() => applyOp(registry, edit("docs\\evil.md"))).toThrow(/escapes the item directory/);
    expect(() => applyOp(registry, edit("../evil.md"))).toThrow(/escapes the item directory/);

    const outside = makeTempDir("seedr-outside-");
    writeFileSync(join(outside, "target.md"), "original\n");
    symlinkSync(outside, join(registry, "skills", "alpha", "escape"));
    expect(() => applyOp(registry, edit("escape/target.md"))).toThrow(/through a symlink/);
    expect(readFileSync(join(outside, "target.md"), "utf8")).toBe("original\n");
  });

  test("patching contents.triggers keeps the file list", () => {
    const registry = makeRegistry();
    const before = readItem(registry, "skill", "alpha");
    expect(before.contents?.files?.length).toBeGreaterThan(0);
    const result = applyOp(registry, { v: 1, kind: "update", type: "skill", slug: "alpha", expectedHash: itemStateHash(registry, "skill", "alpha") as string, patch: { contents: { triggers: [{ event: "PostToolUse" }] } } });
    const contents = (result.item as { contents: { files: unknown[]; triggers: unknown[] } }).contents;
    expect(contents.files).toEqual(before.contents?.files);
    expect(contents.triggers).toEqual([{ event: "PostToolUse" }]);
  });

  test("update rewrites a stored gemini to the canonical antigravity", () => {
    const registry = makeRegistry();
    writeFileSync(join(registry, "skills", "alpha", "item.json"), JSON.stringify({ ...readItem(registry, "skill", "alpha"), compatibility: ["gemini"] }, null, 2) + "\n");
    const result = applyOp(registry, { v: 1, kind: "update", type: "skill", slug: "alpha", expectedHash: itemStateHash(registry, "skill", "alpha") as string, patch: { name: "Alpha 2", compatibility: ["claude", "antigravity"] } });
    expect((result.item as { compatibility: string[] }).compatibility).toEqual(["claude", "antigravity"]);
  });

  test("applyOp dispatches every op kind to its implementation", () => {
    const registry = makeRegistry();
    const source = makeSource();
    const slug = "dispatch-local";

    const added = applyOp(registry, { v: 1, kind: "add-local", type: "skill", slug, sourcePath: source, name: "Local", description: "Adds locally.", longDescription: LONG, compatibility: ["claude"], author: { name: "T" } });
    expect(added.kind).toBe("add-local");
    expect(existsSync(join(registry, "skills", slug, "SKILL.md"))).toBe(true);

    const remote = applyOp(registry, { v: 1, kind: "add-remote", type: "plugin", slug: "dispatch-remote", name: "Remote", description: "Adds remotely.", longDescription: LONG, compatibility: ["claude"], author: { name: "T" }, externalUrl: "https://github.com/x/y/tree/main/z", sourceRevision: FIXTURE_SHA, contentDigest: FIXTURE_DIGEST, pluginSource: { kind: "github", url: "https://github.com/x/y.git", sha: FIXTURE_SHA } });
    expect(remote.kind).toBe("add-remote");

    const updated = applyOp(registry, { v: 1, kind: "update", type: "skill", slug, expectedHash: itemStateHash(registry, "skill", slug) as string, patch: { name: "Local 2" } });
    expect((updated.item as { name: string }).name).toBe("Local 2");

    const removed = applyOp(registry, { v: 1, kind: "remove", type: "skill", slug, sourceType: "seedr", expectedHash: itemStateHash(registry, "skill", slug) as string });
    expect(removed.kind).toBe("remove");
    expect(existsSync(join(registry, "skills", slug))).toBe(false);
  });
});
