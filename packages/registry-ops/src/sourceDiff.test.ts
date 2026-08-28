import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { applyOp } from "./ops/apply.js";
import { repoRootOf } from "./fsPaths.js";
import { sourceDiff } from "./sourceDiff.js";
import { LONG, makeRegistry } from "./test/fixtures.js";
import { makeTempDir } from "./test/tempDir.js";
import type { AddLocalOp } from "./ops/types.js";

function makeSource(body: string): string {
  const dir = join(makeTempDir("diff-source"), "origin");
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

describe("the direction of the source diff", () => {
  test("a change in the source reads as an addition — it is a change waiting to be applied", () => {
    const registry = makeRegistry();
    const source = makeSource("# Origin\nold line\n");
    applyOp(registry, addOp(source));

    // The folder moves on. Studio's button copies this over the registry copy,
    // so the diff has to read as that operation and not as its inverse.
    writeFileSync(join(source, "SKILL.md"), "# Origin\nnew line\n");

    const diff = sourceDiff(repoRootOf(registry), registry, "skill", "origin-skill");

    expect(diff).toContain("+new line");
    expect(diff).toContain("-old line");
    // The headers name which side is which, and the source is the new one.
    expect(diff).toContain("--- registry/SKILL.md");
    expect(diff).toContain("+++ source/SKILL.md");
  });

  test("an edit made HERE reads as a removal — re-copying would undo it", () => {
    const registry = makeRegistry();
    const source = makeSource("# Origin\nupstream line\n");
    applyOp(registry, addOp(source));

    writeFileSync(join(registry, "skills", "origin-skill", "SKILL.md"), "# Origin\nlocal edit\n");

    const diff = sourceDiff(repoRootOf(registry), registry, "skill", "origin-skill");

    // Red is what the copy would lose, which is exactly what re-copying costs.
    expect(diff).toContain("-local edit");
    expect(diff).toContain("+upstream line");
  });

  test("item.json stays out of it — the folder never had one", () => {
    const registry = makeRegistry();
    const source = makeSource("# Origin\nbody\n");
    applyOp(registry, addOp(source));
    writeFileSync(join(source, "SKILL.md"), "# Origin\nmoved on\n");

    expect(sourceDiff(repoRootOf(registry), registry, "skill", "origin-skill")).not.toContain("item.json");
  });
});
