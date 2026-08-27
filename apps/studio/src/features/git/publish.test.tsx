import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import type { RunRequest } from "@/api/agent";
import { onCommand } from "@/test/mockIpc";
import { GitPanel } from "./GitPanel";
import { PUBLISH_JOB_CAPABILITIES, publishPrompt, readVerdict, usePublish } from "./publishStore";
import { pushBranches } from "./workflows";

const BRANCHES = ["*\tmain\torigin/main", " \tprod\torigin/prod", " \tfeat/x\t"].join("\n");
const STATUS = ["1 M  packages/cli/src/cli.ts", "1 ?? notes.md"].map((line) => line.slice(2)).join("\0");

const plan = { source: "main", targets: ["main", "prod"], message: "", notes: "", changes: [{ status: " M", path: "a.ts" }] };

/** A host where git answers, and `claude` returns whatever the test scripts. */
function host(claudeStdout: string, onRun?: (request: RunRequest) => void) {
  const ok = (taskId: string, stdout: string) => ({ taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });
  onCommand("run_process", (args) => {
    const request = (args as { request: RunRequest }).request;
    onRun?.(request);
    if (request.program === "claude") return ok(request.taskId, claudeStdout);
    if (request.args[0] === "for-each-ref") return ok(request.taskId, BRANCHES);
    if (request.args[0] === "status") return ok(request.taskId, `${STATUS}\0`);
    if (request.args.includes("--abbrev-ref")) return ok(request.taskId, "main\n");
    return ok(request.taskId, "abc1234\n");
  });
  onCommand("path_exists", () => true);
  onCommand("list_dir", () => [{ name: "deploy.yml", kind: "file" }]);
  onCommand("read_text", () => "on:\n  push:\n    branches: [prod]\n  workflow_dispatch:\n\njobs:\n  deploy:\n");
}

beforeEach(() => {
  usePublish.getState().reset();
});

describe("publish prompt and verdict", () => {
  test("states the branches, the repo's git rules and the line it must end with", () => {
    const prompt = publishPrompt({ ...plan, notes: "skip registry/" });
    expect(prompt).toContain("checked out (main)");
    expect(prompt).toContain("then bring it to: prod");
    expect(prompt).toContain("Never cherry-pick between branches");
    expect(prompt).toContain("Never use --no-verify");
    expect(prompt).toContain("skip registry/");
    expect(prompt).toContain("Write the commit message yourself");
    expect(prompt).toContain("PUBLISHED <branch>");
    expect(publishPrompt({ ...plan, targets: ["main"], message: "fix: a thing" })).toContain("Commit message: fix: a thing");
  });

  test("reads back what the agent says it did", () => {
    expect(readVerdict("blah\nPUBLISHED main, prod")).toEqual({ kind: "published", branches: ["main", "prod"] });
    expect(readVerdict("STOPPED conflict in registry/manifest.json")).toEqual({ kind: "stopped", reason: "conflict in registry/manifest.json" });
    expect(readVerdict("I did some things")).toEqual({ kind: "unclear", text: "I did some things" });
  });

  test("the job may run git, and may not run anything else", () => {
    expect(PUBLISH_JOB_CAPABILITIES).toContain("shell:git");
    expect(PUBLISH_JOB_CAPABILITIES.join(" ")).not.toContain("npx");
    expect(PUBLISH_JOB_CAPABILITIES).not.toContain("web");
  });
});

describe("pushBranches", () => {
  test("finds the branches a push trigger names, in both YAML shapes", () => {
    expect(pushBranches("on:\n  push:\n    branches: [prod]\n  workflow_dispatch:\n")).toEqual(["prod"]);
    expect(pushBranches("on:\n  push:\n    branches:\n      - main\n      - 'release/*'\n\njobs:\n  a:\n")).toEqual(["main", "release/*"]);
    expect(pushBranches("on:\n  schedule:\n    - cron: '0 6 * * *'\n")).toEqual([]);
  });
});

describe("PublishPanel", () => {
  test("warns which chosen branch starts a workflow, and only runs after a second click", async () => {
    const requests: RunRequest[] = [];
    host(JSON.stringify({ type: "result", is_error: false, result: "PUBLISHED main, prod" }), (request) => requests.push(request));
    render(<GitPanel />);

    await userEvent.click(await screen.findByRole("button", { name: "publish" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /prod/ }));

    expect(await screen.findByText(/This push starts prod → deploy.yml/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "commit and push" }));
    expect(requests.some((request) => request.program === "claude")).toBe(false);
    expect(screen.getByText(/Commit on main and push to main, prod/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "commit and push to main, prod" }));

    await waitFor(() => expect(screen.getByText("Pushed to main, prod.")).toBeInTheDocument());
    const job = requests.find((request) => request.program === "claude");
    expect(job?.args.at(-1)).toBe("Read,Write,Edit,Glob,Grep,Bash(git:*)");
    expect(job?.stdin).toContain("then bring it to: prod");
  });

  test("a clean worktree offers nothing to push", async () => {
    const ok = (taskId: string, stdout: string) => ({ taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      if (request.args[0] === "for-each-ref") return ok(request.taskId, BRANCHES);
      if (request.args[0] === "status") return ok(request.taskId, "");
      if (request.args.includes("--abbrev-ref")) return ok(request.taskId, "main\n");
      return ok(request.taskId, "abc1234\n");
    });
    onCommand("path_exists", () => false);
    render(<GitPanel />);

    await userEvent.click(await screen.findByRole("button", { name: "publish" }));

    expect(await screen.findByText("nothing to commit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "commit and push" })).toBeDisabled();
  });

  test("a refused tool is reported with what it asked for", async () => {
    host(JSON.stringify({ type: "result", is_error: true, result: "could not push", permission_denials: [{ tool_name: "WebFetch" }] }));
    render(<GitPanel />);

    await userEvent.click(await screen.findByRole("button", { name: "publish" }));
    await userEvent.click(await screen.findByRole("button", { name: "commit and push" }));
    await userEvent.click(screen.getByRole("button", { name: "commit and push to main" }));

    expect(await screen.findByText(/could not push \(it asked for WebFetch/)).toBeInTheDocument();
  });
});

  test("names origin and how a branch with no upstream is first pushed", () => {
    // The panel marks such a branch `·new` and its hover promises an upstream
    // will be set. Nothing in the prompt said so, which left the promise resting
    // on the agent's instinct — and a plain `git push` there fails.
    const prompt = publishPrompt({ source: "main", targets: ["main"], message: "", notes: "", changes: [] });
    expect(prompt).toMatch(/push -u origin/);
    expect(prompt).toMatch(/Push to `origin`/);
  });

describe("reading a real publish run's answer", () => {
  test("finds the verdict after the agent's own summary table", () => {
    // Verbatim from the run of 2026-08-27, which committed and pushed for real.
    const said = [
      "| # | Task | Status | Notes |",
      "| --- | --- | --- | --- |",
      "| 1 | Commit `ESTATE.md` on `main` | ✅ done | One changed path, as expected |",
      "",
      "2 of 2 done. Working tree clean, still on `main`, commit `1896305`.",
      "",
      "PUBLISHED main",
    ].join("\n");

    expect(readVerdict(said)).toEqual({ kind: "published", branches: ["main"] });
  });
});
