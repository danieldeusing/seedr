import { describe, expect, test } from "vitest";
import type { RunOutcome } from "@/api/agent";
import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { adapterFor, jsonCandidates, summariseInput } from "./adapters";

/** Every invocation names the checkout it is for; only opencode has to be told twice. */
const REPO = "/checkout";

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({ taskId: "t", status: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 1, ...over });

describe("adapters", () => {
  test("every canonical agent is driven non-interactively, and the prompt always reaches it", () => {
    for (const agent of CANONICAL_AGENTS) {
      const adapter = adapterFor(agent);
      expect(adapter.program).toBeTruthy();
      for (const invocation of [adapter.draft("PROMPT", REPO), adapter.job("PROMPT", ["read"], REPO)]) {
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
    expect(adapterFor("claude").draft("p", REPO).args).toEqual(expect.arrayContaining(["--tools", "", "--max-turns", "1"]));
    expect(adapterFor("claude").job("p", ["read", "shell:git"], REPO).args.at(-1)).toBe("Read,Bash(git:*)");
    // The same capabilities, spelled in Copilot's own tool names — asking it for
    // `Read` or `Bash(git:*)` would allow nothing at all.
    expect(adapterFor("copilot").job("p", ["read", "edit", "shell:git"], REPO).args).toEqual(
      expect.arrayContaining(["--allow-tool", "view", "--allow-tool", "create", "--allow-tool", "edit", "--allow-tool", "shell(git:*)"])
    );
    expect(adapterFor("copilot").job("p", [], REPO).stdin).toBeUndefined();
    // Codex has no allowlist: its sandbox is the boundary, and it widens only
    // for a job that actually changes something.
    expect(adapterFor("codex").draft("p", REPO).args).toEqual(expect.arrayContaining(["-s", "read-only"]));
    expect(adapterFor("codex").job("p", ["edit"], REPO).args).toEqual(expect.arrayContaining(["-s", "workspace-write"]));
    expect(adapterFor("codex").job("p", ["read"], REPO).args).toEqual(expect.arrayContaining(["-s", "read-only"]));
    expect(adapterFor("antigravity").job("p", ["read"], REPO).args).toEqual(expect.arrayContaining(["--mode", "plan"]));
    // agy's -p is a value flag: bare, it takes the next argument as the prompt.
    expect(adapterFor("antigravity").draft("p", REPO).args[0]).toBe("--print=p");
    expect(adapterFor("antigravity").draft("p", REPO).args).not.toContain("-p");
    // agy auto-denies commands in print mode; --mode accept-edits does not cover
    // them, and it has no deny-list, so this is the flag it asks for by name.
    expect(adapterFor("antigravity").job("p", ["edit"], REPO).args).toContain("--dangerously-skip-permissions");
  });

  test("a draft asks for a schema only where the schema binds the answer", () => {
    const claude = adapterFor("claude");
    expect(claude.schemaEnforced).toBe(true);
    const args = claude.draft("p", REPO).args;
    expect(args).toContain("--json-schema");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1] ?? "{}")).toMatchObject({ type: "object" });

    // Everyone else answers as text and the same validator judges it. agy has a
    // --json-schema flag, but it shapes the tool result rather than the answer:
    // asking for one got back a summary of the work instead of the work.
    for (const agent of ["antigravity", "copilot", "codex", "opencode"] as const) {
      expect(adapterFor(agent).schemaEnforced).toBe(false);
      expect(adapterFor(agent).draft("p", REPO).args).not.toContain("--json-schema");
    }
  });

  test("Claude-style streams read as turns; plain agents read as lines", () => {
    const claude = adapterFor("claude");
    expect(claude.readLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "a.ts" } }] } }))).toEqual([{ kind: "tool", text: "Read", detail: "a.ts" }]);
    expect(claude.readOutcome(outcome({ stdout: JSON.stringify({ type: "result", is_error: false, result: "done" }) }))).toEqual({ ok: true, text: "done", denials: [] });

    const codex = adapterFor("codex");
    expect(codex.readLine("thinking about it")).toEqual([{ kind: "text", text: "thinking about it" }]);
    expect(codex.readLine("   ")).toEqual([]);
    expect(codex.readOutcome(outcome({ stdout: "all done\n" }))).toEqual({ ok: true, text: "all done", denials: [] });
    expect(codex.readOutcome(outcome({ status: "failed", exitCode: 1, stderr: "nope" }))).toEqual({ ok: false, text: "nope", denials: [] });
  });

  test("codex: its own events, so a command and a sentence are not the same thing", () => {
    const codex = adapterFor("codex");
    // Real envelopes, from running `codex exec --json`.
    expect(codex.readLine('{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"It printed hello"}}')).toEqual([
      { kind: "markdown", text: "It printed hello" },
    ]);
    expect(codex.readLine('{"type":"item.started","item":{"type":"command_execution","command":"/bin/zsh -lc \'echo hello\'","status":"in_progress"}}')).toEqual([
      { kind: "tool", text: "bash", detail: "/bin/zsh -lc 'echo hello'" },
    ]);
    // The envelopes around a turn say nothing a reader needs.
    expect(codex.readLine('{"type":"turn.started"}')).toEqual([]);
    expect(codex.readLine('{"type":"thread.started","thread_id":"x"}')).toEqual([]);
    // Its stderr is not JSON, and a broken MCP server writes real failures there.
    expect(codex.readLine("ERROR rmcp::transport::worker: worker quit")).toEqual([{ kind: "text", text: "ERROR rmcp::transport::worker: worker quit" }]);

    // `--json` is asked for only where the reader expects it.
    expect(codex.job("p", ["edit"], REPO).args).toContain("--json");
    expect(codex.draft("p", REPO).args).not.toContain("--json");
  });

  test("codex: the verdict is the last thing it said, in either output shape", () => {
    const codex = adapterFor("codex");
    const jsonl = [
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"ADDED skill/pdf"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1}}',
    ].join("\n");
    expect(codex.readOutcome(outcome({ stdout: jsonl }))).toEqual({ ok: true, text: "ADDED skill/pdf", denials: [] });
    // A draft still answers as plain text, and is still read that way.
    expect(codex.readOutcome(outcome({ stdout: "just text" })).text).toBe("just text");
  });

  test("opencode: its own events, tool calls named and results dropped", () => {
    const opencode = adapterFor("opencode");
    // Real envelopes, from running `opencode run --format json`.
    expect(opencode.readLine('{"type":"text","part":{"type":"text","text":"It printed hello."}}')).toEqual([{ kind: "markdown", text: "It printed hello." }]);
    expect(
      opencode.readLine('{"type":"tool_use","part":{"type":"tool","tool":"bash","state":{"status":"completed","input":{"command":"echo hello"},"output":"hello\\n","title":"echo hello"}}}')
    ).toEqual([{ kind: "tool", text: "bash", detail: "echo hello" }]);
    // The step envelopes, and the command's own output, are not shown.
    expect(opencode.readLine('{"type":"step_start","part":{"type":"step-start"}}')).toEqual([]);
    expect(opencode.readLine('{"type":"step_finish","part":{"type":"step-finish","tokens":{"total":12463}}}')).toEqual([]);
    expect(opencode.job("p", ["shell"], REPO).args).toEqual(expect.arrayContaining(["--format", "json"]));
    expect(opencode.draft("p", REPO).args).not.toContain("--format");
  });

  test("copilot: the turn, not the token-by-token deltas", () => {
    const copilot = adapterFor("copilot");
    // Almost every line it prints is `ephemeral` — a fragment of a tool
    // argument at a time — and none of them belong on screen.
    expect(copilot.readLine('{"type":"assistant.tool_call_delta","data":{"toolName":"bash","inputDelta":"{\\"comm"},"ephemeral":true}')).toEqual([]);
    expect(copilot.readLine('{"type":"assistant.message","data":{"content":"It printed \\"hello\\"."}}')).toEqual([{ kind: "markdown", text: 'It printed "hello".' }]);
    expect(copilot.readLine('{"type":"tool.execution_start","data":{"toolName":"bash","arguments":{"command":"echo hello"}}}')).toEqual([{ kind: "tool", text: "bash", detail: "echo hello" }]);
    // The result is the part that fills a screen.
    expect(copilot.readLine('{"type":"tool.execution_complete","data":{"toolName":"bash","result":{"content":"hello"}}}')).toEqual([]);
    // A turn that only asked for a tool says nothing.
    expect(copilot.readLine('{"type":"assistant.message","data":{"content":""}}')).toEqual([]);
    expect(copilot.job("p", ["shell"], REPO).args).toEqual(expect.arrayContaining(["--output-format", "json"]));
    expect(copilot.draft("p", REPO).args).not.toContain("--output-format");
  });

  test("a tool call is one short line: the call, never its contents", () => {
    expect(summariseInput({ command: "git status" })).toBe("git status");
    expect(summariseInput({ nothing: 1 })).toBe("");
    expect(summariseInput(null)).toBe("");
    // Long arguments are cut. A log of whole file bodies is not a log.
    expect(summariseInput({ path: "x".repeat(200) })).toHaveLength(72);
    // And a heredoc stays one line, however many the command had.
    expect(summariseInput({ command: "cat <<EOF\nline one\nline two\nEOF" })).toBe("cat <<EOF line one line two EOF");
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

describe("the checkout an agent works in", () => {
  test("every agent is spawned in it, and opencode is also told its name", () => {
    // opencode's shell resets to a project root of its own, so a job aimed at
    // one checkout ran the operations CLI inside another. Nothing else needs
    // the flag, and nothing else may grow one by accident.
    const opencode = adapterFor("opencode").job("p", ["shell"], REPO).args;
    expect(opencode[opencode.indexOf("--dir") + 1]).toBe(REPO);
    expect(adapterFor("opencode").draft("p", REPO).args).toEqual(expect.arrayContaining(["--dir", REPO]));
    for (const agent of CANONICAL_AGENTS.filter((candidate) => candidate !== "opencode")) {
      expect(adapterFor(agent).job("p", ["shell"], REPO).args).not.toContain("--dir");
    }
  });

  test("with no checkout open, the flag is left off rather than passed empty", () => {
    expect(adapterFor("opencode").job("p", ["read"], "").args).not.toContain("--dir");
  });
});

describe("an open shell", () => {
  test("is spelled per CLI, and git is denied alongside it", () => {
    const claude = adapterFor("claude").job("p", ["read", "shell"], REPO).args;
    expect(claude[claude.indexOf("--allowedTools") + 1]).toBe("Read,Bash");
    expect(claude).toEqual(expect.arrayContaining(["--disallowedTools", "Bash(git:*)"]));

    // Copilot's per-tool names cannot be trusted — it lists `bash` and permits
    // `shell`, lists `create` and refuses it — so an open shell takes the flag
    // its help calls required for non-interactive mode, with git denied.
    const copilot = adapterFor("copilot").job("p", ["edit", "shell"], REPO).args;
    expect(copilot).toEqual(expect.arrayContaining(["--allow-all-tools", "--deny-tool", "shell(git:*)"]));
  });

  test("a job that names only specific commands gets no blanket denial", () => {
    const publish = adapterFor("claude").job("p", ["read", "shell:git"], REPO).args;
    expect(publish[publish.indexOf("--allowedTools") + 1]).toBe("Read,Bash(git:*)");
    // Denying git here would contradict the one job that exists to run it.
    expect(publish).not.toContain("--disallowedTools");
  });

  test("opencode takes its headless grant, and only for a job", () => {
    // Its own scratch is the problem: inside the checkout it dirties the
    // worktree the transaction requires clean, outside it opencode auto-rejects.
    expect(adapterFor("opencode").job("p", ["shell"], REPO).args).toContain("--auto");
    expect(adapterFor("opencode").draft("p", REPO).args).not.toContain("--auto");
  });

  test("an open shell counts as changing things, for the CLIs that only answer that", () => {
    expect(adapterFor("codex").job("p", ["shell"], REPO).args).toEqual(expect.arrayContaining(["-s", "workspace-write"]));
    expect(adapterFor("antigravity").job("p", ["shell"], REPO).args).toContain("--dangerously-skip-permissions");
  });
});
