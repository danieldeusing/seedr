import { describe, expect, test, vi } from "vitest";
import type { RunOutcome, RunRequest } from "@/api/agent";
import { claudeDraftArgs, draftWithClaude, normaliseClaudeOutcome, probeClaude } from "./claudeAdapter";
import type { DraftRequest } from "./metadataContract";

const LONG = "Reads `item.json` files and " + "checks every description carefully ".repeat(10);

const outcome = (over: Partial<RunOutcome>): RunOutcome => ({ taskId: "t", status: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 1, ...over });

/** A scripted host: answers in order, records every request. */
function scriptedRun(answers: Partial<RunOutcome>[]) {
  const requests: RunRequest[] = [];
  const run = vi.fn(async (request: RunRequest) => {
    requests.push(request);
    return outcome(answers.shift() ?? { status: "failed", stderr: "no scripted answer" });
  });
  return { run, requests };
}

const HELP = "--output-format <format> ... --json-schema <schema> ... --max-turns <n>";

describe("probeClaude", () => {
  test("enables the adapter only for a new-enough binary with the flags it needs", async () => {
    const { run } = scriptedRun([{ stdout: "2.1.226 (Claude Code)" }, { stdout: HELP }]);
    expect(await probeClaude(run)).toEqual({ available: true, version: "2.1.226", diagnostic: null });
  });

  test("explains what to do when the binary is missing, old, or lacks a flag", async () => {
    expect((await probeClaude(scriptedRun([{ status: "not-found" }]).run)).diagnostic).toMatch(/not installed/);
    expect((await probeClaude(scriptedRun([{ stdout: "1.0.99 (Claude Code)" }]).run)).diagnostic).toMatch(/too old/);
    expect((await probeClaude(scriptedRun([{ stdout: "2.1.226" }, { stdout: "--output-format only" }]).run)).diagnostic).toMatch(/lacks --json-schema/);
    expect((await probeClaude(scriptedRun([{ status: "failed", stderr: "boom" }]).run)).diagnostic).toMatch(/boom/);
  });
});

describe("normaliseClaudeOutcome", () => {
  test("reads the json envelope, preferring structured output", () => {
    const envelope = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "text", structured_output: { a: 1 }, permission_denials: [{}] });
    expect(normaliseClaudeOutcome(outcome({ stdout: envelope }))).toEqual({ status: "ok", text: "text", structured: { a: 1 }, denials: 1 });
  });

  test("maps cancellation, timeout, errors and non-json output without assuming another shape", () => {
    expect(normaliseClaudeOutcome(outcome({ status: "cancelled" })).status).toBe("cancelled");
    expect(normaliseClaudeOutcome(outcome({ status: "timeout" })).status).toBe("timeout");
    expect(normaliseClaudeOutcome(outcome({ stdout: "garbage", exitCode: 1, status: "failed" })).status).toBe("error");
    const error = JSON.stringify({ type: "result", is_error: true, result: "Failed to authenticate" });
    expect(normaliseClaudeOutcome(outcome({ stdout: error }))).toMatchObject({ status: "error", text: "Failed to authenticate" });
  });
});

describe("draftWithClaude", () => {
  const request: DraftRequest = { type: "skill", slug: "pdf", name: "PDF", compatibility: ["claude"], files: { "SKILL.md": "# PDF" } };
  const good = { description: "Reads PDF files.", longDescription: LONG };
  const envelope = (structured: unknown) => JSON.stringify({ type: "result", is_error: false, result: "", structured_output: structured });

  test("sends the prompt on stdin with the bounded, tool-free flags and returns a validated draft", async () => {
    const { run, requests } = scriptedRun([{ stdout: envelope(good) }]);
    const result = await draftWithClaude(request, run);
    expect(result).toEqual({ ok: true, draft: { description: good.description, longDescription: LONG.trim() } });
    expect(requests[0]?.program).toBe("claude");
    expect(requests[0]?.args).toEqual(claudeDraftArgs());
    expect(requests[0]?.args).toContain("--max-turns");
    expect(requests[0]?.stdin).toContain("### SKILL.md");
  });

  test("retries once with the validation error, then fails visibly", async () => {
    const { run, requests } = scriptedRun([{ stdout: envelope({ description: "", longDescription: "x" }) }, { stdout: envelope(good) }]);
    expect((await draftWithClaude(request, run)).ok).toBe(true);
    expect(requests[1]?.stdin).toContain("previous answer was rejected: description is missing");

    const twice = scriptedRun([{ stdout: envelope({ description: "" }) }, { stdout: envelope({ description: "" }) }]);
    const failed = await draftWithClaude(request, twice.run);
    expect(failed).toMatchObject({ ok: false });
    expect(failed.ok ? [] : failed.errors[0]).toBe("the draft was rejected twice");
  });

  test("a failed or cancelled run is reported as such", async () => {
    const { run } = scriptedRun([{ status: "cancelled", stderr: "killed" }]);
    expect(await draftWithClaude(request, run)).toEqual({ ok: false, errors: ["claude cancelled: killed"] });
  });
});
