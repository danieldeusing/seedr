import { describe, expect, test } from "vitest";
import type { RunOutcome } from "@/api/agent";
import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { adapterFor, jsonCandidates, summariseInput } from "./adapters";

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({ taskId: "t", status: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 1, ...over });

describe("adapters", () => {
  test("every canonical agent is driven non-interactively, and the prompt always reaches it", () => {
    for (const agent of CANONICAL_AGENTS) {
      const adapter = adapterFor(agent);
      expect(adapter.program).toBeTruthy();
      for (const invocation of [adapter.draft("PROMPT"), adapter.job("PROMPT", ["Read"])]) {
        // Non-interactive, always: no adapter may open a terminal session.
        expect(invocation.args.join(" ")).toMatch(/-p\b|--print|exec|run/);
        // The prompt is either on stdin or somewhere in argv — never dropped,
        // which is exactly how `agy -p` silently ran the wrong thing.
        const inArgs = invocation.args.some((argument) => argument.includes("PROMPT"));
        expect(invocation.stdin === "PROMPT" || inArgs).toBe(true);
      }
    }
  });

  test("the tool boundary is spelled the way each CLI spells it", () => {
    expect(adapterFor("claude").draft("p").args).toEqual(expect.arrayContaining(["--tools", "", "--max-turns", "1"]));
    expect(adapterFor("claude").job("p", ["Read", "Bash(git:*)"]).args.at(-1)).toBe("Read,Bash(git:*)");
    // Copilot allows tools one flag at a time, and takes the prompt on argv.
    expect(adapterFor("copilot").job("p", ["Read", "Edit"]).args).toEqual(expect.arrayContaining(["--allow-tool", "Read", "--allow-tool", "Edit"]));
    expect(adapterFor("copilot").job("p", []).stdin).toBeUndefined();
    // Codex has no allowlist: its sandbox is the boundary, read-only for a draft.
    expect(adapterFor("codex").draft("p").args).toEqual(expect.arrayContaining(["-s", "read-only"]));
    expect(adapterFor("codex").job("p", []).args).toEqual(expect.arrayContaining(["-s", "workspace-write"]));
    // agy's -p is a value flag: bare, it takes the next argument as the prompt.
    expect(adapterFor("antigravity").draft("p").args[0]).toBe("--print=p");
    expect(adapterFor("antigravity").draft("p").args).not.toContain("-p");
    expect(adapterFor("antigravity").job("p", []).args).toEqual(expect.arrayContaining(["--mode", "accept-edits"]));
  });

  test("a draft asks for a schema only where the schema binds the answer", () => {
    const claude = adapterFor("claude");
    expect(claude.schemaEnforced).toBe(true);
    const args = claude.draft("p").args;
    expect(args).toContain("--json-schema");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1] ?? "{}")).toMatchObject({ type: "object" });

    // Everyone else answers as text and the same validator judges it. agy has a
    // --json-schema flag, but it shapes the tool result rather than the answer:
    // asking for one got back a summary of the work instead of the work.
    for (const agent of ["antigravity", "copilot", "codex", "opencode"] as const) {
      expect(adapterFor(agent).schemaEnforced).toBe(false);
      expect(adapterFor(agent).draft("p").args).not.toContain("--json-schema");
    }
  });

  test("Claude-style streams read as turns; plain agents read as lines", () => {
    const claude = adapterFor("claude");
    expect(claude.readLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "a.ts" } }] } }))).toEqual([{ kind: "tool", text: "Read a.ts" }]);
    expect(claude.readOutcome(outcome({ stdout: JSON.stringify({ type: "result", is_error: false, result: "done" }) }))).toEqual({ ok: true, text: "done", denials: [] });

    const codex = adapterFor("codex");
    expect(codex.readLine("thinking about it")).toEqual([{ kind: "text", text: "thinking about it" }]);
    expect(codex.readLine("   ")).toEqual([]);
    expect(codex.readOutcome(outcome({ stdout: "all done\n" }))).toEqual({ ok: true, text: "all done", denials: [] });
    expect(codex.readOutcome(outcome({ status: "failed", exitCode: 1, stderr: "nope" }))).toEqual({ ok: false, text: "nope", denials: [] });
  });

  test("a tool call is named by its most telling argument", () => {
    expect(summariseInput({ command: "git status" })).toBe("git status");
    expect(summariseInput({ nothing: 1 })).toBe("");
    expect(summariseInput(null)).toBe("");
    expect(summariseInput({ path: "x".repeat(200) })).toHaveLength(118);
  });
});

  // The real envelope from agy 1.1.11, trimmed: the answer is inside `response`,
  // and the object after it is agy summarising its own work. Trusting the last
  // object — or agy's own `structured_output` — would store the summary as the
  // item's description.
  const AGY = JSON.stringify({
    conversation_id: "f322408e",
    status: "SUCCESS",
    response:
      '{"description":"Formats, parses and converts dates across locales and time zones.","longDescription":"A skill for every date and time job: parsing ISO 8601, RFC 2822 and Unix timestamps, converting between time zones with daylight saving handled, relative phrasing such as two hours ago, and formatting with the usual pattern tokens."}\n' +
      '{"description":"Provided JSON descriptions for a date formatting skill.","longDescription":"Successfully generated and returned valid JSON containing both descriptions."}\n',
    structured_output: { description: "Provided JSON descriptions for a date formatting skill.", longDescription: "Successfully generated and returned valid JSON." },
  });

  test("agy: the run is read from its own envelope, and the answer beats the summary", () => {
    const agy = adapterFor("antigravity");
    const verdict = agy.readOutcome(outcome({ stdout: AGY }));
    expect(verdict.ok).toBe(true);

    const candidates = jsonCandidates(verdict.text);
    expect(candidates).toHaveLength(2);
    expect(JSON.parse(candidates[0] ?? "{}").description).toMatch(/^Formats, parses/);
    // The summary is the one the 30-word TL;DR rule throws out.
    expect(JSON.parse(candidates[1] ?? "{}").longDescription.split(/\s+/).length).toBeLessThan(30);
  });

  test("agy: a stream-json run reads its events and its final result", () => {
    const agy = adapterFor("antigravity");
    expect(agy.readLine(JSON.stringify({ event: "init", init: { permission_mode: "request-review", tools: [1, 2, 3] } }))).toEqual([{ kind: "system", text: "session started · request-review · 3 tools" }]);
    expect(agy.readLine(JSON.stringify({ event: "step_update", step_update: { step_type: "agent_response", state: "ACTIVE", text_delta: "pong" } }))).toEqual([{ kind: "text", text: "pong" }]);
    expect(agy.readLine(JSON.stringify({ event: "step_update", step_update: { step_type: "run_command", state: "ACTIVE" } }))).toEqual([{ kind: "tool", text: "run_command" }]);
    expect(agy.readOutcome(outcome({ stdout: JSON.stringify({ event: "result", result: { status: "FAILED", response: "denied" } }) }))).toEqual({ ok: false, text: "denied", denials: [] });
  });

describe("jsonCandidates", () => {
  // Real framing, from running the CLIs: codex echoes the prompt and prints the
  // answer twice around a token count, copilot appends a credits footer, and
  // opencode leads with a session banner.
  const first = (text: string) => jsonCandidates(text)[0] ?? null;
  const ANSWER = '{"description":"Formats dates.","longDescription":"Long enough."}';

  test("takes the answer out of whatever the agent wrapped it in", () => {
    expect(first(`user\nAnswer with JSON only\n\ncodex\n${ANSWER}\ntokens used\n16,433\n${ANSWER}`)).toBe(ANSWER);
    expect(first(`${ANSWER}\n\n\nChanges    +0 -0\nAI Credits 7.3 (6s)\nTokens     up 28.9k`)).toBe(ANSWER);
    expect(first(`> build - big-pickle\n${ANSWER}`)).toBe(ANSWER);
  });

  test("returns them in order, so the caller can validate the first that fits", () => {
    const summary = '{"description":"Did the thing.","longDescription":"Too short to be a TL;DR."}';
    expect(jsonCandidates(`${ANSWER}\n${summary}`)).toEqual([ANSWER, summary]);
  });

  test("keeps braces inside strings out of it, and gives up cleanly", () => {
    const tricky = '{"description":"Uses {curly} braces \\" and quotes","longDescription":"ok"}';
    expect(first(`noise ${tricky} more`)).toBe(tricky);
    expect(jsonCandidates("no json here")).toEqual([]);
    expect(jsonCandidates("{ not json at all ")).toEqual([]);
  });
});
