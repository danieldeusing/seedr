import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { MARKER, setupAgents } from "./setup-agents.mjs";

/** The exact patterns the repo's .gitignore carries — no trailing slash (see the trap test). */
const IGNORE_PATTERNS = ".claude/skills\n.claude/rules\n.claude/agents\n";

let root;

/** A minimal repo: canonical .agents/ with two skills, plus a committed .claude/settings.json. */
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "seedr-setup-agents-"));
  for (const dir of [".agents/skills/alpha", ".agents/skills/beta", ".agents/rules", ".agents/agents", ".claude"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, ".agents/skills/alpha/SKILL.md"), "# alpha\n");
  writeFileSync(join(root, ".agents/skills/beta/SKILL.md"), "# beta\n");
  writeFileSync(join(root, ".agents/rules/one.md"), "# rule\n");
  writeFileSync(join(root, ".agents/agents/reviewer.md"), "# reviewer\n");
  writeFileSync(join(root, ".claude/settings.json"), "{}\n");
  writeFileSync(join(root, ".gitignore"), IGNORE_PATTERNS);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const isLink = (path) => lstatSync(path).isSymbolicLink();
const resolvesTo = (link, target) =>
  assert.equal(realpathSync(join(root, link)), realpathSync(join(root, target)), `${link} → ${target}`);

function gitStatus(repo) {
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  if (!existsSync(join(repo, ".git"))) git("init", "-q");
  return git("status", "--porcelain", "--untracked-files=all");
}

describe("setupAgents", () => {
  test("links rules, agents and every skill, and they resolve", () => {
    const report = setupAgents(root);

    assert.deepEqual(report.linked.sort(), [
      ".claude/agents",
      ".claude/rules",
      ".claude/skills/alpha",
      ".claude/skills/beta",
    ]);
    for (const link of report.linked) assert.ok(isLink(join(root, link)), `${link} is a link`);
    resolvesTo(".claude/rules", ".agents/rules");
    resolvesTo(".claude/agents", ".agents/agents");
    resolvesTo(".claude/skills/alpha", ".agents/skills/alpha");
    resolvesTo(".claude/skills/beta", ".agents/skills/beta");
    // The skills PARENT is a real directory: only per-skill links are documented.
    assert.ok(!isLink(join(root, ".claude/skills")));
  });

  test("is idempotent", () => {
    setupAgents(root);
    const second = setupAgents(root);
    assert.equal(second.linked.length + second.copied.length + second.resynced.length + second.removed.length, 0);
    assert.equal(second.unchanged.length, 4);
  });

  test("git status is clean with the no-trailing-slash ignore patterns", () => {
    setupAgents(root);
    const status = gitStatus(root);
    for (const line of status.split("\n").filter(Boolean)) {
      assert.doesNotMatch(line, /\.claude\/(rules|agents|skills)/, `ignored: ${line}`);
    }
    assert.match(status, /\.claude\/settings\.json/, "the committed settings file still shows up");
  });

  test("trailing-slash patterns leak the directory links (the trap this guards against)", () => {
    writeFileSync(join(root, ".gitignore"), ".claude/skills/\n.claude/rules/\n.claude/agents/\n");
    setupAgents(root);
    const status = gitStatus(root);
    if (process.platform === "win32") {
      // A junction is a directory to git, so even the trailing-slash form hides it —
      // the trap this repo's no-trailing-slash .gitignore guards against is Unix-only,
      // where a symlink is a file and `dir/` patterns miss it.
      assert.doesNotMatch(status, /\.claude\/(rules|agents)/);
    } else {
      assert.match(status, /\?\? \.claude\/rules/);
      assert.match(status, /\?\? \.claude\/agents/);
    }
  });

  test("replaces a dangling link", () => {
    symlinkSync("nowhere", join(root, ".claude/rules"), process.platform === "win32" ? "junction" : "dir");
    const report = setupAgents(root);
    assert.ok(report.linked.includes(".claude/rules"));
    resolvesTo(".claude/rules", ".agents/rules");
  });

  test("re-points a link aimed at the wrong directory", () => {
    symlinkSync(join(root, ".agents/rules"), join(root, ".claude/agents"), process.platform === "win32" ? "junction" : "dir");
    setupAgents(root);
    resolvesTo(".claude/agents", ".agents/agents");
  });

  test("refuses to overwrite a real directory", () => {
    mkdirSync(join(root, ".claude/rules"));
    writeFileSync(join(root, ".claude/rules/mine.md"), "someone's work\n");
    assert.throws(() => setupAgents(root), /real directory/);
    assert.equal(readFileSync(join(root, ".claude/rules/mine.md"), "utf8"), "someone's work\n");
  });

  test("fails loudly when the canonical tree is incomplete", () => {
    rmSync(join(root, ".agents/agents"), { recursive: true });
    assert.throws(() => setupAgents(root), /\.agents\/agents does not exist/);
  });

  test("removes the link of a skill that no longer exists, and leaves real directories alone", () => {
    setupAgents(root);
    mkdirSync(join(root, ".claude/skills/private-local"));
    writeFileSync(join(root, ".claude/skills/private-local/SKILL.md"), "# mine\n");
    rmSync(join(root, ".agents/skills/beta"), { recursive: true });

    const report = setupAgents(root);

    assert.deepEqual(report.removed, [".claude/skills/beta"]);
    assert.ok(!existsSync(join(root, ".claude/skills/beta")));
    assert.ok(existsSync(join(root, ".claude/skills/private-local/SKILL.md")));
  });

  test("falls back to a marker-owned copy when links are refused, and re-syncs on drift", () => {
    const refuse = () => {
      const error = new Error("EPERM: operation not permitted");
      error.code = "EPERM";
      throw error;
    };

    const first = setupAgents(root, { symlink: refuse });
    assert.equal(first.copied.length, 4);
    assert.ok(!isLink(join(root, ".claude/rules")));
    assert.equal(readFileSync(join(root, ".claude/rules/one.md"), "utf8"), "# rule\n");
    assert.ok(existsSync(join(root, ".claude/rules", MARKER)));

    const unchanged = setupAgents(root, { symlink: refuse });
    assert.equal(unchanged.unchanged.length, 4);

    writeFileSync(join(root, ".agents/rules/one.md"), "# rule, revised\n");
    const drifted = setupAgents(root, { symlink: refuse });
    assert.deepEqual(drifted.resynced, [".claude/rules"]);
    assert.equal(readFileSync(join(root, ".claude/rules/one.md"), "utf8"), "# rule, revised\n");
  });

  test("an unexpected symlink error is not swallowed", () => {
    const boom = () => {
      const error = new Error("EIO: disk on fire");
      error.code = "EIO";
      throw error;
    };
    assert.throws(() => setupAgents(root, { symlink: boom }), /EIO/);
  });
});
