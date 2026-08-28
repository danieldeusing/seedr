import { describe, expect, test } from "vitest";
import type { RunRequest } from "@/api/agent";
import { gitRemoteState } from "@/api/git";
import { onCommand } from "@/test/mockIpc";

const ok = (request: RunRequest, stdout = "") => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });
const failed = (request: RunRequest, stderr: string) => ({ taskId: request.taskId, status: "ok", exitCode: 1, stdout: "", stderr, durationMs: 1 });

/** A git that answers the three questions gitRemoteState asks, each overridable. */
function gitHost(options: { upstream?: string | null; counts?: string; fetchError?: string }) {
  const { upstream = "origin/main", counts = "0\t0", fetchError } = options;
  onCommand("run_process", (args) => {
    const request = args?.request as RunRequest;
    if (request.program !== "git") throw new Error(`unexpected program ${request.program}`);
    const sub = request.args[0];
    if (sub === "rev-parse") return upstream === null ? failed(request, "no upstream configured") : ok(request, `${upstream}\n`);
    if (sub === "fetch") return fetchError === undefined ? ok(request) : failed(request, fetchError);
    if (sub === "rev-list") return ok(request, `${counts}\n`);
    throw new Error(`unexpected git ${request.args.join(" ")}`);
  });
}

describe("where the checkout stands against its tracking branch", () => {
  test("counts what a pull would bring and what this host has not pushed", async () => {
    // rev-list --left-right --count <upstream>...HEAD: left is behind, right ahead.
    gitHost({ counts: "3\t2" });
    expect(await gitRemoteState()).toEqual({ upstream: "origin/main", behind: 3, ahead: 2, fetched: true, fetchError: null });
  });

  test("level with the upstream is behind 0, ahead 0 — and says the fetch got through", async () => {
    gitHost({ counts: "0\t0" });
    expect(await gitRemoteState()).toMatchObject({ behind: 0, ahead: 0, fetched: true });
  });

  test("a failed fetch is never reported as up to date", async () => {
    // The whole point: a checkout that could not ask must not answer "current".
    gitHost({ counts: "0\t0", fetchError: "could not resolve host github.com" });
    const state = await gitRemoteState();
    expect(state.fetched).toBe(false);
    expect(state.fetchError).toContain("could not resolve host");
  });

  test("compares against whatever the branch tracks, not a name written in the code", async () => {
    gitHost({ upstream: "origin/prod", counts: "1\t0" });
    expect(await gitRemoteState()).toMatchObject({ upstream: "origin/prod", behind: 1 });
  });

  test("a branch with no upstream has nothing to be behind, and is not an error", async () => {
    gitHost({ upstream: null });
    expect(await gitRemoteState()).toEqual({ upstream: null, behind: 0, ahead: 0, fetched: false, fetchError: null });
  });
});
