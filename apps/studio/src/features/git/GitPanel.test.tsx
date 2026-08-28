import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import type { RunRequest } from "@/api/agent";
import { parsePorcelain } from "@/api/git";
import { mockFs, onCommand } from "@/test/mockIpc";
import { GitPanel } from "./GitPanel";

const ok = (request: RunRequest, stdout: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });

function gitHost(status: string, diff = "") {
  onCommand("run_process", (args) => {
    const request = args?.request as RunRequest;
    if (request.program !== "git") throw new Error(`unexpected program ${request.program}`);
    const sub = request.args[0];
    if (sub === "rev-parse" && request.args.includes("--abbrev-ref")) return ok(request, "main\n");
    if (sub === "rev-parse") return ok(request, "abc1234\n");
    if (sub === "status") return ok(request, status);
    if (sub === "diff") return ok(request, diff);
    throw new Error(`unexpected git ${request.args.join(" ")}`);
  });
}

describe("parsePorcelain", () => {
  test("keeps the two status columns, takes -z paths verbatim and follows renames", () => {
    // -z records: NUL-separated, no quoting; a rename's source is its own record.
    expect(parsePorcelain(" M registry/mcp/manifest.json\0?? new file.md\0?? naïve – path.md\0R  new.md\0old.md\0")).toEqual([
      { status: " M", path: "registry/mcp/manifest.json" },
      { status: "??", path: "new file.md" },
      { status: "??", path: "naïve – path.md" },
      { status: "R ", path: "new.md" },
    ]);
    expect(parsePorcelain("")).toEqual([]);
  });
});

describe("GitPanel", () => {
  test("shows branch, head, the changed paths, a tracked diff and an untracked file's content", async () => {
    gitHost(" M registry/mcp/manifest.json\0?? registry/skills/new/item.json\0", "--- a/x\n+++ b/x\n+changed");
    mockFs({ "registry/skills/new/item.json": '{"slug":"new"}' });
    render(<GitPanel />);

    expect(await screen.findByText("main @ abc1234 · 2 changed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /registry\/mcp\/manifest\.json/ }));
    expect(await screen.findByTestId("git-diff")).toHaveTextContent("+changed");
    // additions succeed, headers recede
    expect(screen.getByText("+changed")).toHaveClass("text-success");
    expect(screen.getByText("+++ b/x")).toHaveClass("text-muted-foreground");

    await userEvent.click(screen.getByRole("button", { name: /registry\/skills\/new\/item\.json/ }));
    expect(await screen.findByTestId("git-diff")).toHaveTextContent('{"slug":"new"}');
  });

  test("says so when the worktree is clean, and surfaces a git failure", async () => {
    gitHost("");
    render(<GitPanel />);
    expect(await screen.findByText(/worktree clean/)).toBeInTheDocument();

    onCommand("run_process", (args) => ({ taskId: (args?.request as RunRequest).taskId, status: "failed", exitCode: 128, stdout: "", stderr: "fatal: not a git repository", durationMs: 1 }));
    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a git repository");
  });
});

describe("porcelain records that are not records", () => {
  test("the executor's trailing newline is not a fourth changed file", () => {
    // Every captured line gets a "\n" appended, and -z output is one line, so
    // the final empty record arrives as "\n": truthy, and sliced to "".
    expect(parsePorcelain(" M a.md\0 M b.md\0 M c.md\0\n")).toEqual([
      { status: " M", path: "a.md" },
      { status: " M", path: "b.md" },
      { status: " M", path: "c.md" },
    ]);
  });
});
