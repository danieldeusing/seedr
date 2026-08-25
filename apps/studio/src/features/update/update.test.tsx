import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RunRequest } from "@/api/agent";
import { fs } from "@/api/fs";
import { mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { loadRegistry, type StudioItem } from "@/features/explorer/registry";
import { UpdateForm } from "./UpdateForm";
import { formProblems, toPatch, updateRefusal, useUpdate } from "./updateStore";

const LONG = "Reads `item.json` files and " + "checks every description carefully ".repeat(10);
const ok = (request: RunRequest, stdout: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });

async function items(): Promise<{ playwright: StudioItem; pdf: StudioItem }> {
  mockFs(registryFiles());
  const { items } = await loadRegistry(fs);
  return { playwright: items.find((i) => i.slug === "playwright")!, pdf: items.find((i) => i.slug === "pdf")! };
}

/** A host that probes Claude as available, hashes, and accepts the update. */
function host(requests: RunRequest[] = []) {
  onCommand("run_process", (args) => {
    const request = args?.request as RunRequest;
    requests.push(request);
    if (request.program === "claude" && request.args[0] === "--version") return ok(request, "2.1.226");
    if (request.program === "claude" && request.args[0] === "--help") return ok(request, "--output-format --json-schema --tools");
    if (request.program === "claude") return ok(request, JSON.stringify({ type: "result", is_error: false, result: "UPDATED mcp/playwright" }));
    if (request.args.includes("hash")) return ok(request, JSON.stringify({ hash: "abcdef0123456789" }));
    return ok(request, JSON.stringify({ ok: true, kind: "update", type: "mcp", slug: "playwright", item: {}, changedPaths: ["registry/mcp/playwright/item.json", "registry/mcp/manifest.json"], headBefore: "abc1234def" }));
  });
  return requests;
}

beforeEach(() => {
  useUpdate.getState().reset();
  useUpdate.setState({ probe: null });
});

describe("updateStore", () => {
  test("refuses synced items and only patches what changed", async () => {
    const { playwright, pdf } = await items();
    expect(updateRefusal(pdf)).toMatch(/official items are refreshed by the sync/);
    expect(updateRefusal(playwright)).toBeNull();

    const form = { name: "Playwright", prompt: "", refreshMeta: true, label: "", description: "Drives a browser.", longDescription: LONG, compatibility: ["claude" as const], targetScope: "" as const };
    expect(toPatch(playwright, form)).toEqual({});
    expect(toPatch(playwright, { ...form, name: "Playwright MCP", targetScope: "project" })).toEqual({ name: "Playwright MCP", targetScope: "project" });
    expect(formProblems(playwright, { ...form, compatibility: [] }).map((p) => p.field)).toEqual(["compatibility"]);
  });

  test("shows a stored gemini id as antigravity and saves the canonical id", async () => {
    const { playwright } = await items();
    const legacy: StudioItem = { ...playwright, item: { ...playwright.item, compatibility: ["gemini", "claude"] } };
    host();
    await useUpdate.getState().start(legacy);

    expect(useUpdate.getState().form.compatibility).toEqual(["claude", "antigravity"]);
    expect(toPatch(legacy, useUpdate.getState().form)).toEqual({ compatibility: ["claude", "antigravity"] });

    useUpdate.getState().toggleAgent("claude");
    expect(useUpdate.getState().form.compatibility).toEqual(["antigravity"]);
  });

  test("apply reads the hash, runs the update transaction with the patch, and reports", async () => {
    const { playwright } = await items();
    const requests = host();
    await useUpdate.getState().start(playwright);
    useUpdate.getState().setField("name", "Playwright MCP");
    await useUpdate.getState().apply();

    expect(useUpdate.getState().phase).toBe("done");
    const run = requests.find((r) => r.args.includes("run"));
    expect(JSON.parse(run?.stdin ?? "{}")).toEqual({ v: 1, kind: "update", type: "mcp", slug: "playwright", expectedHash: "abcdef0123456789", patch: { name: "Playwright MCP" } });
  });

  test("apply refuses a no-op, an invalid form, and surfaces a rejected transaction", async () => {
    const { playwright } = await items();
    host();
    await useUpdate.getState().start(playwright);
    await useUpdate.getState().apply();
    expect(useUpdate.getState().error).toBe("nothing changed");

    useUpdate.getState().setField("longDescription", "short");
    await useUpdate.getState().apply();
    expect(useUpdate.getState().error).toMatch(/fix the highlighted/);

    useUpdate.getState().setField("longDescription", `${LONG} revised`);
    onCommand("run_process", (args) => {
      const request = args?.request as RunRequest;
      if (request.args.includes("hash")) return ok(request, JSON.stringify({ hash: "x" }));
      return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: "registry-op: The worktree has uncommitted changes", durationMs: 1 };
    });
    await useUpdate.getState().apply();
    expect(useUpdate.getState().phase).toBe("idle");
    expect(useUpdate.getState().error).toMatch(/uncommitted changes/);
  });

  test("a prompt makes it an agent job that carries the metadata edits along", async () => {
    const { playwright } = await items();
    const requests = host();
    await useUpdate.getState().start(playwright);
    useUpdate.setState({ form: { ...useUpdate.getState().form, prompt: "make it handle timeouts", name: "Playwright MCP" } });

    await useUpdate.getState().apply();

    const job = requests.find((request) => request.args.includes("--allowedTools"));
    expect(job?.args.at(-1)).toBe("Read,Write,Edit,Glob,Grep,Skill,Bash(npx tsx scripts/registry-op.ts:*)");
    expect(job?.args.at(-1)).not.toContain("Bash(git");
    expect(job?.stdin).toContain("make it handle timeouts");
    expect(job?.stdin).toContain("- name: Playwright MCP");
    expect(job?.stdin).toContain("rewrite `description`");
    expect(job?.stdin).toContain("UPDATED <type>/<slug>");
    // The transaction is the agent's to run, so Studio does not also run one.
    expect(requests.filter((request) => request.program === "npx" && request.args.includes("run"))).toHaveLength(0);
    expect(useUpdate.getState().phase).toBe("done");
  });

  test("metadata off tells the agent to leave the descriptions alone", async () => {
    const { playwright } = await items();
    const requests = host();
    await useUpdate.getState().start(playwright);
    useUpdate.setState({ form: { ...useUpdate.getState().form, prompt: "tighten the wording", refreshMeta: false, description: "Mine, by hand." } });

    await useUpdate.getState().apply();

    const job = requests.find((request) => request.args.includes("--allowedTools"));
    expect(job?.stdin).toContain("Leave `description` and `longDescription` exactly as they are");
    expect(job?.stdin).not.toContain("- description:");
  });

});

describe("UpdateForm", () => {
  test("edits a first-party item and applies the change", async () => {
    const { playwright } = await items();
    host();
    const onDone = vi.fn();
    render(<UpdateForm item={playwright} onDone={onDone} />);

    const submit = await screen.findByRole("button", { name: "apply 0 changes" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("nothing changed yet")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("name"));
    await userEvent.type(screen.getByLabelText("name"), "Playwright MCP");
    await userEvent.click(screen.getByRole("button", { name: "apply 1 change" }));

    expect(await screen.findByText(/Updated mcp\/playwright at abc1234/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "back to the item" }));
    expect(onDone).toHaveBeenCalled();
  });

  test("a synced item is shown read-only with the reason", async () => {
    const { pdf } = await items();
    host();
    render(<UpdateForm item={pdf} onDone={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/refreshed by the sync/);
    expect(screen.getByLabelText("name")).toBeDisabled();
  });
});
