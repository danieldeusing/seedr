import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { itemStateHash } from "../hash.js";
import { readItem } from "../read.js";
import { LONG, makeRegistry, FIXTURE_SHA, FIXTURE_DIGEST } from "../test/fixtures.js";
import { applyOp } from "./apply.js";
import { parseOp } from "./parse.js";
import type { AddLocalOp, AddRemoteOp, RegistryOp, RemoveOp, UpdateOp } from "./types.js";

function makeSource(): string {
  const dir = mkdtempSync(join(tmpdir(), "seedr-source-"));
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
  test("copies the source tree, derives the file tree and writes a toolr item", () => {
    const registry = makeRegistry();
    const result = applyOp(registry, addLocalOp({ targetScope: "project", externalUrl: "https://github.com/fork-owner/seedr/tree/main/registry/skills/new-skill" }));

    expect(result.item?.sourceType).toBe("toolr");
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
    const script = join(mkdtempSync(join(tmpdir(), "seedr-hook-")), "guard.sh");
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
    expect(() => applyOp(registry, updateOp(registry, { slug: "gamma", expectedHash: itemStateHash(registry, "skill", "gamma") as string }))).toThrow(/Only toolr items/);
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
    sourceType: "toolr",
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
    expect(() => applyOp(registry, removeOp(registry, { sourceType: "community" }))).toThrow(/is toolr, not community/);
    expect(() => applyOp(registry, removeOp(registry, { slug: "gamma", sourceType: "official", expectedHash: itemStateHash(registry, "skill", "gamma") as string }))).toThrow(/Official items cannot be removed/);
    expect(() => applyOp(registry, removeOp(registry, { slug: "nope", expectedHash: "x" }))).toThrow(/No skill item "nope"/);
    expect(existsSync(join(registry, "skills", "alpha"))).toBe(true);
  });

  test("applyOp is exhaustive over the op kinds", () => {
    const kinds: RegistryOp["kind"][] = ["add-local", "add-remote", "update", "remove"];
    expect(kinds).toHaveLength(4);
  });
});
