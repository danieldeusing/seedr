import { describe, expect, test } from "vitest";
import type { RunOutcome } from "./agent";
import { fs, openPath } from "./fs";
import { getRepo, pickRepo } from "./repo";
import { operationError, opsInvocation } from "./registryCli";
import { onRegistryChanged, REGISTRY_CHANGED, watchRegistry } from "./watch";
import { emit, invoke, listen, onCommand } from "@/test/mockIpc";

/** The wire shape of every IPC call, pinned: a renamed argument here breaks the host. */
describe("IPC serialisation", () => {
  test("filesystem commands send repo-relative paths as `rel`", async () => {
    onCommand("list_dir", () => []);
    onCommand("read_text", () => "text");
    onCommand("path_exists", () => true);
    onCommand("open_path", () => undefined);

    await fs.listDir("registry/skills");
    await fs.readText("registry/skills/pdf/item.json");
    await fs.pathExists("registry");
    await openPath("registry/skills/pdf/SKILL.md");

    expect(invoke.mock.calls).toEqual([
      ["list_dir", { rel: "registry/skills" }],
      ["read_text", { rel: "registry/skills/pdf/item.json" }],
      ["path_exists", { rel: "registry" }],
      ["open_path", { rel: "registry/skills/pdf/SKILL.md" }],
    ]);
  });

  test("repo commands", async () => {
    onCommand("pick_repo", () => ({ root: "/r", name: "r", isDefault: false, hasOps: true, registryDir: "registry" }));
    onCommand("get_repo", () => null);

    expect(await pickRepo()).toEqual({ root: "/r", name: "r", isDefault: false, hasOps: true, registryDir: "registry" });
    expect(await getRepo()).toBeNull();
  });

  test("an unknown command rejects instead of resolving undefined", async () => {
    await expect(fs.readText("anything")).rejects.toThrow(/Unknown IPC command: read_text/);
  });
});

describe("watch", () => {
  test("asks the host to watch, then coalesces a burst of change events into one callback", async () => {
    onCommand("watch_registry", () => undefined);
    await watchRegistry();
    expect(invoke).toHaveBeenCalledWith("watch_registry");

    let calls = 0;
    const unlisten = await onRegistryChanged(() => calls++, 20);
    expect(listen).toHaveBeenCalledWith(REGISTRY_CHANGED, expect.any(Function));
    emit(REGISTRY_CHANGED);
    emit(REGISTRY_CHANGED);
    emit(REGISTRY_CHANGED);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);

    unlisten();
    emit(REGISTRY_CHANGED);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
  });
});

describe("opsInvocation", () => {
  test("runs in the open checkout when it has its own operations CLI", () => {
    expect(opsInvocation({ root: "/work/seedr", hasOps: true }, ["hash", "skill", "pdf"])).toEqual({
      args: ["tsx", "scripts/registry-op.ts", "hash", "skill", "pdf"],
      inDefaultRepo: false,
    });
  });

  test("borrows the default checkout's CLI and points it back, for a fork that predates it", () => {
    expect(opsInvocation({ root: "/work/seedr-internal", hasOps: false }, ["run", "--op", "-"])).toEqual({
      args: ["tsx", "scripts/registry-op.ts", "--repo", "/work/seedr-internal", "run", "--op", "-"],
      inDefaultRepo: true,
    });
  });

  test("with no checkout open there is nothing to point at", () => {
    expect(opsInvocation(null, ["identity"])).toEqual({ args: ["tsx", "scripts/registry-op.ts", "identity"], inDefaultRepo: false });
  });
});

describe("what an operation reports when it fails", () => {
  const outcome = (over: Partial<RunOutcome>): RunOutcome => ({ taskId: "t", status: "failed", exitCode: 1, stdout: "", stderr: "", durationMs: 1, ...over });

  test("is the operation's own line, not the six npm warnings above it", () => {
    // Verbatim from a real run: npx warns about the machine's npm config, and
    // the sentence that says what to do arrived under all of it.
    const noisy = [
      'npm warn Unknown env config "_jsr-registry". This will stop working in the next major version of npm.',
      'npm warn Unknown env config "recursive". This will stop working in the next major version of npm.',
      "registry-op: The worktree has uncommitted changes; commit or stash them first so the operation's diff stays its own",
    ].join("\n");

    expect(operationError(outcome({ stderr: noisy }))).toBe(
      "registry-op: The worktree has uncommitted changes; commit or stash them first so the operation's diff stays its own"
    );
  });

  test("is passed through whole when the CLI did not speak", () => {
    expect(operationError(outcome({ stderr: "tsx: command not found" }))).toBe("tsx: command not found");
    expect(operationError(outcome({ stdout: "something on stdout" }))).toBe("something on stdout");
    expect(operationError(outcome({ exitCode: 3 }))).toBe("exit code 3");
  });
});
