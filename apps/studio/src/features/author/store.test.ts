import { beforeEach, describe, expect, test } from "vitest";
import type { RunRequest } from "@/api/agent";
import { emit, invoke, onCommand } from "@/test/mockIpc";
import { emptyForm, formProblems, toOp, useAuthor } from "./store";

const LONG = "Reads `item.json` files and " + "checks every description carefully ".repeat(10);
const HELP = "--output-format --json-schema --max-turns";
const PROBE_OK = { available: true, version: "2.1.226", diagnostic: null };

/** Scripts the host's `run_process` by program+args, recording every request. */
function scriptHost(answers: Record<string, (request: RunRequest) => Partial<import("@/api/agent").RunOutcome>>) {
  const requests: RunRequest[] = [];
  onCommand("run_process", (args) => {
    const request = args?.request as RunRequest;
    requests.push(request);
    const key = `${request.program} ${request.args[0]} ${request.args[1] ?? ""}`.trim();
    const answer = Object.entries(answers).find(([pattern]) => key.startsWith(pattern))?.[1];
    return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 1, ...(answer ? answer(request) : { status: "failed", stderr: `unscripted: ${key}` }) };
  });
  return requests;
}

const identity = { owner: "acme", repo: "seedr", defaultBranch: "main", authorName: "Acme Bot", remoteUrl: "x", externalUrlTemplate: null };
const draftEnvelope = JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { description: "Fills PDF forms.", longDescription: LONG } });

beforeEach(() => {
  useAuthor.getState().reset();
  onCommand("cancel_process", () => true);
});

describe("toOp / formProblems", () => {
  test("builds the add-local op the CLI expects and reports what the validator would refuse", () => {
    const form = { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", description: "Fills forms.", longDescription: LONG, authorName: "Me", targetScope: "project" as const };
    expect(toOp(form)).toMatchObject({ v: 1, kind: "add-local", type: "skill", slug: "pdf", sourcePath: "/src/pdf", author: { name: "Me" }, targetScope: "project" });
    expect(toOp(form).externalUrl).toBeUndefined();
    expect(formProblems(form)).toEqual([]);

    const bad = { ...form, sourcePath: "", slug: "Bad Slug", longDescription: "short" };
    expect(formProblems(bad).map((p) => p.field)).toEqual(["sourcePath", "slug", "longDescription"]);
  });
});

describe("useAuthor", () => {
  test("prepare probes Claude and prefills the author from the repo identity", async () => {
    scriptHost({
      "claude --version": () => ({ stdout: "2.1.226 (Claude Code)" }),
      "claude --help": () => ({ stdout: HELP }),
      "npx tsx scripts/registry-op.ts": (request) => (request.args.includes("identity") ? { stdout: JSON.stringify(identity) } : {}),
    });
    await useAuthor.getState().prepare();
    const state = useAuthor.getState();
    expect(state.probe).toEqual(PROBE_OK);
    expect(state.form.authorName).toBe("Acme Bot");
    expect(state.form.authorUrl).toBe("https://github.com/acme");
  });

  test("chooseSource derives slug and name from the picked folder", async () => {
    onCommand("pick_path", () => "/Users/me/.claude/skills/fill-pdf_forms");
    await useAuthor.getState().chooseSource();
    expect(useAuthor.getState().form).toMatchObject({ sourcePath: "/Users/me/.claude/skills/fill-pdf_forms", slug: "fill-pdf_forms", name: "Fill Pdf Forms" });
  });

  test("draft reads the source through the host, asks Claude with the prompt on stdin, and fills the descriptions", async () => {
    useAuthor.setState({ probe: PROBE_OK, form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF" } });
    onCommand("read_source_files", () => ({ files: { "SKILL.md": "# PDF" }, skipped: [] }));
    const requests = scriptHost({ "claude -p": () => ({ stdout: draftEnvelope }) });

    await useAuthor.getState().draft();

    expect(useAuthor.getState().form.description).toBe("Fills PDF forms.");
    expect(useAuthor.getState().draftErrors).toEqual([]);
    expect(requests[0]?.stdin).toContain("### SKILL.md");
    expect(requests[0]?.args).toContain("--max-turns");
  });

  test("draft without an available agent or a source explains itself", async () => {
    useAuthor.setState({ probe: { available: false, version: null, diagnostic: "Claude Code is not installed" } });
    await useAuthor.getState().draft();
    expect(useAuthor.getState().draftErrors).toEqual(["Claude Code is not installed"]);

    useAuthor.setState({ probe: PROBE_OK });
    await useAuthor.getState().draft();
    expect(useAuthor.getState().draftErrors).toEqual(["choose the source first"]);
  });

  test("streamed agent output lands in the log while drafting", async () => {
    useAuthor.setState({ probe: PROBE_OK, form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF" } });
    onCommand("read_source_files", () => ({ files: {}, skipped: [] }));
    scriptHost({
      "claude -p": () => {
        emit("process-output", { taskId: "author-draft-0", stream: "stderr", line: "thinking…" });
        return { stdout: draftEnvelope };
      },
    });
    await useAuthor.getState().draft();
    expect(useAuthor.getState().log).toEqual(["thinking…"]);
  });

  test("apply refuses an invalid form, runs a valid one through the CLI transaction, and reports the result", async () => {
    await useAuthor.getState().apply();
    expect(useAuthor.getState().error).toMatch(/fix the highlighted fields/);

    useAuthor.setState({ form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", authorName: "Me", description: "Fills PDF forms.", longDescription: LONG } });
    const requests = scriptHost({
      "npx tsx scripts/registry-op.ts": () => ({
        stdout: JSON.stringify({ ok: true, kind: "add-local", type: "skill", slug: "pdf", item: {}, changedPaths: ["registry/skills/pdf/item.json"], headBefore: "abc1234def" }),
      }),
    });
    await useAuthor.getState().apply();

    expect(useAuthor.getState().phase).toBe("done");
    expect(useAuthor.getState().outcome?.changedPaths).toEqual(["registry/skills/pdf/item.json"]);
    expect(requests[0]?.args).toEqual(["tsx", "scripts/registry-op.ts", "run", "--op", "-"]);
    expect(JSON.parse(requests[0]?.stdin ?? "{}")).toMatchObject({ v: 1, kind: "add-local", slug: "pdf" });
  });

  test("a refused transaction surfaces the CLI's reason and returns to idle", async () => {
    useAuthor.setState({ form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", authorName: "Me", description: "Fills PDF forms.", longDescription: LONG } });
    scriptHost({ "npx tsx scripts/registry-op.ts": () => ({ status: "failed", exitCode: 1, stderr: "registry-op: The worktree has uncommitted changes" }) });
    await useAuthor.getState().apply();
    expect(useAuthor.getState().phase).toBe("idle");
    expect(useAuthor.getState().error).toMatch(/uncommitted changes/);
  });

  test("cancel kills the draft's process ids", async () => {
    useAuthor.setState({ phase: "drafting" });
    await useAuthor.getState().cancel();
    expect(invoke).toHaveBeenCalledWith("cancel_process", { taskId: "author-draft-0" });
    expect(invoke).toHaveBeenCalledWith("cancel_process", { taskId: "author-draft-1" });
  });
});
