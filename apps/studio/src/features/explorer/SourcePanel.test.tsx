import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RunRequest } from "@/api/agent";
import { onCommand } from "@/test/mockIpc";
import { useStudio } from "./store";
import { SourcePanel } from "./SourcePanel";
import type { StudioItem } from "./registry";

const ITEM: StudioItem = {
  type: "skill",
  slug: "origin-skill",
  dir: "registry/skills/origin-skill",
  item: { slug: "origin-skill", name: "Origin Skill", type: "skill", description: "A copy.", compatibility: ["claude"], sourceType: "seedr" },
  errors: [],
};

const SOURCE = "/Users/someone/work/origin";

/** A host answering `source-status` with the given state, collecting any op run. */
function host(state: string, ops: RunRequest[] = []) {
  onCommand("run_process", (args) => {
    const request = (args as { request: RunRequest }).request;
    ops.push(request);
    const answer = request.args.includes("source-status")
      ? { type: "skill", slug: "origin-skill", state, path: SOURCE, recorded: "a".repeat(64), current: state === "behind" ? "b".repeat(64) : null }
      : { ok: true, kind: request.args.includes("adopt-source") ? "adopt-source" : "resync-source", changedPaths: [], headBefore: "abc1234", hash: "0123456789abcdef" };
    return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: JSON.stringify(answer), stderr: "", durationMs: 1 };
  });
  return ops;
}

beforeEach(() => {
  useStudio.setState({ repo: { root: "/repo", name: "repo", isDefault: true, hasOps: true, registryDir: "registry" }, refresh: vi.fn(async () => undefined) });
});

describe("where an item was copied from", () => {
  test("says nothing at all when the item records no source", async () => {
    host("none");
    const { container } = render(<SourcePanel item={ITEM} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test("says nothing for a synced item, which is upstream's rather than a copy", () => {
    host("current");
    const synced: StudioItem = { ...ITEM, item: { ...ITEM.item, sourceType: "community" } };
    const { container } = render(<SourcePanel item={synced} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("shows the folder and reports it in sync", async () => {
    host("current");
    render(<SourcePanel item={ITEM} />);
    expect(await screen.findByText(SOURCE)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("in sync");
    // Nothing to pull when there is no difference.
    expect(screen.queryByRole("button", { name: "copy the changes across" })).toBeNull();
  });

  test("offers to copy the changes across when the folder has moved on", async () => {
    const ops = host("behind");
    render(<SourcePanel item={ITEM} />);

    await userEvent.click(await screen.findByRole("button", { name: "copy the changes across" }));

    await waitFor(() => expect(ops.some((op) => op.stdin?.includes('"resync-source"'))).toBe(true));
    // Hash-guarded like every other operation on an item.
    const resync = ops.find((op) => op.stdin?.includes('"resync-source"'))!;
    expect(JSON.parse(resync.stdin!).expectedHash).toBe("0123456789abcdef");
  });

  test("a missing folder is named as gone, and only adopting is offered", async () => {
    host("missing");
    render(<SourcePanel item={ITEM} />);
    expect(await screen.findByRole("status")).toHaveTextContent("source is gone");
    expect(screen.queryByRole("button", { name: "copy the changes across" })).toBeNull();
    expect(screen.getByRole("button", { name: "adopt this item" })).toBeInTheDocument();
  });

  test("adopting takes two clicks, because the path is recorded nowhere else", async () => {
    const ops = host("missing");
    render(<SourcePanel item={ITEM} />);

    await userEvent.click(await screen.findByRole("button", { name: "adopt this item" }));
    expect(ops.some((op) => op.stdin?.includes("adopt-source"))).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "confirm adopting the item" }));
    await waitFor(() => expect(ops.some((op) => op.stdin?.includes('"adopt-source"'))).toBe(true));
  });

  test("a refusal from the transaction is shown as it was worded", async () => {
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      // Only the transaction refuses; the reads before it answer normally, or the
      // message under test would be the wrong step's.
      if (request.args.includes("source-status")) {
        return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: JSON.stringify({ state: "behind", path: SOURCE }), stderr: "", durationMs: 1 };
      }
      if (request.args.includes("hash")) {
        return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: JSON.stringify({ hash: "0123456789abcdef" }), stderr: "", durationMs: 1 };
      }
      return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: "registry-op: worktree has uncommitted changes", durationMs: 1 };
    });
    render(<SourcePanel item={ITEM} />);

    await userEvent.click(await screen.findByRole("button", { name: "copy the changes across" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/uncommitted changes/);
  });
});

describe("noticing that the folder moved on", () => {
  test("re-checks when the window comes back, which is when the file was just edited", async () => {
    let state = "current";
    const asked: string[] = [];
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      asked.push(request.args.join(" "));
      return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: JSON.stringify({ state, path: SOURCE }), stderr: "", durationMs: 1 };
    });

    render(<SourcePanel item={ITEM} />);
    expect(await screen.findByRole("status")).toHaveTextContent("in sync");

    // The file is edited in another window; nothing watches it, so nothing knows.
    state = "behind";
    expect(screen.getByRole("status")).toHaveTextContent("in sync");

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("source has changes"));
  });

  test("and on demand, without leaving the item", async () => {
    let state = "current";
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      const answer = request.args.includes("source-status") && !request.args.includes("origin-skill") ? { items: [] } : { state, path: SOURCE };
      return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: JSON.stringify(answer), stderr: "", durationMs: 1 };
    });

    render(<SourcePanel item={ITEM} />);
    await screen.findByRole("status");
    state = "behind";

    await userEvent.click(screen.getByRole("button", { name: "check the source again" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("source has changes"));
  });
});
