import { describe, expect, test } from "vitest";
import { emit, onCommand } from "@/test/mockIpc";
import type { RunRequest } from "./agent";
import { agentJobArgs, jobResult, parseStreamLine, runAgentJob, type AgentJobEvent } from "./agentJob";

const outcome = (over: Partial<Awaited<ReturnType<typeof runAgentJob>>> & Record<string, unknown> = {}) => ({
  taskId: "t",
  status: "ok" as const,
  exitCode: 0,
  stdout: "",
  stderr: "",
  durationMs: 1,
  ...over,
});

describe("parseStreamLine", () => {
  test("turns the init, the assistant turns and a failure into readable lines", () => {
    expect(parseStreamLine(JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5", permissionMode: "default" }))).toEqual([
      { kind: "system", text: "session started · claude-opus-5 · default" },
    ]);
    expect(
      parseStreamLine(
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: " reading the repo " }, { type: "tool_use", name: "Bash", input: { command: "npx tsx scripts/registry-op.ts run" } }] },
        })
      )
    ).toEqual([
      { kind: "text", text: "reading the repo" },
      { kind: "tool", text: "Bash npx tsx scripts/registry-op.ts run" },
    ]);
    expect(parseStreamLine(JSON.stringify({ type: "result", is_error: true, result: "no" }))).toEqual([{ kind: "error", text: "no" }]);
  });

  test("keeps anything that is not stream JSON, and drops the noise", () => {
    expect(parseStreamLine("npm warn: something")).toEqual([{ kind: "system", text: "npm warn: something" }]);
    expect(parseStreamLine("   ")).toEqual([]);
    expect(parseStreamLine(JSON.stringify({ type: "user", message: { content: [] } }))).toEqual([]);
  });

  test("names a tool by its most telling argument, capped", () => {
    const long = "x".repeat(200);
    expect(parseStreamLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: long } }] } }))[0]?.text).toBe(`Read ${long.slice(0, 117)}…`);
    expect(parseStreamLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: {} }] } }))).toEqual([{ kind: "tool", text: "Skill" }]);
  });
});

describe("jobResult", () => {
  test("reads the last result envelope, past the events before it", () => {
    const stdout = [JSON.stringify({ type: "system", subtype: "init" }), JSON.stringify({ type: "result", is_error: false, result: "ADDED skill/pdf" })].join("\n");
    expect(jobResult(outcome({ stdout }))).toEqual({ ok: true, text: "ADDED skill/pdf", denials: [] });
  });

  test("reports a refused tool and a failed run", () => {
    const stdout = JSON.stringify({ type: "result", is_error: true, result: "blocked", permission_denials: [{ tool_name: "Bash" }] });
    expect(jobResult(outcome({ stdout, status: "failed", exitCode: 1 }))).toEqual({ ok: false, text: "blocked", denials: ["Bash"] });
    expect(jobResult(outcome({ status: "timeout" }))).toEqual({ ok: false, text: "the agent run timeout", denials: [] });
    expect(jobResult(outcome({ status: "failed", exitCode: 2, stderr: "boom" }))).toEqual({ ok: false, text: "boom", denials: [] });
  });
});

describe("runAgentJob", () => {
  test("allows exactly the named tools, sends the prompt on stdin, and streams what happens", async () => {
    let request: RunRequest | undefined;
    onCommand("run_process", (args) => {
      request = (args as { request: RunRequest }).request;
      emit("process-output", { taskId: request.taskId, stream: "stdout", line: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "working" }] } }) });
      return outcome({ stdout: JSON.stringify({ type: "result", is_error: false, result: "done" }) });
    });

    const events: AgentJobEvent[] = [];
    const result = await runAgentJob({ taskId: "job-1", prompt: "do it", allowedTools: ["Read", "Bash(git status:*)"], onEvent: (event) => events.push(event) });

    expect(result).toEqual({ ok: true, text: "done", denials: [] });
    expect(request?.args).toEqual(agentJobArgs(["Read", "Bash(git status:*)"]));
    expect(request?.args).toContain("Read,Bash(git status:*)");
    expect(request?.stdin).toBe("do it");
    expect(request?.cwd).toBe("");
    expect(events).toEqual([{ kind: "text", text: "working" }]);
  });
});
