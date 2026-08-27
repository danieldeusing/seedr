import { describe, expect, test } from "vitest";
import { applyOp } from "./ops/apply.js";
import { itemStateHash } from "./hash.js";
import { readItem } from "./read.js";
import { LONG, makeRegistry } from "./test/fixtures.js";
import { bumpPatch } from "./version.js";
import type { AddLocalOp } from "./ops/types.js";

const hash = (registry: string, slug = "versioned") => itemStateHash(registry, "skill", slug) as string;

function added(registry: string, sourcePath: string): void {
  applyOp(registry, {
    v: 1, kind: "add-local", type: "skill", slug: "versioned", sourcePath,
    name: "Versioned", description: "Counts up when its content changes.", longDescription: LONG,
    compatibility: ["claude"], author: { name: "Owner" },
  } satisfies AddLocalOp);
}

describe("bumpPatch", () => {
  test("counts up, starts at 1.0.0, and leaves a version it cannot read alone", () => {
    expect(bumpPatch(undefined)).toBe("1.0.0");
    expect(bumpPatch("1.0.0")).toBe("1.0.1");
    expect(bumpPatch("2.4.9")).toBe("2.4.10");
    // An upstream's own scheme is not ours to reinterpret.
    expect(bumpPatch("2026.08.1-rc")).toBe("2026.08.1-rc");
  });
});

describe("the version an item carries", () => {
  test("a new first-party item starts at 1.0.0", () => {
    const registry = makeRegistry();
    added(registry, makeRegistry());
    expect(readItem(registry, "skill", "versioned").version).toBe("1.0.0");
  });

  test("changing the content counts up", () => {
    const registry = makeRegistry();
    added(registry, makeRegistry());

    applyOp(registry, {
      v: 1, kind: "update", type: "skill", slug: "versioned", expectedHash: hash(registry),
      patch: {}, contentEdits: [{ path: "SKILL.md", content: "# Changed\n" }],
    });

    expect(readItem(registry, "skill", "versioned").version).toBe("1.0.1");
  });

  test("renaming it does not, because nothing an install writes has changed", () => {
    const registry = makeRegistry();
    added(registry, makeRegistry());

    applyOp(registry, { v: 1, kind: "update", type: "skill", slug: "versioned", expectedHash: hash(registry), patch: { name: "Renamed" } });

    const item = readItem(registry, "skill", "versioned");
    expect(item.name).toBe("Renamed");
    expect(item.version).toBe("1.0.0");
  });

  test("an explicit version wins, since a minor or a major is a decision", () => {
    const registry = makeRegistry();
    added(registry, makeRegistry());

    applyOp(registry, {
      v: 1, kind: "update", type: "skill", slug: "versioned", expectedHash: hash(registry),
      patch: { version: "2.0.0" }, contentEdits: [{ path: "SKILL.md", content: "# Rewritten\n" }],
    });

    expect(readItem(registry, "skill", "versioned").version).toBe("2.0.0");
  });
});
