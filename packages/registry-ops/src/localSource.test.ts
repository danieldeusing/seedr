import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { applyOp } from "./ops/apply.js";
import { itemStateHash } from "./hash.js";
import { sourceDigest } from "./localSource.js";
import { localSourceOf, sourceStatus } from "./localSources.js";
import { repoRootOf } from "./fsPaths.js";
import { readItem } from "./read.js";
import { LONG, makeRegistry } from "./test/fixtures.js";
import { makeTempDir } from "./test/tempDir.js";
import type { AddLocalOp } from "./ops/types.js";

/** A folder to add a skill from, with one content file. */
function makeSource(body = "# Origin\n"): string {
  const dir = join(makeTempDir("local-source"), "origin");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), body);
  return dir;
}

const addOp = (sourcePath: string): AddLocalOp => ({
  v: 1,
  kind: "add-local",
  type: "skill",
  slug: "origin-skill",
  sourcePath,
  name: "Origin Skill",
  description: "Copied from a folder on this machine.",
  longDescription: LONG,
  compatibility: ["claude"],
  author: { name: "Owner" },
});

const hash = (registry: string) => itemStateHash(registry, "skill", "origin-skill") as string;
/** The origin is recorded in the checkout, not on the item, so the check takes both. */
const status = (registry: string, slug: string) => sourceStatus(repoRootOf(registry), registry, "skill", slug);

describe("where a local item came from", () => {
  test("add-local records the folder, and the item starts in sync with it", () => {
    const registry = makeRegistry();
    const source = makeSource();

    applyOp(registry, addOp(source));
    const item = readItem(registry, "skill", "origin-skill");

    expect(localSourceOf(repoRootOf(registry), "skill", "origin-skill")?.path).toBe(source);
    expect(localSourceOf(repoRootOf(registry), "skill", "origin-skill")?.sourceDigest).toBe(sourceDigest(source));
    expect(status(registry, item.slug).state).toBe("current");
  });

  test("an edit at the source shows the item as behind it", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));

    writeFileSync(join(source, "SKILL.md"), "# Origin, revised\n");

    const found = status(registry, "origin-skill");
    expect(found.state).toBe("behind");
    expect(found.current).not.toBe(found.recorded);
  });

  test("a new file at the source counts as a change", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));

    writeFileSync(join(source, "reference.md"), "extra\n");

    expect(status(registry, "origin-skill").state).toBe("behind");
  });

  test("a folder that is gone is reported as missing, not as unchanged", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));

    rmSync(source, { recursive: true, force: true });

    const found = status(registry, "origin-skill");
    expect(found.state).toBe("missing");
    expect(found.path).toBe(source);
  });

  test("an item with no recorded source is nobody's copy", () => {
    expect(status(makeRegistry(), "nothing-here").state).toBe("none");
  });
});

describe("resync-source", () => {
  test("brings the content across again and clears the difference", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));
    writeFileSync(join(source, "SKILL.md"), "# Origin, revised\n");
    writeFileSync(join(source, "reference.md"), "extra\n");

    applyOp(registry, { v: 1, kind: "resync-source", type: "skill", slug: "origin-skill", expectedHash: hash(registry) });

    const item = readItem(registry, "skill", "origin-skill");
    expect(status(registry, item.slug).state).toBe("current");
    expect(item.contents?.files?.map((file) => file.name).sort()).toEqual(["SKILL.md", "reference.md"]);
  });

  test("a file deleted at the source is dropped, not left behind", () => {
    const registry = makeRegistry();
    const source = makeSource();
    writeFileSync(join(source, "reference.md"), "extra\n");
    applyOp(registry, addOp(source));
    rmSync(join(source, "reference.md"));

    applyOp(registry, { v: 1, kind: "resync-source", type: "skill", slug: "origin-skill", expectedHash: hash(registry) });

    expect(readItem(registry, "skill", "origin-skill").contents?.files?.map((file) => file.name)).toEqual(["SKILL.md"]);
  });

  test("refuses a source that is gone, and says what to do instead", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));
    rmSync(source, { recursive: true, force: true });

    expect(() => applyOp(registry, { v: 1, kind: "resync-source", type: "skill", slug: "origin-skill", expectedHash: hash(registry) })).toThrow(/adopt the item instead/);
  });

  test("refuses a stale hash, like every other operation on an item", () => {
    const registry = makeRegistry();
    applyOp(registry, addOp(makeSource()));

    expect(() => applyOp(registry, { v: 1, kind: "resync-source", type: "skill", slug: "origin-skill", expectedHash: "0000000000000000" })).toThrow(/changed since it was read/);
  });
});

describe("adopt-source", () => {
  test("drops the origin, and the item stops being compared to anything", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));

    applyOp(registry, { v: 1, kind: "adopt-source", type: "skill", slug: "origin-skill", expectedHash: hash(registry) });

    const item = readItem(registry, "skill", "origin-skill");
    expect(localSourceOf(repoRootOf(registry), "skill", "origin-skill")).toBeUndefined();
    expect(status(registry, item.slug).state).toBe("none");
    // The content stays exactly as it was — adopting takes it over, not away.
    expect(item.contents?.files?.map((file) => file.name)).toEqual(["SKILL.md"]);
  });

  test("refuses an item that records no source", () => {
    const registry = makeRegistry();
    applyOp(registry, addOp(makeSource()));
    applyOp(registry, { v: 1, kind: "adopt-source", type: "skill", slug: "origin-skill", expectedHash: hash(registry) });

    expect(() => applyOp(registry, { v: 1, kind: "adopt-source", type: "skill", slug: "origin-skill", expectedHash: hash(registry) })).toThrow(/records no source/);
  });
});

describe("a single file as the source", () => {
  test("copies just that file, and tracks it like a folder", () => {
    // A `.claude/skills/` folder holds several unrelated skills; only one of them
    // is the item. Picking the file copies that one, under its own name.
    const registry = makeRegistry();
    const folder = makeSource("# One of several\n");
    writeFileSync(join(folder, "another-skill.md"), "# Not this one\n");
    const file = join(folder, "SKILL.md");

    applyOp(registry, { ...addOp(file), slug: "one-file" });
    const item = readItem(registry, "skill", "one-file");

    expect(item.contents?.files?.map((entry) => entry.name)).toEqual(["SKILL.md"]);
    expect(localSourceOf(repoRootOf(registry), "skill", "one-file")?.path).toBe(file);
    expect(status(registry, item.slug).state).toBe("current");

    // And it is tracked: editing that file alone shows the item as behind.
    writeFileSync(file, "# One of several, revised\n");
    expect(status(registry, "one-file").state).toBe("behind");
  });
});

describe("the copy in the registry can move too", () => {
  test("an edit made here, with the source untouched, is `edited` and not `behind`", () => {
    // Different problems: `behind` is content waiting to be pulled, `edited` is
    // work that pulling would overwrite. Calling both "out of date" would offer
    // to destroy the second.
    const registry = makeRegistry();
    applyOp(registry, addOp(makeSource()));

    writeFileSync(join(registry, "skills", "origin-skill", "SKILL.md"), "# Edited here\n");

    expect(status(registry, "origin-skill").state).toBe("edited");
  });

  test("both moving is `diverged`, which is the one state that loses something either way", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));

    writeFileSync(join(source, "SKILL.md"), "# Changed at the source\n");
    writeFileSync(join(registry, "skills", "origin-skill", "SKILL.md"), "# And changed here\n");

    expect(status(registry, "origin-skill").state).toBe("diverged");
  });

  test("the origin is kept out of item.json, which is committed and served", () => {
    const registry = makeRegistry();
    applyOp(registry, addOp(makeSource()));

    // An absolute path from one machine means nothing in another checkout, and
    // a public instance would publish it.
    expect(JSON.stringify(readItem(registry, "skill", "origin-skill"))).not.toContain(makeTempDir("local-source").split("/")[1]);
    expect(readItem(registry, "skill", "origin-skill")).not.toHaveProperty("localSource");
    expect(existsSync(join(repoRootOf(registry), ".seedr", "local-sources.json"))).toBe(true);
  });
});

describe("removing an item", () => {
  test("takes its origin with it, so the next item of that name inherits nothing", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));
    expect(localSourceOf(repoRootOf(registry), "skill", "origin-skill")).toBeDefined();

    applyOp(registry, { v: 1, kind: "remove", type: "skill", slug: "origin-skill", sourceType: "seedr", expectedHash: hash(registry) });

    expect(localSourceOf(repoRootOf(registry), "skill", "origin-skill")).toBeUndefined();
  });
});
