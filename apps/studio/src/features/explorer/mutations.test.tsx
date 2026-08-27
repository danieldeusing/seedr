import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import type { RunRequest } from "@/api/agent";
import { fs } from "@/api/fs";
import { mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { removalRefusal, useMutations } from "./mutations";
import { loadRegistry } from "./registry";
import { RemoveButton } from "./RemoveButton";

const ok = (request: RunRequest, stdout: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });

beforeEach(() => {
  useMutations.getState().reset();
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
