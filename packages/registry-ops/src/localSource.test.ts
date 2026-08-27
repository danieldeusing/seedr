import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { applyOp } from "./ops/apply.js";
import { itemStateHash } from "./hash.js";
import { sourceDigest, sourceStatus } from "./localSource.js";
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

describe("where a local item came from", () => {
  test("add-local records the folder, and the item starts in sync with it", () => {
    const registry = makeRegistry();
    const source = makeSource();

    applyOp(registry, addOp(source));
    const item = readItem(registry, "skill", "origin-skill");

    expect(item.localSource?.path).toBe(source);
    expect(item.localSource?.digest).toBe(sourceDigest(source));
    expect(sourceStatus(item).state).toBe("current");
  });

  test("an edit at the source shows the item as behind it", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));

    writeFileSync(join(source, "SKILL.md"), "# Origin, revised\n");

    const status = sourceStatus(readItem(registry, "skill", "origin-skill"));
    expect(status.state).toBe("behind");
    expect(status.current).not.toBe(status.recorded);
  });

  test("a new file at the source counts as a change", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));

    writeFileSync(join(source, "reference.md"), "extra\n");

    expect(sourceStatus(readItem(registry, "skill", "origin-skill")).state).toBe("behind");
  });

  test("a folder that is gone is reported as missing, not as unchanged", () => {
    const registry = makeRegistry();
    const source = makeSource();
    applyOp(registry, addOp(source));

    rmSync(source, { recursive: true, force: true });

    const status = sourceStatus(readItem(registry, "skill", "origin-skill"));
    expect(status.state).toBe("missing");
    expect(status.path).toBe(source);
  });

  test("an item with no recorded source is nobody's copy", () => {
    expect(sourceStatus({}).state).toBe("none");
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
    expect(sourceStatus(item).state).toBe("current");
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
    expect(item.localSource).toBeUndefined();
    expect(sourceStatus(item).state).toBe("none");
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
