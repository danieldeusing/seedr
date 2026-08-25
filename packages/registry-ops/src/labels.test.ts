import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ComponentType, LabelDefinition } from "@seedr/shared";
import { compileRegistry } from "./compile.js";
import { labelsPath } from "./fsPaths.js";
import { itemStateHash } from "./hash.js";
import { LABELS_VERSION, LABEL_COLORS, isLabelSlug, parseLabels } from "./labels.js";
import { applyOp } from "./ops/apply.js";
import { parseOp } from "./ops/parse.js";
import type { AddLocalOp, SetLabelsOp, UpdateOp } from "./ops/types.js";
import { readIndex, readItem, readLabels, readTypeManifest } from "./read.js";
import { LONG, git, makeRegistry, makeRepo } from "./test/fixtures.js";
import { makeTempDir } from "./test/tempDir.js";
import { runRegistryTransaction } from "./tx.js";
import { validateItem } from "./validate.js";

const PROJECT_X: LabelDefinition = { slug: "project-x", name: "Project X", color: "violet" };
const GENERAL: LabelDefinition = { slug: "general", name: "General", color: "neutral" };

function writeLabels(registryDir: string, labels: readonly LabelDefinition[]): void {
  writeFileSync(labelsPath(registryDir), JSON.stringify({ version: LABELS_VERSION, labels }, null, 2) + "\n");
}

function makeSource(): string {
  const dir = makeTempDir("seedr-label-source-");
  writeFileSync(join(dir, "SKILL.md"), "# Labelled\n");
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
  compatibility: ["claude"],
  author: { name: "Fork Owner" },
  ...overrides,
});

const setLabelsOp = (labels: LabelDefinition[]): SetLabelsOp => ({ v: 1, kind: "set-labels", labels });

const updateOp = (registry: string, patch: UpdateOp["patch"], target: { type: ComponentType; slug: string } = { type: "skill", slug: "alpha" }): UpdateOp => ({
  v: 1,
  kind: "update",
  ...target,
  expectedHash: itemStateHash(registry, target.type, target.slug) as string,
  patch,
});

describe("the label vocabulary", () => {
  test("the colours are exactly the web app's badge accents", () => {
    // apps/web/src/lib/colors.ts `BadgeColor`: a label picks its colour here and
    // every surface renders it, so the two lists have to stay identical.
    expect([...LABEL_COLORS]).toEqual(["neutral", "green", "red", "blue", "orange", "purple", "amber", "emerald", "indigo", "teal", "violet", "pink"]);
  });

  test("a label slug is a slug like an item's", () => {
    expect(isLabelSlug("project-x")).toBe(true);
    expect(isLabelSlug("x9")).toBe(true);
    expect(isLabelSlug("Project X")).toBe(false);
    expect(isLabelSlug("-leading")).toBe(false);
    expect(isLabelSlug(7)).toBe(false);
  });
});

describe("parseLabels", () => {
  test("reads a valid catalogue", () => {
    expect(parseLabels({ version: 1, labels: [PROJECT_X, GENERAL] })).toEqual([PROJECT_X, GENERAL]);
    expect(parseLabels({ version: 1, labels: [] })).toEqual([]);
  });

  test("a malformed catalogue is an error, never a silently empty list", () => {
    expect(() => parseLabels(null)).toThrow(/must be a JSON object/);
    expect(() => parseLabels({ labels: [] })).toThrow(/unsupported version undefined/);
    expect(() => parseLabels({ version: 2, labels: [] })).toThrow(/unsupported version 2/);
    expect(() => parseLabels({ version: 1 })).toThrow(/"labels" must be an array/);
    expect(() => parseLabels({ version: 1, labels: ["project-x"] })).toThrow(/labels\[0\] must be an object/);
    expect(() => parseLabels({ version: 1, labels: [{ ...PROJECT_X, slug: "Project X" }] })).toThrow(/labels\[0\]\.slug "Project X" is not a valid slug/);
    expect(() => parseLabels({ version: 1, labels: [{ ...PROJECT_X, name: " " }] })).toThrow(/labels\[0\]\.name must be a non-empty string/);
    expect(() => parseLabels({ version: 1, labels: [{ ...PROJECT_X, color: "chartreuse" }] })).toThrow(/labels\[0\]\.color "chartreuse" must be one of/);
    expect(() => parseLabels({ version: 1, labels: [{ ...PROJECT_X, icon: "star" }] })).toThrow(/labels\[0\] has an unknown field "icon"/);
    expect(() => parseLabels({ version: 1, labels: [PROJECT_X, { ...PROJECT_X, name: "Again" }] })).toThrow(/duplicate label slug "project-x"/);
  });
});

describe("readLabels", () => {
  test("a checkout from before labels existed simply has none", () => {
    expect(readLabels(makeRegistry())).toEqual([]);
  });

  test("reads the catalogue from disk and refuses a broken one", () => {
    const registry = makeRegistry();
    writeLabels(registry, [PROJECT_X]);
    expect(readLabels(registry)).toEqual([PROJECT_X]);

    writeFileSync(labelsPath(registry), '{ "version": 1, "labels": [{ "slug": "x" }] }\n');
    expect(() => readLabels(registry)).toThrow(/labels\[0\]\.name/);
  });
});

describe("validateItem", () => {
  test("accepts a label when absent or a slug, and never consults the catalogue", () => {
    const registry = makeRegistry();
    const item = readItem(registry, "skill", "alpha");
    expect(validateItem({ ...item, label: PROJECT_X.slug })).toEqual([]);
    // No labels.json exists here: shape only, so the pure validator runs in the webview.
    expect(validateItem({ ...item, label: "Project X" })).toEqual([{ field: "label", message: 'must be a label slug when present (got "Project X")' }]);
  });
});

describe("set-labels", () => {
  test("parseOp takes a catalogue operation without a (type, slug) key", () => {
    expect(parseOp(setLabelsOp([PROJECT_X])).kind).toBe("set-labels");
    expect(() => parseOp({ v: 1, kind: "set-labels" })).toThrow(/"labels" must be an array/);
  });

  test("adds labels, then renames one while items keep pointing at its slug", () => {
    const registry = makeRegistry();
    const added = applyOp(registry, setLabelsOp([PROJECT_X, GENERAL]));
    expect(added.labels).toEqual([PROJECT_X, GENERAL]);
    expect(readLabels(registry)).toEqual([PROJECT_X, GENERAL]);

    applyOp(registry, updateOp(registry, { label: PROJECT_X.slug }));

    const renamed: LabelDefinition = { ...PROJECT_X, name: "Project Ten", color: "teal" };
    expect(applyOp(registry, setLabelsOp([renamed, GENERAL])).labels).toEqual([renamed, GENERAL]);
    expect(readItem(registry, "skill", "alpha").label).toBe(PROJECT_X.slug);
  });

  test("refuses to drop a label items still carry, naming them", () => {
    const registry = makeRegistry();
    applyOp(registry, setLabelsOp([PROJECT_X, GENERAL]));
    applyOp(registry, updateOp(registry, { label: PROJECT_X.slug }));
    applyOp(registry, updateOp(registry, { label: PROJECT_X.slug }, { type: "mcp", slug: "delta" }));

    expect(() => applyOp(registry, setLabelsOp([GENERAL]))).toThrow(/Refusing to drop 1 label\(s\) items still carry: "project-x" \(skill\/alpha, mcp\/delta\)/);
    expect(readLabels(registry)).toEqual([PROJECT_X, GENERAL]);
  });

  test("refuses a malformed catalogue before writing anything", () => {
    const registry = makeRegistry();
    expect(() => applyOp(registry, setLabelsOp([{ ...PROJECT_X, color: "chartreuse" as never }]))).toThrow(/labels\[0\]\.color/);
    expect(existsSync(labelsPath(registry))).toBe(false);
  });
});

describe("items carrying a label", () => {
  test("an add is refused when the catalogue does not define the label", () => {
    const registry = makeRegistry();
    writeLabels(registry, [PROJECT_X]);
    expect(() => applyOp(registry, addLocalOp({ label: "project-z" }))).toThrow(/Unknown label "project-z": registry\/labels\.json defines project-x/);
    expect(existsSync(join(registry, "skills", "new-skill"))).toBe(false);

    expect(applyOp(registry, addLocalOp({ label: PROJECT_X.slug })).item?.label).toBe(PROJECT_X.slug);
  });

  test("an add against a registry with no catalogue at all names that", () => {
    const registry = makeRegistry();
    expect(() => applyOp(registry, addLocalOp({ label: PROJECT_X.slug }))).toThrow(/registry\/labels\.json defines none/);
  });

  test("an update sets the label, clears it with null, and is refused for an unknown one", () => {
    const registry = makeRegistry();
    writeLabels(registry, [PROJECT_X]);

    expect(() => applyOp(registry, updateOp(registry, { label: "project-z" }))).toThrow(/Unknown label "project-z"/);
    expect(readItem(registry, "skill", "alpha").label).toBeUndefined();

    expect(applyOp(registry, updateOp(registry, { label: PROJECT_X.slug })).item?.label).toBe(PROJECT_X.slug);
    // A patch that says nothing about the label leaves it alone.
    expect(applyOp(registry, updateOp(registry, { name: "Alpha 2" })).item?.label).toBe(PROJECT_X.slug);
    expect(applyOp(registry, updateOp(registry, { label: null })).item?.label).toBeUndefined();
    expect(Object.hasOwn(readItem(registry, "skill", "alpha"), "label")).toBe(false);
  });
});

describe("compile", () => {
  test("copies the catalogue into the index and keeps each item's label on its card", () => {
    const registry = makeRegistry();
    writeLabels(registry, [PROJECT_X, GENERAL]);
    applyOp(registry, updateOp(registry, { label: GENERAL.slug }));

    compileRegistry(registry);
    expect(readIndex(registry).labels).toEqual([PROJECT_X, GENERAL]);
    expect(readTypeManifest(registry, "skill").items.find((item) => item.slug === "alpha")?.label).toBe(GENERAL.slug);
  });

  test("an index compiled without a catalogue carries an empty list", () => {
    const registry = makeRegistry();
    compileRegistry(registry);
    expect(readIndex(registry).labels).toEqual([]);
  });

  test("a broken catalogue fails the compile rather than compiling without labels", () => {
    const registry = makeRegistry();
    writeFileSync(labelsPath(registry), '{ "version": 9, "labels": [] }\n');
    expect(() => compileRegistry(registry)).toThrow(/unsupported version 9/);
  });
});

describe("the set-labels transaction", () => {
  test("writes the catalogue and the index, and nothing else", async () => {
    const repo = makeRepo();
    const { result, changedPaths } = await runRegistryTransaction(setLabelsOp([PROJECT_X]), { repoRoot: repo });

    expect(result).toEqual({ kind: "set-labels", item: null, labels: [PROJECT_X] });
    expect(changedPaths.sort()).toEqual(["registry/labels.json", "registry/manifest.json"]);
    expect(readIndex(join(repo, "registry")).labels).toEqual([PROJECT_X]);
  });

  test("rolls the catalogue back when the operation is refused", async () => {
    const repo = makeRepo();
    const registry = join(repo, "registry");
    writeLabels(registry, [PROJECT_X]);
    writeFileSync(join(registry, "skills", "alpha", "item.json"), JSON.stringify({ ...readItem(registry, "skill", "alpha"), label: PROJECT_X.slug }, null, 2) + "\n");
    compileRegistry(registry);
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "labelled");

    await expect(runRegistryTransaction(setLabelsOp([GENERAL]), { repoRoot: repo })).rejects.toThrow(/Refusing to drop/);
    expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");
    expect(readLabels(registry)).toEqual([PROJECT_X]);
  });

  test("an item operation may not touch the catalogue", async () => {
    const repo = makeRepo();
    const stray = join(repo, "registry", "labels.json");
    let statusCalls = 0;
    const runner = async (args: string[], cwd: string) => {
      // The stray write belongs to the operation: after the clean-worktree precondition passed.
      if (args[0] === "status" && ++statusCalls === 2) writeFileSync(stray, '{ "version": 1, "labels": [] }\n');
      return git(cwd, ...args);
    };
    await expect(runRegistryTransaction(addLocalOp(), { repoRoot: repo, git: runner })).rejects.toThrow(/outside its allowlist: registry\/labels\.json/);
    expect(existsSync(stray)).toBe(false);
  });
});
