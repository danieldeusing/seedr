import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import type { RunRequest } from "@/api/agent";
import { fs } from "@/api/fs";
import { mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { removalRefusal, useMutations } from "./mutations";
import { loadRegistry } from "./registry";
import { Detail } from "./Detail";
import { RemoveButton } from "./RemoveButton";

const ok = (request: RunRequest, stdout: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });

beforeEach(() => {
  useMutations.getState().reset();
});

describe("a refusal for a dirty worktree", () => {
  test("says what was refused, and marks the removal as one git can unblock", async () => {
    // The refusal is not fussiness: a rollback is `git checkout` plus
    // `git clean -fdqx` over the registry directory, so uncommitted work there
    // would be destroyed by an operation that failed.
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const item = items.find((i) => i.slug === "playwright")!;

    onCommand("run_process", (args) => {
      const request = args?.request as RunRequest;
      // Arming reads the hash and must succeed; the transaction is what refuses;
      // git is then asked what is dirty.
      if (request.args.includes("hash")) return ok(request, JSON.stringify({ type: "mcp", slug: "playwright", hash: "48761aa0e888b3ae" }));
      if (request.program === "git" && request.args.includes("status")) return ok(request, " M registry/skills/pdf/SKILL.md\0?? scratch-notes.txt\0");
      if (request.program === "git") return ok(request, "main\n");
      // status "failed", not "ok" with a non-zero exit: that is how the host
      // reports a CLI that did not succeed, and it is what carries stderr through.
      return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: "registry-op: The worktree has uncommitted changes; commit or stash them first", durationMs: 1 };
    });

    render(<Detail item={item} />);
    await userEvent.click(await screen.findByRole("button", { name: `remove ${item.slug}` }));
    await userEvent.click(await screen.findByRole("button", { name: `confirm remove ${item.type}/${item.slug}` }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The worktree has uncommitted changes");
    // Marked as blocked, which is what opens the git dialog — the paths and the
    // commit live there, from git, rather than being copied onto this page.
    expect(useMutations.getState().blocked).toBe(item);
  });

  test("any other failure is left as its own sentence, with no path list", async () => {
    // Only the dirty-worktree refusal has paths to name; asking git after every
    // failure would spend a process to answer a question nobody asked.
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    render(<Detail item={items.find((i) => i.slug === "pdf")!} />);
    act(() => useMutations.setState({ error: "registry-op: something else went wrong", blocked: null }));

    expect(await screen.findByRole("alert")).toHaveTextContent("something else went wrong");
  });
});

describe("where a failure is shown", () => {
  test("on its own line under the buttons, not inside their row", async () => {
    // The message is a sentence — "commit or stash them first" — and beside the
    // buttons it stretched the header and pushed them around.
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    render(<Detail item={items.find((i) => i.slug === "pdf")!} />);
    // After render: RemoveButton clears the store on mount, so a fresh item
    // never inherits the previous one's failure.
    act(() => useMutations.setState({ error: "registry-op: The worktree has uncommitted changes" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The worktree has uncommitted changes");
    // The row holds the controls in a span; the message is not inside it.
    expect(alert.closest("span")).toBeNull();
    expect(alert.tagName).toBe("P");
  });
});

describe("remove", () => {
  test("official items are refused before any process runs", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const pdf = items.find((i) => i.slug === "pdf")!;
    expect(removalRefusal(pdf)).toMatch(/official items cannot be removed/);
    await useMutations.getState().remove(pdf);
    expect(useMutations.getState().error).toMatch(/official items cannot be removed/);
  });

  test("captures the hash when armed, then runs the remove transaction with it", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const playwright = items.find((i) => i.slug === "playwright")!;
    const requests: RunRequest[] = [];
    onCommand("run_process", (args) => {
      const request = args?.request as RunRequest;
      requests.push(request);
      if (request.args.includes("hash")) return ok(request, JSON.stringify({ type: "mcp", slug: "playwright", hash: "48761aa0e888b3ae" }));
      return ok(request, JSON.stringify({ ok: true, kind: "remove", type: "mcp", slug: "playwright", item: null, changedPaths: ["registry/mcp/playwright/item.json"], headBefore: "abc" }));
    });

    await useMutations.getState().arm(playwright);
    await useMutations.getState().remove(playwright);

    expect(useMutations.getState().phase).toBe("done");
    expect(requests[0]?.args).toEqual(["tsx", "scripts/registry-op.ts", "hash", "mcp", "playwright"]);
    expect(JSON.parse(requests[1]?.stdin ?? "{}")).toEqual({ v: 1, kind: "remove", type: "mcp", slug: "playwright", sourceType: "seedr", expectedHash: "48761aa0e888b3ae" });
  });

  test("a refused transaction is shown and the phase returns to idle", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const playwright = items.find((i) => i.slug === "playwright")!;
    onCommand("run_process", (args) => {
      const request = args?.request as RunRequest;
      if (request.args.includes("hash")) return ok(request, JSON.stringify({ hash: "stale" }));
      return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: 'registry-op: mcp "playwright" changed since it was read', durationMs: 1 };
    });
    await useMutations.getState().arm(playwright);
    await useMutations.getState().remove(playwright);
    expect(useMutations.getState().phase).toBe("idle");
    expect(useMutations.getState().error).toMatch(/changed since it was read/);
  });
});

describe("RemoveButton", () => {
  test("arms on the first press, runs on confirm, and can be disarmed", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const playwright = items.find((i) => i.slug === "playwright")!;
    const requests: RunRequest[] = [];
    onCommand("run_process", (args) => {
      const request = args?.request as RunRequest;
      requests.push(request);
      return ok(request, request.args.includes("hash") ? JSON.stringify({ hash: "h" }) : JSON.stringify({ ok: true, kind: "remove", type: "mcp", slug: "playwright", item: null, changedPaths: [], headBefore: "abc" }));
    });
    render(<RemoveButton item={playwright} />);

    await userEvent.click(screen.getByRole("button", { name: "remove playwright" }));
    await userEvent.click(screen.getByRole("button", { name: "keep" }));
    // arming captures the item's hash; nothing has run
    expect(requests.map((r) => r.args[2])).toEqual(["hash"]);

    await userEvent.click(screen.getByRole("button", { name: "remove playwright" }));
    await userEvent.click(screen.getByRole("button", { name: "confirm remove mcp/playwright" }));
    expect(requests.map((r) => r.args[2])).toEqual(["hash", "hash", "run"]);
    expect(await screen.findByRole("status")).toHaveTextContent("removed");
  });

  test("is disabled, with the reason in the hover and the accessible name", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    render(<RemoveButton item={items.find((i) => i.slug === "pdf")!} />);
    const bin = screen.getByRole("button", { name: /remove pdf — official items cannot be removed/ });
    expect(bin).toBeDisabled();
    expect(bin.closest("[data-tip]")).toHaveAttribute("data-tip", expect.stringContaining("daily sync would restore"));
  });
});

describe("finishing a removal a dirty worktree blocked", () => {
  const dirtyHost = (statusByCall: string[]) => {
    let call = 0;
    const requests: RunRequest[] = [];
    onCommand("run_process", (args) => {
      const request = args?.request as RunRequest;
      requests.push(request);
      if (request.args.includes("hash")) return ok(request, JSON.stringify({ hash: "48761aa0e888b3ae" }));
      if (request.program === "git" && request.args.includes("status")) return ok(request, statusByCall[Math.min(call++, statusByCall.length - 1)] ?? "");
      if (request.program === "git") return ok(request, "main\n");
      if (requests.filter((r) => r.program === "npx" && r.args.includes("run")).length === 1) {
        return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: "registry-op: The worktree has uncommitted changes", durationMs: 1 };
      }
      return ok(request, JSON.stringify({ ok: true, kind: "remove", type: "mcp", slug: "playwright", item: null, changedPaths: [], headBefore: "abc" }));
    });
    return requests;
  };

  test("a clean worktree lets the removal finish, without arming it again", async () => {
    // The user already armed and confirmed; being sent to git to commit
    // something unrelated should not cost them that decision.
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const item = items.find((i) => i.slug === "playwright")!;
    dirtyHost([""]);

    await useMutations.getState().arm(item);
    await useMutations.getState().remove(item);
    expect(useMutations.getState().blocked).toBe(item);

    await useMutations.getState().settleBlocked();

    expect(useMutations.getState().phase).toBe("done");
    expect(useMutations.getState().blocked).toBeNull();
  });

  test("a worktree still dirty forgets it, so the removal can be started again", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const item = items.find((i) => i.slug === "playwright")!;
    dirtyHost([" M scratch.txt\0"]);

    await useMutations.getState().arm(item);
    await useMutations.getState().remove(item);
    await useMutations.getState().settleBlocked();

    // Closing git without committing returns the item to a plain, unarmed
    // state rather than leaving a refusal to be cleared by hand.
    expect(useMutations.getState().phase).toBe("idle");
    expect(useMutations.getState().blocked).toBeNull();
    expect(useMutations.getState().error).toBeNull();
    expect(useMutations.getState().armed).toBeNull();
  });

  test("a failure that is not about the worktree leaves nothing to resume", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const item = items.find((i) => i.slug === "playwright")!;
    onCommand("run_process", (args) => {
      const request = args?.request as RunRequest;
      if (request.args.includes("hash")) return ok(request, JSON.stringify({ hash: "48761aa0e888b3ae" }));
      return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: "registry-op: the item changed on disk", durationMs: 1 };
    });

    await useMutations.getState().arm(item);
    await useMutations.getState().remove(item);

    expect(useMutations.getState().blocked).toBeNull();
    expect(useMutations.getState().error).toContain("changed on disk");
  });
});

describe("the button after the git dialog closes", () => {
  test("goes back to the bin, not the confirm and cancel it was left on", async () => {
    // The store forgot the removal but the button kept its own arming state, so
    // the confirm and cancel stayed on screen offering a second step to
    // something no longer under way.
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const item = items.find((i) => i.slug === "playwright")!;
    onCommand("run_process", (args) => {
      const request = args?.request as RunRequest;
      if (request.args.includes("hash")) return ok(request, JSON.stringify({ hash: "48761aa0e888b3ae" }));
      if (request.program === "git") return ok(request, " M scratch.txt\0");
      return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: "registry-op: The worktree has uncommitted changes", durationMs: 1 };
    });

    render(<RemoveButton item={item} />);
    await userEvent.click(screen.getByRole("button", { name: `remove ${item.slug}` }));
    await userEvent.click(await screen.findByRole("button", { name: `confirm remove ${item.type}/${item.slug}` }));

    // Closing git with the worktree still dirty.
    await act(async () => {
      await useMutations.getState().settleBlocked();
    });

    expect(await screen.findByRole("button", { name: `remove ${item.slug}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `confirm remove ${item.type}/${item.slug}` })).toBeNull();
  });
});
