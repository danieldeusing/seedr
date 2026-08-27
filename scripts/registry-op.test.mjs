import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import test, { describe } from "node:test";

// The front door as Studio and the skills actually call it: a child process.
// Read-only commands run against this checkout; the one `run` here fails in
// parseOp, before the lock and the worktree check, so nothing is ever written.
const repoRoot = join(import.meta.dirname, "..");
const cli = (args, input) =>
  spawnSync(process.execPath, [join(repoRoot, "node_modules/tsx/dist/cli.mjs"), join(repoRoot, "scripts/registry-op.ts"), ...args], {
    input,
    encoding: "utf8",
    cwd: repoRoot,
  });

describe("registry-op CLI", () => {
  test("list [type] prints (type, slug, sourceType, name, hash) for every item of the type", () => {
    // The type is taken from the registry rather than named, for the same reason
    // as below: a fork's registry need not hold a skill.
    const [type] = JSON.parse(cli(["list"]).stdout).map((item) => item.type);
    assert.ok(type, "the registry is empty — nothing for this to check");
    const result = cli(["list", type]);
    assert.equal(result.status, 0, result.stderr);
    const items = JSON.parse(result.stdout);
    assert.ok(items.length > 0);
    for (const item of items) {
      assert.equal(item.type, type);
      assert.deepEqual(Object.keys(item), ["type", "slug", "sourceType", "name", "hash"]);
      assert.match(item.hash, /^[0-9a-f]{16}$/);
    }
  });

  test("hash agrees with list, and validate passes for the same item", () => {
    // Whichever type this registry actually holds, rather than a named one: a
    // fork points `registryDir` at a registry of its own, and naming `hook` here
    // failed on `item.slug` of undefined in any fork that has none.
    const [type] = JSON.parse(cli(["list"]).stdout).map((item) => item.type);
    assert.ok(type, "the registry is empty — nothing for this to check");
    const [item] = JSON.parse(cli(["list", type]).stdout);
    const hash = cli(["hash", type, item.slug]);
    assert.equal(hash.status, 0, hash.stderr);
    assert.deepEqual(JSON.parse(hash.stdout), { type, slug: item.slug, hash: item.hash });

    const validate = cli(["validate", type, item.slug]);
    assert.equal(validate.status, 0, validate.stderr);
    assert.deepEqual(JSON.parse(validate.stdout), { type, slug: item.slug, ok: true, errors: [] });
  });

  test("identity derives owner, repo and the externalUrl template from this clone's git", () => {
    const result = cli(["identity"]);
    assert.equal(result.status, 0, result.stderr);
    const identity = JSON.parse(result.stdout);
    const remote = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    assert.ok(remote.includes(`${identity.owner}/${identity.repo}`), `${remote} vs ${identity.owner}/${identity.repo}`);
    if (identity.defaultBranch) {
      assert.match(identity.externalUrlTemplate, /^https:\/\/github\.com\/.+\/tree\/.+\/registry\/skills\/<slug>$/);
    } else {
      // CI checkouts have no refs/remotes/origin/HEAD; the contract is then
      // "no URL at all", never one with a guessed branch.
      assert.equal(identity.externalUrlTemplate, null);
    }
  });

  test("run reads the operation from stdin and refuses a malformed one on stderr with exit 1", () => {
    const result = cli(["run", "--op", "-"], JSON.stringify({ v: 1, kind: "remove" }));
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^registry-op: /);
    assert.match(result.stderr, /Invalid operation/);
  });

  test("unknown commands and unknown types fail with usage, never a stack trace", () => {
    const usage = cli(["frobnicate"]);
    assert.equal(usage.status, 1);
    assert.match(usage.stderr, /usage: run --op/);

    const badType = cli(["list", "widget"]);
    assert.equal(badType.status, 1);
    assert.match(badType.stderr, /unknown type "widget"/);
    assert.doesNotMatch(usage.stderr + badType.stderr, /at .*\.ts:\d/);
  });
});
